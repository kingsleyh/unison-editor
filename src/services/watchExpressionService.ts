/**
 * Service for detecting and managing Unison watch expressions.
 *
 * Watch expressions are lines starting with ">" that evaluate expressions
 * and display results. Example:
 *
 *   > 1 + 2
 *   > List.map (x -> x * 2) [1, 2, 3]
 */

export interface WatchExpression {
  lineNumber: number;
  expression: string;
  /** The full line content including the ">" prefix */
  fullLine: string;
}

/**
 * Detect watch expressions in code.
 * Returns an array of watch expressions with their line numbers.
 */
export function detectWatchExpressions(code: string): WatchExpression[] {
  const lines = code.split('\n');
  const watches: WatchExpression[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Check if line starts with ">" followed by whitespace or end of line
    if (trimmed.startsWith('>') && (trimmed.length === 1 || /^>\s/.test(trimmed))) {
      watches.push({
        lineNumber: i + 1, // Monaco uses 1-based line numbers
        expression: trimmed.slice(1).trim(),
        fullLine: line,
      });
    }
  }

  return watches;
}

/**
 * Check if a specific line is a watch expression.
 */
export function isWatchExpressionLine(lineContent: string): boolean {
  const trimmed = lineContent.trimStart();
  return trimmed.startsWith('>') && (trimmed.length === 1 || /^>\s/.test(trimmed));
}

/**
 * Get the expression from a watch line (strip the leading ">").
 */
export function getWatchExpression(lineContent: string): string {
  const trimmed = lineContent.trimStart();
  if (trimmed.startsWith('>')) {
    return trimmed.slice(1).trim();
  }
  return '';
}

/**
 * Build code that includes all definitions but only a single watch expression.
 * This allows running one watch expression while still having access to
 * any functions/values defined in the file.
 *
 * Instead of removing lines (which can break Unison syntax), we comment out
 * other watch expressions and test expressions.
 *
 * @param fullCode The full editor content
 * @param targetLineNumber The line number of the watch expression to include (1-based)
 * @returns Code with all definitions but only the target watch expression
 */
export function buildSingleWatchCode(fullCode: string, targetLineNumber: number): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // Monaco uses 1-based line numbers
    const trimmed = line.trimStart();

    if (isWatchExpressionLine(line)) {
      // Only include this watch expression if it's the target line
      if (lineNumber === targetLineNumber) {
        resultLines.push(line);
      } else {
        // Comment out other watch expressions
        resultLines.push('-- ' + line);
      }
    } else if (trimmed.startsWith('test>')) {
      // Comment out inline test expressions
      resultLines.push('-- ' + line);
    } else {
      // Include all other lines (definitions, comments, test.verify blocks, etc.)
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

// ============================================================================
// Test Expression Support
// ============================================================================

export interface TestExpression {
  lineNumber: number;
  name: string; // e.g., "square.tests.ex1" or "test.verify"
  fullLine: string;
  type: 'test>' | 'test.verify';
}

/**
 * Detect test expressions in code.
 * Only matches lines starting with "test>" (runnable test expressions).
 * Note: test.verify do lines are definitions that produce [test.Result] values,
 * they're run via test> lines (e.g., "test> myTests").
 */
export function detectTestExpressions(code: string): TestExpression[] {
  const lines = code.split('\n');
  const tests: TestExpression[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith('test>')) {
      // Inline test: "test> square.tests.ex1 = ..." or "test> myTests"
      const afterPrefix = trimmed.slice(5).trim();
      // Name is either before "=" or the whole expression if no "="
      const name = afterPrefix.includes('=')
        ? afterPrefix.split('=')[0].trim()
        : afterPrefix.trim();

      tests.push({
        lineNumber: i + 1,
        name: name || 'test',
        fullLine: line,
        type: 'test>',
      });
    }
  }

  return tests;
}

/**
 * Check if a specific line is a runnable test expression (test> line).
 * Note: test.verify do lines are definitions, not runnable - they're run via test> lines.
 */
export function isTestExpressionLine(lineContent: string): boolean {
  const trimmed = lineContent.trimStart();
  return trimmed.startsWith('test>');
}

/**
 * Get the test name from a test line.
 */
export function getTestName(lineContent: string): string {
  const trimmed = lineContent.trimStart();

  if (trimmed.startsWith('test>')) {
    // Inline test: "test> square.tests.ex1 = ..."
    const afterPrefix = trimmed.slice(5).trim();
    const name = afterPrefix.split('=')[0].trim();
    return name || 'test';
  } else if (trimmed.includes('test.verify do')) {
    // Property test: "name = test.verify do"
    const match = trimmed.match(/^(\S+)\s*=\s*test\.verify\s+do/);
    return match ? match[1] : 'test.verify';
  }

  return 'test';
}

/**
 * Build code that includes all definitions but only a single test expression.
 * For test.verify blocks, includes the entire indented block.
 *
 * Instead of removing lines (which can break Unison syntax), we comment out
 * other test expressions and watch expressions.
 *
 * @param fullCode The full editor content
 * @param targetLineNumber The line number of the test expression to include (1-based)
 * @returns Code with all definitions but only the target test expression
 */
export function buildSingleTestCode(fullCode: string, targetLineNumber: number): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];
  const trimmedTarget = lines[targetLineNumber - 1]?.trimStart() || '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmed = line.trimStart();

    if (isWatchExpressionLine(line)) {
      // Comment out watch expressions
      resultLines.push('-- ' + line);
    } else if (trimmed.startsWith('test>')) {
      // Only include the target test> expression
      if (lineNumber === targetLineNumber) {
        resultLines.push(line);
      } else {
        // Comment out other test> expressions
        resultLines.push('-- ' + line);
      }
    } else {
      // Include all other lines (definitions, comments, test.verify blocks, etc.)
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

/**
 * Build code that includes all definitions and ALL watch expressions, but NO tests.
 * Used for "Run All Watch Expressions".
 *
 * Instead of removing lines (which can break Unison syntax), we comment out test expressions.
 */
export function buildAllWatchesCode(fullCode: string): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith('test>')) {
      // Comment out inline test expressions
      resultLines.push('-- ' + line);
    } else {
      // Include everything else (definitions, watch expressions, test.verify blocks as definitions)
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

/**
 * Build code that includes all definitions and ALL tests, but NO watch expressions.
 * Used for "Run All Tests".
 *
 * Instead of removing lines (which can break Unison syntax), we comment out watch expressions.
 */
export function buildAllTestsCode(fullCode: string): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isWatchExpressionLine(line)) {
      // Comment out watch expressions
      resultLines.push('-- ' + line);
    } else {
      // Include everything else (definitions and tests)
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}
