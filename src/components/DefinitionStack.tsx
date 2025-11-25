import { useState, useEffect, useRef } from 'react';
import { DefinitionCard } from './DefinitionCard';
import { getUCMApiClient } from '../services/ucmApi';
import { useUnisonStore } from '../store/unisonStore';
import type { DefinitionSummary } from '../types/syntax';

interface DefinitionStackProps {
  selectedDefinition: { name: string; type: 'term' | 'type' } | null;
  onAddToScratch: (source: string, name: string) => void;
}

interface DefinitionCardState {
  id: string;
  fqn: string; // Store the FQN used to look up this definition
  definition: DefinitionSummary | null;
  loading: boolean;
  error: string | null;
}

/**
 * UCM Desktop-style stacked definition cards
 * Clicking nav items adds cards to the top of the list
 */
export function DefinitionStack({
  selectedDefinition,
  onAddToScratch,
}: DefinitionStackProps) {
  const { currentProject, currentBranch } = useUnisonStore();
  const [cards, setCards] = useState<DefinitionCardState[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const client = getUCMApiClient();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // When a new definition is selected, add it to the stack or select existing
  useEffect(() => {
    if (!selectedDefinition || !currentProject || !currentBranch) {
      return;
    }

    // Check if this definition is already in the stack (compare by FQN)
    const existing = cards.find(
      (card) =>
        card.fqn === selectedDefinition.name &&
        (card.definition?.type === selectedDefinition.type || card.loading)
    );

    if (existing) {
      // Select the existing card and scroll to it
      setSelectedCardId(existing.id);
      // Scroll to the card
      setTimeout(() => {
        const cardElement = cardRefs.current.get(existing.id);
        cardElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
      return;
    }

    // Create new card with loading state
    const newCard: DefinitionCardState = {
      id: `${selectedDefinition.type}-${selectedDefinition.name}-${Date.now()}`,
      fqn: selectedDefinition.name,
      definition: null,
      loading: true,
      error: null,
    };

    // Add to top of stack and select it
    setCards((prev) => [newCard, ...prev]);
    setSelectedCardId(newCard.id);

    // Load definition
    loadDefinition(newCard.id, selectedDefinition.name);
  }, [selectedDefinition]);

  async function loadDefinition(cardId: string, name: string) {
    if (!currentProject || !currentBranch) return;

    console.log('Loading definition:', {
      name,
      project: currentProject.name,
      branch: currentBranch.name
    });

    try {
      const definition = await client.getDefinition(
        currentProject.name,
        currentBranch.name,
        name
      );

      console.log('Definition result:', definition);

      if (!definition) {
        console.log('Definition not found for:', name);
        setCards((prev) =>
          prev.map((card) =>
            card.id === cardId
              ? { ...card, loading: false, error: 'Definition not found' }
              : card
          )
        );
        return;
      }

      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, loading: false, definition }
            : card
        )
      );
    } catch (err) {
      console.error('Failed to load definition:', err);
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
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

  function handleReferenceClick(name: string, type: 'term' | 'type') {
    // When clicking a reference in a card, add that definition to the stack
    if (!currentProject || !currentBranch) return;

    // Check if already in stack (compare by FQN)
    const existing = cards.find(
      (card) => card.fqn === name && (card.definition?.type === type || card.loading)
    );

    if (existing) {
      // Select the existing card and scroll to it
      setSelectedCardId(existing.id);
      setTimeout(() => {
        const cardElement = cardRefs.current.get(existing.id);
        cardElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
      return;
    }

    // Create and load new card
    const newCard: DefinitionCardState = {
      id: `${type}-${name}-${Date.now()}`,
      fqn: name,
      definition: null,
      loading: true,
      error: null,
    };

    setCards((prev) => [newCard, ...prev]);
    setSelectedCardId(newCard.id);
    loadDefinition(newCard.id, name);
  }

  function handleCardClick(cardId: string) {
    setSelectedCardId(cardId);
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
                  <span className="definition-name">{card.fqn}</span>
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
                  <span className="definition-name">{card.fqn}</span>
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
