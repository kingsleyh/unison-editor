import { useEffect, useRef } from 'react';
import { DefinitionCard } from './DefinitionCard';
import { getUCMApiClient } from '../services/ucmApi';
import { useUnisonStore } from '../store/unisonStore';
import type { DefinitionCardState } from '../store/unisonStore';
import { getDefinitionResolver } from '../services/definitionResolver';
import { isHash, normalizeHash } from '../types/navigation';

interface DefinitionStackProps {
  selectedDefinition: { name: string; type: 'term' | 'type'; id: number } | null;
  onAddToScratch: (source: string, name: string) => void;
  /** Called when a definition is loaded/selected (to reveal in tree) */
  onRevealInTree?: (fqn: string, type: 'term' | 'type') => void;
}

/**
 * UCM Desktop-style stacked definition cards
 * Clicking nav items adds cards to the top of the list
 *
 * Core principle: Hash is the canonical ID for deduplication,
 * FQN is used for display and tree navigation.
 */
export function DefinitionStack({
  selectedDefinition,
  onAddToScratch,
  onRevealInTree,
}: DefinitionStackProps) {
  const {
    currentProject,
    currentBranch,
    definitionsVersion,
    definitionCards: cards,
    selectedCardId,
    addDefinitionCard,
    updateDefinitionCard,
    removeDefinitionCard,
    setSelectedCardId,
    getDefinitionCards,
  } = useUnisonStore();

  const client = getUCMApiClient();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const resolver = getDefinitionResolver();

  // Track the last processed selection ID to prevent duplicate processing
  const lastProcessedSelectionIdRef = useRef<number | null>(null);

  /**
   * Find an existing card by identifier (hash or FQN).
   * Uses the resolver cache for hash-based deduplication.
   */
  function findExistingCard(identifier: string): DefinitionCardState | null {
    const currentCards = getDefinitionCards();

    // First check the resolver cache for this identifier
    const cached = resolver.getCached(identifier);

    if (cached) {
      // We have a cached resolution - find card by canonical hash
      const byHash = currentCards.find(c => c.hash === cached.hash);
      if (byHash) return byHash;
    }

    // Fall back to direct comparison
    if (isHash(identifier)) {
      const normalizedHash = normalizeHash(identifier);
      return currentCards.find(c =>
        c.hash === normalizedHash ||
        c.pendingIdentifier === identifier
      ) || null;
    } else {
      // FQN lookup
      return currentCards.find(c =>
        c.fqn === identifier ||
        c.resolved?.fqn === identifier ||
        c.pendingIdentifier === identifier
      ) || null;
    }
  }

  /**
   * Select a card and scroll to it.
   */
  function selectAndScrollToCard(cardId: string) {
    setSelectedCardId(cardId);
    setTimeout(() => {
      const cardElement = cardRefs.current.get(cardId);
      cardElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }

  // When a new definition is selected, add it to the stack or select existing
  useEffect(() => {
    if (!selectedDefinition || !currentProject || !currentBranch) {
      return;
    }

    // Skip if we've already processed this exact selection (prevents duplicate on panel expand)
    if (lastProcessedSelectionIdRef.current === selectedDefinition.id) {
      return;
    }
    lastProcessedSelectionIdRef.current = selectedDefinition.id;

    // Enable tree reveal for all navigation (editor clicks, tree clicks)
    handleNavigation(selectedDefinition.name, selectedDefinition.type, true);
  }, [selectedDefinition]);

  // When definitions version changes (after save to codebase), refresh all open cards
  useEffect(() => {
    if (definitionsVersion === 0 || !currentProject || !currentBranch || cards.length === 0) {
      return;
    }

    // Refresh each card by reloading its definition
    async function refreshAllCards() {
      const currentCards = getDefinitionCards();
      const currentSelectedId = selectedCardId;

      for (const card of currentCards) {
        if (!card.fqn || card.loading) continue;

        try {
          // Re-resolve to get fresh data (cache was already cleared)
          const resolved = await resolver.resolve(
            card.fqn,
            currentProject!.name,
            currentBranch!.name
          );

          if (!resolved) {
            continue;
          }

          // Load fresh definition
          const definition = await client.getDefinition(
            currentProject!.name,
            currentBranch!.name,
            resolved.hash
          );

          if (definition) {
            // Update card with new data
            updateDefinitionCard(card.id, {
              hash: resolved.hash,
              resolved,
              definition,
            });

            // If this is the selected card, re-reveal it in the tree
            // (the tree has been refreshed and lost its selection)
            if (card.id === currentSelectedId) {
              // Small delay to let the tree refresh complete
              setTimeout(() => {
                onRevealInTree?.(resolved.fqn, resolved.type);
              }, 100);
            }
          }
        } catch (err) {
          console.error('[DefinitionStack] Failed to refresh card:', card.fqn, err);
        }
      }
    }

    refreshAllCards();
  }, [definitionsVersion]);

  /**
   * Unified navigation handler - resolves identifier and loads definition.
   * This is the single entry point for all navigation (editor clicks, reference clicks, tree clicks).
   *
   * @param identifier - Hash (e.g., "#abc123") or FQN (e.g., "List.map")
   * @param typeHint - Type hint from source
   * @param shouldRevealInTree - Whether to reveal in tree after loading
   */
  async function handleNavigation(
    identifier: string,
    typeHint: 'term' | 'type',
    shouldRevealInTree: boolean = true
  ) {
    if (!currentProject || !currentBranch) return;

    // Check for existing card first
    const existing = findExistingCard(identifier);
    if (existing) {
      selectAndScrollToCard(existing.id);
      // If we have resolved info, reveal in tree
      if (shouldRevealInTree && existing.fqn) {
        onRevealInTree?.(existing.fqn, existing.resolved?.type || typeHint);
      }
      return;
    }

    // Create new loading card
    const newCard: DefinitionCardState = {
      id: `${typeHint}-${identifier}-${Date.now()}`,
      pendingIdentifier: identifier,
      hash: null,
      fqn: null,
      resolved: null,
      definition: null,
      loading: true,
      error: null,
    };

    // Add to top of stack and select it
    addDefinitionCard(newCard);

    try {
      // Resolve the identifier using DefinitionResolver
      const resolved = await resolver.resolve(
        identifier,
        currentProject.name,
        currentBranch.name
      );

      if (!resolved) {
        updateDefinitionCard(newCard.id, {
          loading: false,
          error: 'Definition not found',
        });
        return;
      }

      // Check if another card was created for the same hash while we were loading
      const currentCards = getDefinitionCards();
      const duplicate = currentCards.find(
        (c) => c.id !== newCard.id && c.hash === resolved.hash
      );
      if (duplicate) {
        removeDefinitionCard(newCard.id);
        selectAndScrollToCard(duplicate.id);
        if (shouldRevealInTree) {
          onRevealInTree?.(resolved.fqn, resolved.type);
        }
        return;
      }

      // Load full definition using the resolved hash
      const definition = await client.getDefinition(
        currentProject.name,
        currentBranch.name,
        resolved.hash
      );

      if (!definition) {
        updateDefinitionCard(newCard.id, {
          loading: false,
          error: 'Failed to load definition',
        });
        return;
      }

      // Update card with all resolved info
      updateDefinitionCard(newCard.id, {
        hash: resolved.hash,
        fqn: resolved.fqn,
        resolved,
        definition,
        loading: false,
      });

      // Reveal in tree with FQN (never hash)
      if (shouldRevealInTree) {
        onRevealInTree?.(resolved.fqn, resolved.type);
      }
    } catch (err) {
      console.error('[DefinitionStack] Navigation error:', err);
      updateDefinitionCard(newCard.id, {
        loading: false,
        error: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  function handleCloseCard(cardId: string) {
    removeDefinitionCard(cardId);
  }

  /**
   * Handle reference click from within a definition card.
   * Uses the unified navigation handler with tree reveal enabled.
   */
  function handleReferenceClick(name: string, type: 'term' | 'type') {
    // When clicking a reference in a card, navigate to that definition
    // Always reveal in tree since this is user-initiated navigation
    handleNavigation(name, type, true);
  }

  /**
   * Handle card selection click.
   * Selects the card and reveals in tree if we have the FQN.
   */
  function handleCardClick(cardId: string) {
    setSelectedCardId(cardId);

    // Find the card and notify parent to reveal in tree
    const card = getDefinitionCards().find((c) => c.id === cardId);
    if (card && card.fqn && card.resolved) {
      onRevealInTree?.(card.fqn, card.resolved.type);
    }
  }

  if (cards.length === 0) {
    return (
      <div className="definition-stack empty">
        <div className="empty-state">
          <p>No definitions selected</p>
          <p className="hint">Click an item in the navigation tree to view it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="definition-stack">
      <div className="definition-stack-scroll">
        {cards.map((card) => {
          const isSelected = card.id === selectedCardId;

          // Display name: prefer FQN, fall back to pending identifier
          const displayName = card.fqn || card.pendingIdentifier;

          if (card.loading) {
            return (
              <div
                key={card.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(card.id, el);
                  else cardRefs.current.delete(card.id);
                }}
                className={`definition-card loading-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleCardClick(card.id)}
              >
                <div className="definition-card-header">
                  <span className="definition-name">{displayName}</span>
                </div>
                <div className="loading">
                  <span className="loading-spinner"></span>
                  Loading...
                </div>
              </div>
            );
          }

          if (card.error) {
            return (
              <div
                key={card.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(card.id, el);
                  else cardRefs.current.delete(card.id);
                }}
                className={`definition-card error-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleCardClick(card.id)}
              >
                <div className="definition-card-header">
                  <span className="definition-name">{displayName}</span>
                  <button
                    className="definition-card-btn close-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseCard(card.id);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="definition-error">
                  <p>{card.error}</p>
                </div>
              </div>
            );
          }

          if (!card.definition) {
            return null;
          }

          return (
            <DefinitionCard
              key={card.id}
              ref={(el) => {
                if (el) cardRefs.current.set(card.id, el);
                else cardRefs.current.delete(card.id);
              }}
              definition={card.definition}
              resolved={card.resolved}
              isSelected={isSelected}
              onAddToScratch={onAddToScratch}
              onClose={() => handleCloseCard(card.id)}
              onReferenceClick={handleReferenceClick}
              onClick={() => handleCardClick(card.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
