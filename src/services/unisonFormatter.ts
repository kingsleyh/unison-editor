/**
 * Unison Code Formatter
 *
 * A custom formatter for Unison code that handles indentation,
 * alignment, and whitespace normalization.
 */

export interface FormatOptions {
  tabSize: number;
  insertSpaces: boolean;
}

/**
 * Format Unison source code
 */
export function formatUnisonCode(code: string, options: FormatOptions = { tabSize: 2, insertSpaces: true }): string {
  const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';

  // First, dedent the entire code block if it has common leading indentation
  // This handles the case where code is pasted with extra indentation
  code = dedentToBase(code);

  // Split into lines for processing
  const lines = code.split('\n');
  const formattedLines: string[] = [];

  let inMultiLineBlock = false;
  let inCases = false;
  let inMultiLineString = false; // Track if we're inside """ ... """

  // Track binding indentation for normalizing sibling bindings
  // Stack of indent levels for each scope depth
  const bindingIndentStack: number[] = [];
  let lastBindingIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines but preserve them
    if (trimmed === '') {
      formattedLines.push('');
      continue;
    }

    // Track multi-line strings (""" ... """)
    // Count occurrences of """ in the line
    const tripleQuoteCount = (line.match(/"""/g) || []).length;
    if (tripleQuoteCount % 2 === 1) {
      // Odd number of """ toggles the state
      inMultiLineString = !inMultiLineString;
    }

    // If we're inside a multi-line string, don't format the line
    if (inMultiLineString && tripleQuoteCount === 0) {
      formattedLines.push(line);
      continue;
    }

    // Calculate the current indentation level from the original line
    const originalIndent = line.length - line.trimStart().length;
    const originalIndentLevel = Math.floor(originalIndent / options.tabSize);

    // Detect block starts and ends
    // Type signature: identifier followed by : and a type (not :+ or :++)
    // Types start with: uppercase (Nat), lowercase type var (a), [, (, {, or '
    const isTypeSig = /^[\w.]+\s*:\s*[A-Za-z\[\(\{']/.test(trimmed) && !trimmed.includes('=') && !/:\s*[+\-*]/.test(trimmed);
    const isDefinition = /^[\w.]+\s*[:=]/.test(trimmed);
    const isWatchExpression = trimmed.startsWith('>');
    const isTestExpression = trimmed.startsWith('test>');
    const isCasesKeyword = trimmed === 'cases' || trimmed.startsWith('cases ');
    const isMatchKeyword = trimmed.startsWith('match ') || trimmed === 'match';
    const isLetKeyword = trimmed.startsWith('let');
    const isUseStatement = trimmed.startsWith('use ');
    const isAbilityDecl = trimmed.startsWith('ability ') || trimmed.startsWith('structural ability ') || trimmed.startsWith('unique ability ');
    const isTypeDecl = trimmed.startsWith('type ') || trimmed.startsWith('structural type ') || trimmed.startsWith('unique type ');

    // Track cases blocks
    if (isCasesKeyword) {
      inCases = true;
    }

    // Determine proper indentation
    let targetIndentLevel = originalIndentLevel;

    // Top-level declarations should have no indentation
    if (isTypeSig || isWatchExpression || isTestExpression || isAbilityDecl || isTypeDecl) {
      if (!inMultiLineBlock) {
        targetIndentLevel = 0;
      }
    }

    // Top-level definitions start at indent 0
    if (isDefinition && originalIndentLevel === 0) {
      targetIndentLevel = 0;
    }

    // Use statements at top level
    if (isUseStatement && originalIndentLevel === 0) {
      targetIndentLevel = 0;
    }

    // Format the line
    let formattedLine = trimmed;

    // Check if this is a comment line - don't modify comments
    // Also handle doc comments {- ... -}
    const isComment = trimmed.startsWith('--') || trimmed.startsWith('{-') || trimmed.endsWith('-}');

    if (!isComment) {
      // Split code from inline comment if present
      const commentIndex = formattedLine.indexOf(' --');
      let codePart = commentIndex >= 0 ? formattedLine.substring(0, commentIndex) : formattedLine;
      const commentPart = commentIndex >= 0 ? formattedLine.substring(commentIndex) : '';

      // Normalize spaces around operators (only in code part)
      codePart = normalizeOperatorSpacing(codePart);

      // Normalize spaces after commas
      codePart = codePart.replace(/,\s*/g, ', ');

      // Normalize spaces around colons in type signatures (but not in lambdas)
      if (isTypeSig) {
        codePart = codePart.replace(/\s*:\s*/, ' : ');
      }

      // Normalize spaces around = in definitions (but not ==, ===, !=, <=, >=)
      // Only match single = that's used for assignment, not comparison
      codePart = codePart.replace(/(\w)\s*=\s*(\w)/g, (match, before, after) => {
        return `${before} = ${after}`;
      });
      // Also handle = at end of line (like `foo =` in multi-line definitions)
      codePart = codePart.replace(/(\w)\s*=\s*$/, '$1 =');

      formattedLine = codePart + commentPart;
    }

    // Apply indentation
    const finalIndent = indent.repeat(targetIndentLevel);
    formattedLines.push(finalIndent + formattedLine);

    // Update block tracking
    if (trimmed.endsWith('=') || trimmed.endsWith('->') || isCasesKeyword || isMatchKeyword || isLetKeyword) {
      inMultiLineBlock = true;
    }

    // End of cases block (next top-level definition)
    if (inCases && isDefinition && originalIndentLevel === 0) {
      inCases = false;
    }
  }

  // Join and clean up
  let result = formattedLines.join('\n');

  // Normalize sibling binding indentation
  result = normalizeSiblingBindings(result, options.tabSize);

  // Break long pipe chains across multiple lines
  result = breakPipeChains(result, indent);

  // Ensure single blank line between top-level definitions
  result = normalizeBlankLines(result);

  // Remove trailing whitespace from each line
  result = result.split('\n').map(line => line.trimEnd()).join('\n');

  // Ensure file ends with single newline
  result = result.trimEnd() + '\n';

  return result;
}

/**
 * Normalize spacing around common operators
 */
function normalizeOperatorSpacing(line: string): string {
  // Don't process inside strings
  const parts = splitByStrings(line);

  return parts.map((part, i) => {
    // Odd indices are string contents, don't modify
    if (i % 2 === 1) return part;

    let result = part;

    // Binary operators with spaces - order matters! Longer operators first
    const binaryOps = [
      '<|>', // Alternative operator - must come before <, |, >
      '===', // Identity comparison - must come before ==
      '++:', ':++', // List snoc/cons patterns - must come before ++
      '++', '&&', '||', '==', '!=', '<=', '>=', '<>',
      '+:', ':+', // List cons/snoc patterns - must come before + and :
      '|>', '<|', '>>', '<<', '->', '+', '-', '*', '/', '%'
      // Note: Don't include single < > | as they break type syntax and other operators
    ];

    for (const op of binaryOps) {
      // Escape regex special chars
      const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match operator not already surrounded by spaces
      const regex = new RegExp(`(\\S)\\s*${escapedOp}\\s*(\\S)`, 'g');
      result = result.replace(regex, (match, before, after) => {
        // Don't add spaces around -> in type signatures or lambdas
        if (op === '-' && after === '>') return match;
        // Don't break <|> when processing <| or |>
        if (op === '<|' && after === '>') return match;
        if (op === '|>' && before === '<') return match;
        // Don't break ++ or +: or :+ when processing +
        if (op === '+' && (before === '+' || after === '+' || before === ':' || after === ':')) return match;
        // Don't break ++: or :++ when processing ++
        if (op === '++' && (before === ':' || after === ':')) return match;
        // Don't break ++: when processing +:
        if (op === '+:' && before === '+') return match;
        // Don't break :++ when processing :+
        if (op === ':+' && after === '+') return match;
        // Don't break unary +/- before numbers (e.g., `func +0` or `(+1)`)
        // If there's whitespace before + and after is a digit, it's likely unary
        if ((op === '+' || op === '-') && /\d/.test(after) && /\s[+\-]\d/.test(match)) return match;
        // Don't break -> when processing -
        if (op === '-' && after === '>') return match;
        // Don't break && when processing &
        if (op === '&' && (before === '&' || after === '&')) return match;
        // Don't break || when processing |
        if (op === '|' && (before === '|' || after === '|')) return match;
        // Don't break === when processing ==
        if (op === '==' && (before === '=' || after === '=')) return match;
        // Don't break == or != when processing =
        if (op === '=' && (before === '=' || before === '!' || after === '=')) return match;
        // Don't break <= >= when processing < or >
        if (op === '<' && after === '=') return match;
        if (op === '>' && (before === '=' || before === '-' || after === '=')) return match;
        return `${before} ${op} ${after}`;
      });
    }

    return result;
  }).join('');
}

/**
 * Split a line by string literals to avoid modifying string contents
 */
function splitByStrings(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : '';

    if (!inString && (char === '"' || char === "'")) {
      parts.push(current);
      current = char;
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      current += char;
      parts.push(current);
      current = '';
      inString = false;
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Remove common leading indentation from all lines
 * This handles the case where entire code block is pasted with extra indentation
 * Only applies when the first non-empty line looks like a top-level definition
 */
function dedentToBase(code: string): string {
  const lines = code.split('\n');

  // Find the first non-empty, non-comment line
  let firstContentLine = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('--') && !trimmed.startsWith('{-')) {
      firstContentLine = trimmed;
      break;
    }
  }

  // Only dedent if the first content line looks like a top-level definition:
  // - Type signature: `foo : Type`
  // - Function def: `foo x y =` or `foo =`
  // - Type decl: `type Foo` or `unique type Foo`
  // - Ability decl: `ability Foo`
  // - Use statement: `use Namespace`
  const looksLikeTopLevel =
    /^[\w.]+\s*:/.test(firstContentLine) ||  // Type signature
    /^[\w.]+(\s+[\w.]+)*\s*=/.test(firstContentLine) ||  // Function definition
    /^(unique\s+|structural\s+)?type\s+/.test(firstContentLine) ||  // Type declaration
    /^(unique\s+|structural\s+)?ability\s+/.test(firstContentLine) ||  // Ability declaration
    /^use\s+/.test(firstContentLine);  // Use statement

  if (!looksLikeTopLevel) {
    // Don't dedent - this looks like code from inside a function
    return code;
  }

  // Find the minimum indentation across all non-empty lines
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue; // Skip empty lines

    const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length || 0;
    if (leadingSpaces < minIndent) {
      minIndent = leadingSpaces;
    }
  }

  // If no common indentation or only empty lines, return as-is
  if (minIndent === 0 || minIndent === Infinity) {
    return code;
  }

  // Remove the common indentation from all lines
  return lines.map(line => {
    if (line.trim() === '') return line; // Preserve empty lines
    return line.substring(minIndent);
  }).join('\n');
}

/**
 * Normalize sibling binding indentation
 * Bindings in the same block should have the same indentation
 */
function normalizeSiblingBindings(code: string, tabSize: number): string {
  const lines = code.split('\n');
  const result: string[] = [];

  // Pattern to match a binding line: identifier = ... or (pattern) = ...
  const bindingPattern = /^(\s*)([\w.]+|\([^)]+\))\s*=/;

  // Track the expected indent for bindings at each scope depth
  // Key: base indent level, Value: expected binding indent
  const scopeBindingIndent = new Map<number, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('--')) {
      result.push(line);
      continue;
    }

    // Check if this is a binding line
    const match = line.match(bindingPattern);

    // Clear scope tracking when we hit a block starter (new scope)
    if (trimmed.endsWith('do') || trimmed.endsWith('=') ||
        trimmed.includes(' where') || trimmed.startsWith('let') ||
        trimmed.startsWith('cases') || trimmed.startsWith('match')) {
      scopeBindingIndent.clear();
    }

    if (match) {
      const currentIndent = match[1].length;
      const bindingName = match[2];

      // Skip top-level definitions (indent 0)
      if (currentIndent === 0) {
        result.push(line);
        scopeBindingIndent.clear();
        continue;
      }

      // Determine the scope level (rounded down to nearest tab boundary)
      const scopeLevel = Math.floor(currentIndent / tabSize) * tabSize;

      // Check if we have a previous binding at a smaller indent level
      // that should determine the expected indent for this binding
      let expectedIndent = currentIndent;
      let foundScopeIndent = false;

      // Look for an established binding indent at a lower or equal scope
      for (const [scope, indent] of scopeBindingIndent) {
        if (scope <= scopeLevel && indent <= currentIndent) {
          // If we're at the same scope but more indented, use the established indent
          if (scope === Math.floor(indent / tabSize) * tabSize) {
            expectedIndent = indent;
            foundScopeIndent = true;
            break;
          }
        }
      }

      // If no established indent and this looks over-indented compared to previous binding
      // Check if the previous non-blank line was a non-continuation binding
      if (!foundScopeIndent && result.length > 0) {
        for (let j = result.length - 1; j >= 0; j--) {
          const prevLine = result[j];
          const prevTrimmed = prevLine.trim();

          // Skip empty lines and comments
          if (!prevTrimmed || prevTrimmed.startsWith('--')) continue;

          // If we hit a line that introduces a block, stop looking
          // Check this BEFORE the binding check because `foo = bar do` is both
          if (prevTrimmed.endsWith('=') || prevTrimmed.endsWith('do') ||
              prevTrimmed.includes(' where') ||
              prevTrimmed.startsWith('let') || prevTrimmed.startsWith('cases')) {
            break;
          }

          const prevMatch = prevLine.match(bindingPattern);
          if (prevMatch) {
            const prevIndent = prevMatch[1].length;

            // If previous binding was at lower indent, that's our scope boundary
            if (prevIndent < currentIndent) {
              expectedIndent = prevIndent;
              scopeBindingIndent.set(prevIndent, prevIndent);
            } else if (prevIndent === currentIndent) {
              // Same indent - keep it
              expectedIndent = currentIndent;
            }
            break;
          }
        }
      }

      // Apply the indent correction if needed
      if (expectedIndent !== currentIndent && expectedIndent < currentIndent) {
        const newLine = ' '.repeat(expectedIndent) + line.trim();
        result.push(newLine);
        // Don't add to scope map if this binding starts a new block
        if (!trimmed.endsWith('do') && !trimmed.endsWith('=')) {
          scopeBindingIndent.set(Math.floor(expectedIndent / tabSize) * tabSize, expectedIndent);
        }
      } else {
        result.push(line);
        // Don't add to scope map if this binding starts a new block
        if (!trimmed.endsWith('do') && !trimmed.endsWith('=')) {
          scopeBindingIndent.set(scopeLevel, currentIndent);
        }
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Break long pipe chains (|>) across multiple lines for readability
 * Lines with 2+ pipe operators get broken so each stage is on its own line
 * Also normalizes indentation of existing multi-line pipe chains
 */
function breakPipeChains(code: string, indent: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  // Track if we're in a pipe chain to normalize indentation
  let inPipeChain = false;
  let pipeChainBaseIndent = '';

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('--')) {
      result.push(line);
      inPipeChain = false;
      continue;
    }

    // Skip empty lines
    if (trimmed === '') {
      result.push(line);
      inPipeChain = false;
      continue;
    }

    // Check if this line starts with a pipe operator (continuation of pipe chain)
    const startsWithPipe = /^(<\|>|\|>|<\|)\s*/.test(trimmed);

    if (startsWithPipe) {
      // This line starts with a pipe operator - it's part of a pipe chain
      // Normalize the indentation based on context
      const match = trimmed.match(/^(<\|>|\|>|<\|)\s*(.*)/);
      if (match) {
        const op = match[1];
        const rest = match[2];

        // If we're already tracking a pipe chain, use that indentation
        // Otherwise, look at the previous non-empty line to determine context
        if (!inPipeChain) {
          // Find the base indent from the previous non-blank line
          for (let j = result.length - 1; j >= 0; j--) {
            const prevLine = result[j];
            if (prevLine.trim()) {
              pipeChainBaseIndent = prevLine.substring(0, prevLine.length - prevLine.trimStart().length);
              inPipeChain = true;
              break;
            }
          }
        }

        result.push(pipeChainBaseIndent + indent + op + ' ' + rest.trim());
        continue;
      }
    }

    // Get the original indentation
    const originalIndent = line.substring(0, line.length - line.trimStart().length);

    // Count pipe operators (|>) in the line, excluding those in strings
    const pipeCount = countPipesOutsideStrings(trimmed);

    // If 2 or more pipes on a single line, break the line
    if (pipeCount >= 2) {
      // Check if this is a definition (has = before the pipes)
      const equalsIndex = trimmed.indexOf(' = ');
      if (equalsIndex !== -1) {
        // Split into definition part and expression part
        const defPart = trimmed.substring(0, equalsIndex + 3); // includes " = "
        const exprPart = trimmed.substring(equalsIndex + 3);

        // Split expression by |> and <|>
        const { segments, operators } = splitByPipeOutsideStrings(exprPart);

        if (segments.length >= 2) {
          // First line: definition = first_segment
          result.push(originalIndent + defPart.trim());
          // Continuation lines: each segment with correct operator prefix
          const continuationIndent = originalIndent + indent;
          result.push(continuationIndent + segments[0].trim());
          for (let i = 1; i < segments.length; i++) {
            const op = operators[i - 1] || '|>';
            result.push(continuationIndent + indent + op + ' ' + segments[i].trim());
          }
          inPipeChain = true;
          pipeChainBaseIndent = continuationIndent;
          continue;
        }
      } else {
        // No definition, just expression with pipes
        const { segments, operators } = splitByPipeOutsideStrings(trimmed);

        if (segments.length >= 2) {
          const continuationIndent = originalIndent + indent;
          result.push(originalIndent + segments[0].trim());
          for (let i = 1; i < segments.length; i++) {
            const op = operators[i - 1] || '|>';
            result.push(continuationIndent + op + ' ' + segments[i].trim());
          }
          inPipeChain = true;
          pipeChainBaseIndent = originalIndent;
          continue;
        }
      }
    }

    // Check if this line ends a definition and starts a pipe chain on next lines
    if (pipeCount === 1 || trimmed.includes('|>') || trimmed.includes('<|>')) {
      inPipeChain = true;
      pipeChainBaseIndent = originalIndent;
    } else if (!startsWithPipe) {
      inPipeChain = false;
    }

    // No breaking needed
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Count pipe operators (|> and <|>) outside of string literals
 */
function countPipesOutsideStrings(line: string): number {
  let count = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < line.length - 1; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    const nextNextChar = i < line.length - 2 ? line[i + 2] : '';
    const prevChar = i > 0 ? line[i - 1] : '';

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
    } else if (!inString) {
      // Check for <|> (must check before |>)
      if (char === '<' && nextChar === '|' && nextNextChar === '>') {
        count++;
        i += 2; // Skip the whole operator
      }
      // Check for |>
      else if (char === '|' && nextChar === '>') {
        count++;
        i++; // Skip the '>'
      }
    }
  }

  return count;
}

/**
 * Split a line by pipe operators (|> and <|>), respecting string literals
 * Returns segments and the operators used between them
 */
function splitByPipeOutsideStrings(line: string): { segments: string[], operators: string[] } {
  const segments: string[] = [];
  const operators: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : '';
    const nextNextChar = i < line.length - 2 ? line[i + 2] : '';
    const prevChar = i > 0 ? line[i - 1] : '';

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      current += char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      current += char;
    } else if (!inString) {
      // Check for <|> (must check before |>)
      if (char === '<' && nextChar === '|' && nextNextChar === '>') {
        // Found <|> - save current segment and skip the operator
        if (current.trim()) {
          segments.push(current.trim());
        }
        operators.push('<|>');
        current = '';
        i += 2; // Skip the whole '<|>' operator
      }
      // Check for |>
      else if (char === '|' && nextChar === '>') {
        // Found |> - save current segment and skip the operator
        if (current.trim()) {
          segments.push(current.trim());
        }
        operators.push('|>');
        current = '';
        i++; // Skip the '>'
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  // Add the last segment
  if (current.trim()) {
    segments.push(current.trim());
  }

  return { segments, operators };
}

/**
 * Normalize blank lines - single blank line between top-level definitions,
 * no multiple consecutive blank lines
 */
function normalizeBlankLines(code: string): string {
  const lines = code.split('\n');
  const result: string[] = [];
  let prevWasBlank = false;
  let prevWasTopLevel = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isBlank = trimmed === '';
    const isTopLevel = line.length > 0 && line[0] !== ' ' && line[0] !== '\t' && !isBlank;

    // Skip multiple consecutive blank lines
    if (isBlank && prevWasBlank) {
      continue;
    }

    // Add blank line before top-level definitions (if not already there)
    if (isTopLevel && !prevWasBlank && result.length > 0 && prevWasTopLevel) {
      // Check if current is a type signature that follows its related definition
      const prevLine = result[result.length - 1];
      const currentName = trimmed.split(/[\s:=]/)[0];
      const prevIsRelated = prevLine && prevLine.trim().startsWith(currentName);

      if (!prevIsRelated) {
        result.push('');
      }
    }

    result.push(line);
    prevWasBlank = isBlank;
    prevWasTopLevel = isTopLevel;
  }

  return result.join('\n');
}
