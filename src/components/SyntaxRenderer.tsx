import React, { useState } from 'react';
import type { SourceSegment, Annotation } from '../types/syntax';
import { getHelpForSegment } from '../utils/syntaxHelp';
import { getUCMApiClient } from '../services/ucmApi';
import { useUnisonStore } from '../store/unisonStore';
import { normalizeHash } from '../types/navigation';

interface SyntaxRendererProps {
  segments: SourceSegment[];
  onReferenceClick?: (name: string, type: 'term' | 'type', hash?: string) => void;
}

/**
 * Renders annotated source code segments inline (no wrapper)
 * Used inside Doc special forms where the wrapper is already provided
 */
export function InlineSyntaxSegments({ segments, onReferenceClick }: SyntaxRendererProps) {
  return <>{segments.map((seg, idx) => renderSegment(seg, idx, onReferenceClick))}</>;
}

/**
 * Renders annotated source code from UCM API
 * Applies syntax highlighting and makes references clickable
 */
export function SyntaxRenderer({ segments, onReferenceClick }: SyntaxRendererProps) {
  const [tooltip, setTooltip] = useState<{
    content: string;
    position: { x: number; y: number };
  } | null>(null);
  const [hoverTimeout, setHoverTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const ucmClient = getUCMApiClient();
  const { currentProject, currentBranch } = useUnisonStore();

  function handleMouseEnter(
    e: React.MouseEvent,
    segment: SourceSegment,
    _index: number
  ) {
    // Clear any existing hover timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }

    const clientX = e.clientX;
    const clientY = e.clientY;

    // Add a 300ms delay like Monaco hover
    const timeout = setTimeout(async () => {
      const text = segment.segment.trim();
      const annotation = segment.annotation;

      // Check for keyword/literal help first (same as Monaco hover)
      const help = getHelpForSegment(text);
      if (help) {
        setTooltip({
          content: help.description,
          position: { x: clientX, y: clientY }
        });
        return;
      }

      // For references, fetch signature from UCM (same format as Monaco hover)
      if (annotation && (annotation.tag === 'TermReference' || annotation.tag === 'TypeReference')) {
        if (!currentProject || !currentBranch) return;

        try {
          // Normalize hash to ensure # prefix for API consistency
          const hash = normalizeHash(annotation.contents);
          const definition = await ucmClient.getDefinition(
            currentProject.name,
            currentBranch.name,
            hash
          );

          if (definition) {
            // Match Monaco hover format:
            // - For types: "type TypeName"
            // - For abilities: "ability AbilityName"
            // - For terms: just the signature (no name, no hash)
            let content = '';
            if (annotation.tag === 'TypeReference') {
              const isAbility = definition.tag === 'Ability';
              content = isAbility ? `ability ${definition.name}` : `type ${definition.name}`;
            } else {
              // For terms, show just the signature
              content = definition.signature || '';
            }

            if (content) {
              setTooltip({
                content: content,
                position: { x: clientX, y: clientY }
              });
            }
          }
        } catch (error) {
          console.error('Failed to fetch definition for tooltip:', error);
        }
      }
    }, 300);

    setHoverTimeout(timeout);
  }

  function handleMouseLeave() {
    // Clear the hover timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setTooltip(null);
  }

  return (
    <>
      <pre className="syntax-rendered">
        <code className="rich">
          {segments.map((seg, idx) =>
            renderSegment(seg, idx, onReferenceClick, handleMouseEnter, handleMouseLeave)
          )}
        </code>
      </pre>
      {tooltip && (
        <div
          className="syntax-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.position.x + 10,
            top: tooltip.position.y + 10,
            pointerEvents: 'none'
          }}
        >
          <div className="syntax-tooltip-content">{tooltip.content}</div>
        </div>
      )}
    </>
  );
}

function renderSegment(
  segment: SourceSegment,
  index: number,
  onReferenceClick?: (name: string, type: 'term' | 'type', hash?: string) => void,
  onMouseEnter?: (e: React.MouseEvent, segment: SourceSegment, index: number) => void,
  onMouseLeave?: () => void
): React.ReactElement {
  const { segment: text, annotation } = segment;

  const hoverHandlers = onMouseEnter && onMouseLeave ? {
    onMouseEnter: (e: React.MouseEvent) => onMouseEnter(e, segment, index),
    onMouseLeave: onMouseLeave
  } : {};

  if (!annotation) {
    // Plain text with no annotation
    return <span key={index} {...hoverHandlers}>{text}</span>;
  }

  // Apply styling and interactivity based on annotation type
  const className = getAnnotationClassName(annotation);
  const clickHandler = getClickHandler(annotation);

  if (clickHandler && onReferenceClick) {
    return (
      <a
        key={index}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation(); // Prevent bubbling to parent card's onClick
          clickHandler(onReferenceClick);
        }}
        href="#"
        {...hoverHandlers}
      >
        {text}
      </a>
    );
  }

  return (
    <span key={index} className={className} {...hoverHandlers}>
      {text}
    </span>
  );
}

/**
 * Get CSS class name for annotation type
 * Must match ui-core's CSS class names
 */
function getAnnotationClassName(annotation: Annotation): string {
  switch (annotation.tag) {
    case 'TypeReference':
      return 'type-reference';
    case 'TermReference':
      return 'term-reference';
    case 'HashQualifier':
      return 'hash-qualifier';
    case 'TypeAscriptionColon':
      return 'type-ascription-colon';
    case 'UseKeyword':
      return 'use-keyword';
    case 'ControlKeyword':
      return 'control-keyword';
    case 'TypeKeyword':
      return 'type-keyword';
    case 'LinkKeyword':
      return 'link-keyword';
    case 'DataTypeKeyword':
      return 'data-type-keyword';
    case 'BindingEquals':
      return 'binding-equals';
    case 'DelayForceChar':
      return 'delay-force-char';
    case 'AbilityBraces':
      return 'ability-braces';
    case 'DataTypeParams':
      return 'data-type-params';
    case 'DataTypeModifier':
      return 'data-type-modifier';
    case 'Parenthesized':
      return 'parenthesis';
    default:
      return '';
  }
}

/**
 * Get click handler for clickable annotations
 */
function getClickHandler(
  annotation: Annotation
): ((callback: (name: string, type: 'term' | 'type', hash?: string) => void) => void) | null {
  switch (annotation.tag) {
    case 'TypeReference':
      return (callback) => {
        // TypeReference contains a hash string (API returns without # prefix)
        // Normalize to ensure isHash() detection works correctly
        const hash = normalizeHash(annotation.contents);
        callback(hash, 'type', hash);
      };
    case 'TermReference':
      return (callback) => {
        // TermReference contains a hash string (API returns without # prefix)
        // Normalize to ensure isHash() detection works correctly
        const hash = normalizeHash(annotation.contents);
        callback(hash, 'term', hash);
      };
    case 'HashQualifier':
      // HashQualifier contains the actual name
      return (callback) => {
        const name = annotation.contents;
        // Try to determine if it's a term or type based on naming convention
        // Types typically start with uppercase
        const type = /^[A-Z]/.test(name) ? 'type' : 'term';
        callback(name, type);
      };
    default:
      return null;
  }
}

