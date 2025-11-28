import { forwardRef } from 'react';
import { SyntaxRenderer } from './SyntaxRenderer';
import { DocRenderer } from './DocRenderer';
import type { DefinitionSummary } from '../types/syntax';
import type { ResolvedDefinition } from '../types/navigation';
import { getDisplayName, getVersionBadge } from '../types/navigation';

interface DefinitionCardProps {
  definition: DefinitionSummary;
  /** Resolved definition info for display (optional for backwards compatibility) */
  resolved?: ResolvedDefinition | null;
  isSelected?: boolean;
  /** Request to add this definition to scratch - parent handles FQN fetch */
  onRequestAddToScratch: (fqn: string) => void;
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
      resolved,
      isSelected = false,
      onRequestAddToScratch,
      onClose,
      onReferenceClick,
      onClick,
    },
    ref
  ) {
    function handleAddToScratch() {
      // Request parent to fetch FQN definition and add to scratch
      // Use the FQN from resolved info, falling back to definition.name
      const fqn = resolved?.fqn || definition.name;
      onRequestAddToScratch(fqn);
    }

    // Check if this is a Doc term
    // UCM returns tag as "Doc" for doc literals
    // Also check if we have a doc AST (more reliable indicator)
    const hasDocAst = definition.doc && Array.isArray(definition.doc) && definition.doc.length > 0;
    const isDocType = definition.tag === 'Doc' || hasDocAst;

    // Use resolved info for display if available
    const displayName = resolved ? getDisplayName(resolved) : definition.name;
    const versionBadge = resolved ? getVersionBadge(resolved) : null;
    const isLibDependency = resolved?.isLibDependency || false;

    return (
      <div
        ref={ref}
        className={`definition-card ${isSelected ? 'selected' : ''} ${isLibDependency ? 'lib-dependency' : ''}`}
        onClick={onClick}
      >
      {isDocType ? (
        // Simplified header for Doc terms - title with icon buttons
        <div className="definition-card-header doc-header">
          <div className="definition-card-info">
            <h3 className="definition-card-name" title={definition.name}>
              {displayName}
            </h3>
            <div className="definition-card-meta">
              <span className="definition-card-type doc-type">Doc</span>
            </div>
          </div>
          <div className="definition-card-actions">
            <button
              className="definition-card-btn add-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleAddToScratch();
              }}
              title="Add to scratch file"
            >
              +
            </button>
            <button
              className="definition-card-btn close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close card"
            >
              ×
            </button>
          </div>
        </div>
      ) : (
        // Full header for code terms
        <div className="definition-card-header">
          <div className="definition-card-info">
            <h3 className="definition-card-name" title={definition.name}>
              {displayName}
              {versionBadge && (
                <span className="definition-card-version">{versionBadge}</span>
              )}
            </h3>
            <div className="definition-card-meta">
              <span className="definition-card-type">{definition.type}</span>
              <span className="definition-card-hash">
                #{definition.hash.substring(0, 8)}
              </span>
              {isLibDependency && (
                <span className="definition-card-lib-badge">lib</span>
              )}
            </div>
            {definition.signature && (
              <div className="definition-card-signature">{definition.signature}</div>
            )}
          </div>
          <div className="definition-card-actions">
            <button
              className="definition-card-btn add-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleAddToScratch();
              }}
              title="Add to scratch file"
            >
              +
            </button>
            <button
              className="definition-card-btn close-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
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
