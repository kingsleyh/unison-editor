import React from 'react';
import { unisonDarkTheme } from '../theme/unisonTheme';

/**
 * Syntax highlighter for Unison code blocks in documentation
 * Uses the unified color scheme from unisonTheme.ts
 */

interface Token {
  text: string;
  color: string;
}

// Unison keywords
const KEYWORDS = new Set([
  'ability', 'do', 'type', 'where', 'match', 'cases', 'let', 'with',
  'handle', 'if', 'else', 'then', 'use', 'namespace', 'unique', 'structural', 'forall'
]);

// Built-in types
const TYPE_KEYWORDS = new Set([
  'Boolean', 'Nat', 'Int', 'Float', 'Text', 'Char', 'Bytes', 'Optional', 'List', 'Either'
]);

/**
 * Tokenize a single line of Unison code
 */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const theme = unisonDarkTheme;

  // Regex patterns for Unison syntax
  const patterns: Array<{ regex: RegExp; getColor: (match: string) => string }> = [
    // Line comments
    { regex: /^--.*$/, getColor: () => theme.comment },
    // Strings
    { regex: /^"(?:[^"\\]|\\.)*"/, getColor: () => theme.string },
    // Characters
    { regex: /^'(?:[^'\\]|\\.)'/, getColor: () => theme.string },
    // Numbers (hex, octal, binary, float, int)
    { regex: /^0[xX][0-9a-fA-F]+/, getColor: () => theme.number },
    { regex: /^0[oO][0-7]+/, getColor: () => theme.number },
    { regex: /^0[bB][01]+/, getColor: () => theme.number },
    { regex: /^\d+\.\d+([eE][-+]?\d+)?/, getColor: () => theme.number },
    { regex: /^\d+/, getColor: () => theme.number },
    // Type identifiers (start with uppercase)
    {
      regex: /^[A-Z][\w'!]*/,
      getColor: (match) => TYPE_KEYWORDS.has(match) ? theme.typeKeyword : theme.typeReference
    },
    // Keywords and identifiers (start with lowercase or underscore)
    {
      regex: /^[a-z_][\w'!]*/,
      getColor: (match) => KEYWORDS.has(match) ? theme.keyword : theme.termReference
    },
    // Operators
    { regex: /^(?:->|=>|==|!=|<=|>=|&&|\|\||::|\+\+)/, getColor: () => theme.operator },
    { regex: /^[=><+\-*/|&^%:!?~]/, getColor: () => theme.operator },
    // Ability braces
    { regex: /^[{}]/, getColor: () => theme.abilityBraces },
    // Brackets
    { regex: /^[[\]()]/, getColor: () => theme.parenthesis },
    // Delimiters
    { regex: /^[;,.]/, getColor: () => theme.parenthesis },
    // Whitespace - preserve exactly
    { regex: /^[ \t]+/, getColor: () => '' },
  ];

  let remaining = line;

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, getColor } of patterns) {
      const match = remaining.match(regex);
      if (match) {
        const text = match[0];
        const color = getColor(text);
        tokens.push({ text, color });
        remaining = remaining.substring(text.length);
        matched = true;
        break;
      }
    }

    // If no pattern matched, consume one character as plain text
    if (!matched) {
      tokens.push({ text: remaining[0], color: '' });
      remaining = remaining.substring(1);
    }
  }

  return tokens;
}

/**
 * Tokenize multi-line code, handling multi-line constructs
 */
function tokenizeCode(code: string): Token[][] {
  const lines = code.split('\n');
  const result: Token[][] = [];

  let inBlockComment = false;
  const theme = unisonDarkTheme;

  for (const line of lines) {
    const lineTokens: Token[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // Handle block comments
      if (inBlockComment) {
        const endIndex = remaining.indexOf('-}');
        if (endIndex >= 0) {
          lineTokens.push({ text: remaining.substring(0, endIndex + 2), color: theme.comment });
          remaining = remaining.substring(endIndex + 2);
          inBlockComment = false;
        } else {
          lineTokens.push({ text: remaining, color: theme.comment });
          remaining = '';
        }
        continue;
      }

      // Check for block comment start
      const blockStart = remaining.indexOf('{-');
      if (blockStart === 0) {
        const endIndex = remaining.indexOf('-}', 2);
        if (endIndex >= 0) {
          lineTokens.push({ text: remaining.substring(0, endIndex + 2), color: theme.comment });
          remaining = remaining.substring(endIndex + 2);
        } else {
          lineTokens.push({ text: remaining, color: theme.comment });
          remaining = '';
          inBlockComment = true;
        }
        continue;
      }

      // Tokenize the rest of the line
      if (blockStart > 0) {
        // Tokenize up to block comment
        const beforeComment = remaining.substring(0, blockStart);
        const tokens = tokenizeLine(beforeComment);
        lineTokens.push(...tokens);
        remaining = remaining.substring(blockStart);
      } else {
        // No block comment - tokenize entire remaining line
        const tokens = tokenizeLine(remaining);
        lineTokens.push(...tokens);
        remaining = '';
      }
    }

    result.push(lineTokens);
  }

  return result;
}

/**
 * React component that highlights Unison code
 * Uses inline styles with colors from the unified theme
 */
export function HighlightedCode({ code }: { code: string }) {
  const tokenizedLines = tokenizeCode(code);

  return (
    <>
      {tokenizedLines.map((lineTokens, lineIdx) => (
        <React.Fragment key={lineIdx}>
          {lineTokens.map((token, tokenIdx) => {
            if (token.color) {
              return (
                <span key={tokenIdx} style={{ color: token.color }}>
                  {token.text}
                </span>
              );
            }
            return <React.Fragment key={tokenIdx}>{token.text}</React.Fragment>;
          })}
          {lineIdx < tokenizedLines.length - 1 && '\n'}
        </React.Fragment>
      ))}
    </>
  );
}
