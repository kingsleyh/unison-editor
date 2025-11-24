import type { SourceSegment, Annotation } from '../types/syntax';

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
  return (
    <pre className="syntax-rendered">
      <code className="rich">
        {segments.map((seg, idx) => renderSegment(seg, idx, onReferenceClick))}
      </code>
    </pre>
  );
}

function renderSegment(segment: SourceSegment, index: number, onReferenceClick?: (name: string, type: 'term' | 'type', hash?: string) => void): JSX.Element {
  const { segment: text, annotation } = segment;

  if (!annotation) {
    // Plain text with no annotation
    return <span key={index}>{text}</span>;
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
          clickHandler(onReferenceClick);
        }}
        title={getAnnotationTitle(annotation)}
        href="#"
      >
        {text}
      </a>
    );
  }

  return (
    <span key={index} className={className} title={getAnnotationTitle(annotation)}>
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
        // TypeReference contains a hash string
        const hash = annotation.contents;
        // For now, use the hash as the name (we'd need a reverse lookup to get the actual name)
        callback(hash, 'type', hash);
      };
    case 'TermReference':
      return (callback) => {
        // TermReference contains a hash string
        const hash = annotation.contents;
        // For now, use the hash as the name (we'd need a reverse lookup to get the actual name)
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

/**
 * Get tooltip title for annotation
 */
function getAnnotationTitle(annotation: Annotation): string | undefined {
  switch (annotation.tag) {
    case 'TypeReference':
      return `Type reference: ${annotation.contents}`;
    case 'TermReference':
      return `Term reference: ${annotation.contents}`;
    case 'HashQualifier':
      return `Definition: ${annotation.contents}`;
    default:
      return undefined;
  }
}
