import { useState, useEffect, useRef } from 'react';
import { DefinitionCard } from './DefinitionCard';
import { getUCMApiClient } from '../services/ucmApi';
import { useUnisonStore } from '../store/unisonStore';
import { getDefinitionResolver } from '../services/definitionResolver';
import type { DefinitionSummary } from '../types/syntax';
import type { ResolvedDefinition } from '../types/navigation';
import { isHash, normalizeHash } from '../types/navigation';

interface DefinitionStackProps {
  selectedDefinition: { name: string; type: 'term' | 'type' } | null;
  onAddToScratch: (source: string, name: string) => void;
  /** Called when a definition is loaded/selected (to reveal in tree) */
  onRevealInTree?: (fqn: string, type: 'term' | 'type') => void;
}

interface DefinitionCardState {
  id: string;
  /** The identifier we're looking up (could be hash or FQN initially) */
  pendingIdentifier: string;
  /** Canonical hash - primary key for deduplication (null until resolved) */
  hash: string | null;
  /** Fully qualified name - for display and tree navigation (null until resolved) */
  fqn: string | null;
  /** Full resolution info from DefinitionResolver */
  resolved: ResolvedDefinition | null;
  /** The loaded definition */
  definition: DefinitionSummary | null;
  loading: boolean;
  error: string | null;
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
  const { currentProject, currentBranch, definitionsVersion } = useUnisonStore();
  const [cards, setCards] = useState<DefinitionCardState[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const client = getUCMApiClient();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const resolver = getDefinitionResolver();

  // Keep a ref to cards for use in async functions to avoid stale closures
  const cardsRef = useRef<DefinitionCardState[]>(cards);
  cardsRef.current = cards;

  /**
   * Find an existing card by identifier (hash or FQN).
   * Uses the resolver cache for hash-based deduplication.
   * Uses cardsRef to get fresh state in async contexts.
   */
  function findExistingCard(identifier: string): DefinitionCardState | null {
    const currentCards = cardsRef.current;

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

    // Enable tree reveal for all navigation (editor clicks, tree clicks)
    handleNavigation(selectedDefinition.name, selectedDefinition.type, true);
  }, [selectedDefinition]);

  // When definitions version changes (after save to codebase), refresh all open cards
  useEffect(() => {
    if (definitionsVersion === 0 || !currentProject || !currentBranch || cards.length === 0) {
      return;
    }

    console.log('[DefinitionStack] Definitions version changed, refreshing all cards');

    // Refresh each card by reloading its definition
    async function refreshAllCards() {
      const currentCards = cardsRef.current;

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
            console.log('[DefinitionStack] Card no longer exists:', card.fqn);
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
            setCards((prev) =>
              prev.map((c) =>
                c.id === card.id
                  ? {
                      ...c,
                      hash: resolved.hash,
                      resolved,
                      definition,
                    }
                  : c
              )
            );
            console.log('[DefinitionStack] Refreshed card:', card.fqn);
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

    console.log('[DefinitionStack] Navigation request:', {
      identifier,
      typeHint,
      shouldRevealInTree,
    });

    // Check for existing card first
    const existing = findExistingCard(identifier);
    if (existing) {
      console.log('[DefinitionStack] Found existing card:', existing.id);
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
    setCards((prev) => [newCard, ...prev]);
    setSelectedCardId(newCard.id);

    console.log('[DefinitionStack] Created loading card:', newCard.id);

    try {
      // Resolve the identifier using DefinitionResolver
      const resolved = await resolver.resolve(
        identifier,
        currentProject.name,
        currentBranch.name
      );

      if (!resolved) {
        console.log('[DefinitionStack] Resolution failed for:', identifier);
        setCards((prev) =>
          prev.map((card) =>
            card.id === newCard.id
              ? { ...card, loading: false, error: 'Definition not found' }
              : card
          )
        );
        return;
      }

      console.log('[DefinitionStack] Resolved:', resolved);

      // Check if another card was created for the same hash while we were loading
      // (race condition when rapidly clicking) - use setCards callback to get fresh state
      let duplicateFound = false;
      let duplicateId: string | null = null;

      setCards((prev) => {
        const duplicate = prev.find(
          (c) => c.id !== newCard.id && c.hash === resolved.hash
        );
        if (duplicate) {
          duplicateFound = true;
          duplicateId = duplicate.id;
          // Remove the new card since we have a duplicate
          return prev.filter((c) => c.id !== newCard.id);
        }
        return prev;
      });

      if (duplicateFound && duplicateId) {
        console.log('[DefinitionStack] Found duplicate, removed new card');
        selectAndScrollToCard(duplicateId);
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
        console.log('[DefinitionStack] Failed to load definition for hash:', resolved.hash);
        setCards((prev) =>
          prev.map((card) =>
            card.id === newCard.id
              ? { ...card, loading: false, error: 'Failed to load definition' }
              : card
          )
        );
        return;
      }

      // Update card with all resolved info
      setCards((prev) =>
        prev.map((card) =>
          card.id === newCard.id
            ? {
                ...card,
                hash: resolved.hash,
                fqn: resolved.fqn,
                resolved,
                definition,
                loading: false,
              }
            : card
        )
      );

      console.log('[DefinitionStack] Card loaded successfully:', resolved.fqn);

      // Reveal in tree with FQN (never hash)
      if (shouldRevealInTree) {
        onRevealInTree?.(resolved.fqn, resolved.type);
      }
    } catch (err) {
      console.error('[DefinitionStack] Navigation error:', err);
      setCards((prev) =>
        prev.map((card) =>
          card.id === newCard.id
            ? {
                ...card,
                loading: false,
                error: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
              }
            : card
        )
      );
    }
  }

  function handleCloseCard(cardId: string) {
    setCards((prev) => prev.filter((card) => card.id !== cardId));
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
    const card = cardsRef.current.find((c) => c.id === cardId);
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
