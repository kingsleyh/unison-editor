import { forwardRef } from 'react';
import { SyntaxRenderer } from './SyntaxRenderer';
import { DocRenderer } from './DocRenderer';
import type { DefinitionSummary } from '../types/syntax';

interface DefinitionCardProps {
  definition: DefinitionSummary;
  isSelected?: boolean;
  onAddToScratch: (source: string, name: string) => void;
  onClose: () => void;
  onReferenceClick: (name: string, type: 'term' | 'type') => void;
  onClick?: () => void;
}

/**
 * A card displaying a single definition with UCM Desktop-style rendering
 */
export const DefinitionCard = forwardRef<HTMLDivElement, DefinitionCardProps>(
  function DefinitionCard(
    {
      definition,
      isSelected = false,
      onAddToScratch,
      onClose,
      onReferenceClick,
      onClick,
    },
    ref
  ) {
    function handleAddToScratch() {
      // Reassemble plain text source from segments for adding to scratch
      const plainSource = definition.segments.map((seg) => seg.segment).join('');
      onAddToScratch(plainSource, definition.name);
    }

    // Check if this is a Doc term (has doc AST)
    const isDocType = definition.tag === 'Doc' || definition.name.endsWith('.doc');
    const hasDocAst = definition.doc && Array.isArray(definition.doc) && definition.doc.length > 0;

    return (
      <div
        ref={ref}
        className={`definition-card ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
      >
      {!isDocType && (
        <div className="definition-card-header">
          <div className="definition-card-info">
            <h3 className="definition-card-name">{definition.name}</h3>
            <div className="definition-card-meta">
              <span className="definition-card-type">{definition.type}</span>
              <span className="definition-card-hash">
                #{definition.hash.substring(0, 8)}
              </span>
            </div>
            {definition.signature && (
              <div className="definition-card-signature">{definition.signature}</div>
            )}
          </div>
          <div className="definition-card-actions">
            <button
              className="definition-card-btn add-btn"
              onClick={handleAddToScratch}
              title="Add to scratch file"
            >
              Add to Scratch
            </button>
            <button
              className="definition-card-btn close-btn"
              onClick={onClose}
              title="Close card"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {definition.documentation && (
        <div className="definition-card-docs">
          <div className="docs-label">Documentation</div>
          <div className="docs-content">{definition.documentation}</div>
        </div>
      )}

      <div className={isDocType ? "definition-card-doc-content" : "definition-card-source"}>
        {hasDocAst ? (
          <DocRenderer doc={definition.doc} onReferenceClick={onReferenceClick} />
        ) : (
          <SyntaxRenderer
            segments={definition.segments}
            onReferenceClick={onReferenceClick}
          />
        )}
      </div>
    </div>
  );
  }
);
