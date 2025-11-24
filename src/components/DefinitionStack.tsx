import { useState, useEffect } from 'react';
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
  const client = getUCMApiClient();

  // When a new definition is selected, add it to the top of the stack
  useEffect(() => {
    if (!selectedDefinition || !currentProject || !currentBranch) {
      return;
    }

    // Check if this definition is already in the stack
    const existing = cards.find(
      (card) =>
        card.definition?.name === selectedDefinition.name &&
        card.definition?.type === selectedDefinition.type
    );

    if (existing) {
      // Move to top if already exists
      setCards((prev) => [existing, ...prev.filter((c) => c.id !== existing.id)]);
      return;
    }

    // Create new card with loading state
    const newCard: DefinitionCardState = {
      id: `${selectedDefinition.type}-${selectedDefinition.name}-${Date.now()}`,
      definition: null,
      loading: true,
      error: null,
    };

    // Add to top of stack
    setCards((prev) => [newCard, ...prev]);

    // Load definition
    loadDefinition(newCard.id, selectedDefinition.name);
  }, [selectedDefinition]);

  async function loadDefinition(cardId: string, name: string) {
    if (!currentProject || !currentBranch) return;

    try {
      const definition = await client.getDefinition(
        currentProject.name,
        currentBranch.name,
        name
      );

      if (!definition) {
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
    // This will trigger the useEffect above
    if (!currentProject || !currentBranch) return;

    // Check if already in stack
    const existing = cards.find(
      (card) => card.definition?.name === name && card.definition?.type === type
    );

    if (existing) {
      // Move to top
      setCards((prev) => [existing, ...prev.filter((c) => c.id !== existing.id)]);
      return;
    }

    // Create and load new card
    const newCard: DefinitionCardState = {
      id: `${type}-${name}-${Date.now()}`,
      definition: null,
      loading: true,
      error: null,
    };

    setCards((prev) => [newCard, ...prev]);
    loadDefinition(newCard.id, name);
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
          if (card.loading) {
            return (
              <div key={card.id} className="definition-card loading-card">
                <div className="loading">Loading definition...</div>
              </div>
            );
          }

          if (card.error) {
            return (
              <div key={card.id} className="definition-card error-card">
                <div className="definition-error">
                  <p>{card.error}</p>
                  <button
                    className="definition-card-btn close-btn"
                    onClick={() => handleCloseCard(card.id)}
                  >
                    ×
                  </button>
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
              definition={card.definition}
              onAddToScratch={onAddToScratch}
              onClose={() => handleCloseCard(card.id)}
              onReferenceClick={handleReferenceClick}
            />
          );
        })}
      </div>
    </div>
  );
}
