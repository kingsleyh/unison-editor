import React from 'react';
import { InlineSyntaxSegments } from './SyntaxRenderer';
import type { SourceSegment } from '../types/syntax';
import { HighlightedCode } from '../utils/unisonHighlighter';

interface DocRendererProps {
  doc: any; // Doc AST from UCM
  onReferenceClick?: (name: string, type: 'term' | 'type') => void;
}

/**
 * Renders Unison Doc literals as formatted HTML
 * Mirrors the implementation from ui-core's Doc.elm
 */
export function DocRenderer({ doc, onReferenceClick }: DocRendererProps) {
  if (!doc || !Array.isArray(doc) || doc.length === 0) {
    return null;
  }

  // UCM returns Doc in nested array structure: [[segment1, segment2, docAst]]
  // We need to access doc[0][2] to get the actual Doc AST
  const docWrapper = doc[0];

  if (!Array.isArray(docWrapper) || docWrapper.length < 3) {
    return null;
  }

  const rootDoc = docWrapper[2];

  return (
    <article className="definition-doc">
      {renderDoc(rootDoc, 1, onReferenceClick)}
    </article>
  );
}

function renderDoc(
  doc: any,
  sectionLevel: number,
  onReferenceClick?: (name: string, type: 'term' | 'type') => void
): React.ReactNode {
  if (!doc || typeof doc !== 'object') {
    return null;
  }

  const { tag, contents } = doc;

  switch (tag) {
    case 'Word':
      return <span className="word">{contents}</span>;

    case 'Code':
      return (
        <span className="rich source inline-code">
          <code>{renderDoc(contents, sectionLevel, onReferenceClick)}</code>
        </span>
      );

    case 'CodeBlock': {
      const [lang, code] = contents;
      // Extract plain text from the code doc structure
      const codeText = extractPlainText(code);
      const isUnison = lang?.toLowerCase() === 'unison' || !lang;

      return (
        <div className="copyable-source">
          <div className={`rich source code ${lang?.toLowerCase() || 'unison'}`}>
            <pre>
              <code>
                {isUnison && codeText ? (
                  <HighlightedCode code={codeText} />
                ) : (
                  renderDoc(code, sectionLevel, onReferenceClick)
                )}
              </code>
            </pre>
          </div>
        </div>
      );
    }

    case 'Bold':
      return <strong>{renderDoc(contents, sectionLevel, onReferenceClick)}</strong>;

    case 'Italic':
      return <span className="italic">{renderDoc(contents, sectionLevel, onReferenceClick)}</span>;

    case 'Strikethrough':
      return (
        <span className="strikethrough">{renderDoc(contents, sectionLevel, onReferenceClick)}</span>
      );

    case 'Blockquote':
      return <blockquote>{renderDoc(contents, sectionLevel, onReferenceClick)}</blockquote>;

    case 'Blankline':
      return (
        <div>
          <br />
          <br />
        </div>
      );

    case 'Linebreak':
      return <br />;

    case 'SectionBreak':
      return <hr className="divider" />;

    case 'Paragraph':
    case 'Span': {
      if (!Array.isArray(contents)) return null;
      if (contents.length === 1) {
        return renderDoc(contents[0], sectionLevel, onReferenceClick);
      }
      return (
        <span className="span">
          {contents.map((item: any, idx: number) => (
            <React.Fragment key={idx}>
              {idx > 0 && ' '}
              {renderDoc(item, sectionLevel, onReferenceClick)}
            </React.Fragment>
          ))}
        </span>
      );
    }

    case 'Join': {
      if (!Array.isArray(contents)) return null;
      return (
        <span className="doc_join">
          {contents.map((item: any, idx: number) => (
            <React.Fragment key={idx}>
              {idx > 0 && ' '}
              {renderDoc(item, sectionLevel, onReferenceClick)}
            </React.Fragment>
          ))}
        </span>
      );
    }

    case 'Group':
      return (
        <span className="doc_group">{renderDoc(contents, sectionLevel, onReferenceClick)}</span>
      );

    case 'BulletedList': {
      if (!Array.isArray(contents)) return null;
      return (
        <ul>
          {contents.map((item: any, idx: number) => (
            <li key={idx}>{renderDoc(item, sectionLevel, onReferenceClick)}</li>
          ))}
        </ul>
      );
    }

    case 'NumberedList': {
      if (!Array.isArray(contents)) return null;
      const [startNum, items] = contents;
      return (
        <ol start={startNum}>
          {items.map((item: any, idx: number) => (
            <li key={idx}>{renderDoc(item, sectionLevel, onReferenceClick)}</li>
          ))}
        </ol>
      );
    }

    case 'Section': {
      if (!Array.isArray(contents)) {
        return null;
      }
      const [title, items] = contents;
      const level = Math.min(6, sectionLevel);
      const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

      // Items might be a single item or an array
      const itemsArray = Array.isArray(items) ? items : [items];

      return (
        <section>
          <HeadingTag id={docToString(title, '-')}>
            {renderDoc(title, sectionLevel, onReferenceClick)}
          </HeadingTag>
          {itemsArray.map((item: any, idx: number) => {
            // Wrap Span in paragraph for section content
            if (item?.tag === 'Span' || item?.tag === 'Paragraph') {
              return <p key={idx}>{renderDoc(item, sectionLevel + 1, onReferenceClick)}</p>;
            }
            return (
              <React.Fragment key={idx}>
                {renderDoc(item, sectionLevel + 1, onReferenceClick)}
              </React.Fragment>
            );
          })}
        </section>
      );
    }

    case 'UntitledSection': {
      if (!Array.isArray(contents)) return null;
      return (
        <section>
          {contents.map((item: any, idx: number) => {
            if (item?.tag === 'Span' || item?.tag === 'Paragraph') {
              return <p key={idx}>{renderDoc(item, sectionLevel, onReferenceClick)}</p>;
            }
            return (
              <React.Fragment key={idx}>{renderDoc(item, sectionLevel, onReferenceClick)}</React.Fragment>
            );
          })}
        </section>
      );
    }

    case 'Special':
      return renderSpecialForm(contents, onReferenceClick);

    case 'Column': {
      if (!Array.isArray(contents)) return null;
      return (
        <ul className="doc_column">
          {contents.map((item: any, idx: number) => (
            <li key={idx}>{renderDoc(item, sectionLevel, onReferenceClick)}</li>
          ))}
        </ul>
      );
    }

    default:
      // Unknown tag - render contents if available
      if (contents) {
        if (Array.isArray(contents)) {
          return (
            <>
              {contents.map((item: any, idx: number) => (
                <React.Fragment key={idx}>{renderDoc(item, sectionLevel, onReferenceClick)}</React.Fragment>
              ))}
            </>
          );
        }
        return renderDoc(contents, sectionLevel, onReferenceClick);
      }
      return null;
  }
}

function renderSpecialForm(
  special: any,
  onReferenceClick?: (name: string, type: 'term' | 'type') => void
): React.ReactNode {
  if (!special || typeof special !== 'object') {
    return null;
  }

  const { tag, contents } = special;

  switch (tag) {
    case 'Example': {
      // Inline code example
      const segments = contents as SourceSegment[];
      return (
        <span className="source rich example-inline">
          <code>
            <InlineSyntaxSegments segments={segments} onReferenceClick={onReferenceClick} />
          </code>
        </span>
      );
    }

    case 'ExampleBlock': {
      // Block code example
      const segments = contents as SourceSegment[];
      return (
        <div className="copyable-source">
          <div className="source rich example">
            <pre>
              <code>
                <InlineSyntaxSegments segments={segments} onReferenceClick={onReferenceClick} />
              </code>
            </pre>
          </div>
        </div>
      );
    }

    case 'Link': {
      // Inline code reference link
      const segments = contents as SourceSegment[];
      return (
        <code className="rich source">
          <InlineSyntaxSegments segments={segments} onReferenceClick={onReferenceClick} />
        </code>
      );
    }

    case 'Eval': {
      // Code with evaluation result
      if (!Array.isArray(contents) || contents.length < 2) return null;
      const [source, result] = contents;
      return (
        <div className="copyable-source">
          <div className="eval">
            <div className="source rich">
              <pre>
                <code>
                  <InlineSyntaxSegments segments={source} onReferenceClick={onReferenceClick} />
                </code>
              </pre>
            </div>
            <div className="result">
              <div className="result-indicator">
                <span className="icon arrow-down">▼</span>
              </div>
            </div>
            <div className="source rich">
              <pre>
                <code>
                  <InlineSyntaxSegments segments={result} onReferenceClick={onReferenceClick} />
                </code>
              </pre>
            </div>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Convert Doc to plain string (for generating IDs, etc.)
 */
function docToString(doc: any, separator: string): string {
  if (!doc || typeof doc !== 'object') {
    return '';
  }

  const { tag, contents } = doc;

  if (tag === 'Word') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents
      .map((item) => docToString(item, separator))
      .filter((s) => s.length > 0)
      .join(separator);
  }

  if (contents) {
    return docToString(contents, separator);
  }

  return '';
}

/**
 * Extract plain text from Doc structure, preserving whitespace
 * Used for code blocks where we need exact text
 */
function extractPlainText(doc: any): string {
  if (!doc || typeof doc !== 'object') {
    return typeof doc === 'string' ? doc : '';
  }

  const { tag, contents } = doc;

  switch (tag) {
    case 'Word':
      return contents || '';

    case 'Linebreak':
      return '\n';

    case 'Blankline':
      return '\n\n';

    case 'Join':
    case 'Span':
    case 'Paragraph':
    case 'Group':
      if (Array.isArray(contents)) {
        return contents.map(extractPlainText).join(' ');
      }
      return extractPlainText(contents);

    default:
      if (Array.isArray(contents)) {
        return contents.map(extractPlainText).join('');
      }
      if (contents) {
        return extractPlainText(contents);
      }
      return '';
  }
}
