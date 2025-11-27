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
 * @param fullCode The full editor content
 * @param targetLineNumber The line number of the watch expression to include (1-based)
 * @returns Code with all definitions but only the target watch expression
 */
export function buildSingleWatchCode(fullCode: string, targetLineNumber: number): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];
  const tests = detectTestExpressions(fullCode);
  const testLineNumbers = new Set(tests.map(t => t.lineNumber));

  // Find test.verify block ranges to skip
  const testBlockRanges: Array<{start: number, end: number}> = [];
  for (const test of tests) {
    if (test.type === 'test.verify') {
      const startLine = test.lineNumber;
      const startIndent = lines[startLine - 1].search(/\S/);
      let endLine = startLine;

      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;
        const indent = line.search(/\S/);
        if (indent <= startIndent && line.trim() !== '' && i > startLine - 1) {
          break;
        }
        endLine = i + 1;
      }

      testBlockRanges.push({ start: startLine, end: endLine });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // Monaco uses 1-based line numbers

    // Skip test expressions
    if (testLineNumbers.has(lineNumber)) {
      continue;
    }

    // Skip lines inside test.verify blocks
    const inTestBlock = testBlockRanges.some(r => lineNumber > r.start && lineNumber <= r.end);
    if (inTestBlock) {
      continue;
    }

    if (isWatchExpressionLine(line)) {
      // Only include this watch expression if it's the target line
      if (lineNumber === targetLineNumber) {
        resultLines.push(line);
      }
      // Skip other watch expressions
    } else {
      // Include all non-watch, non-test lines (definitions, comments, etc.)
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
 * Matches:
 * - Lines starting with "test>" (inline tests)
 * - Lines containing "test.verify do" (property-based tests)
 */
export function detectTestExpressions(code: string): TestExpression[] {
  const lines = code.split('\n');
  const tests: TestExpression[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith('test>')) {
      // Inline test: "test> square.tests.ex1 = ..."
      const afterPrefix = trimmed.slice(5).trim();
      const name = afterPrefix.split('=')[0].trim();

      tests.push({
        lineNumber: i + 1,
        name,
        fullLine: line,
        type: 'test>',
      });
    } else if (trimmed.includes('test.verify do')) {
      // Property test: "name = test.verify do" or standalone "test.verify do"
      // Try to extract name from "name = test.verify do"
      const match = trimmed.match(/^(\S+)\s*=\s*test\.verify\s+do/);
      const name = match ? match[1] : 'test.verify';

      tests.push({
        lineNumber: i + 1,
        name,
        fullLine: line,
        type: 'test.verify',
      });
    }
  }

  return tests;
}

/**
 * Check if a specific line is a test expression.
 */
export function isTestExpressionLine(lineContent: string): boolean {
  const trimmed = lineContent.trimStart();
  return trimmed.startsWith('test>') || trimmed.includes('test.verify do');
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
 * @param fullCode The full editor content
 * @param targetLineNumber The line number of the test expression to include (1-based)
 * @returns Code with all definitions but only the target test expression
 */
export function buildSingleTestCode(fullCode: string, targetLineNumber: number): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];
  const tests = detectTestExpressions(fullCode);
  const targetTest = tests.find((t) => t.lineNumber === targetLineNumber);

  if (!targetTest) {
    return fullCode; // Fallback
  }

  // Find the end of the target test block (for test.verify)
  let targetEndLine = targetLineNumber;
  if (targetTest.type === 'test.verify') {
    // Find the end of the indented block
    const startIndent = lines[targetLineNumber - 1].search(/\S/);
    for (let i = targetLineNumber; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue; // Skip empty lines
      const indent = line.search(/\S/);
      if (indent <= startIndent && line.trim() !== '') {
        break; // Found a line at same or less indentation
      }
      targetEndLine = i + 1;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check if this line is part of a test
    const testAtLine = tests.find((t) => t.lineNumber === lineNumber);

    if (testAtLine) {
      if (lineNumber === targetLineNumber) {
        // Include target test
        resultLines.push(line);
      }
      // Skip other tests
    } else if (lineNumber > targetLineNumber && lineNumber <= targetEndLine) {
      // Include continuation of target test.verify block
      resultLines.push(line);
    } else if (isWatchExpressionLine(line)) {
      // Skip watch expressions
    } else {
      // Include definitions
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

/**
 * Build code that includes all definitions and ALL watch expressions, but NO tests.
 * Used for "Run All Watch Expressions".
 */
export function buildAllWatchesCode(fullCode: string): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];
  const tests = detectTestExpressions(fullCode);
  const testLineNumbers = new Set(tests.map(t => t.lineNumber));

  // Find test.verify block ranges to skip
  const testBlockRanges: Array<{start: number, end: number}> = [];
  for (const test of tests) {
    if (test.type === 'test.verify') {
      const startLine = test.lineNumber;
      const startIndent = lines[startLine - 1].search(/\S/);
      let endLine = startLine;

      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;
        const indent = line.search(/\S/);
        if (indent <= startIndent && line.trim() !== '' && i > startLine - 1) {
          break;
        }
        endLine = i + 1;
      }

      testBlockRanges.push({ start: startLine, end: endLine });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip test expressions
    if (testLineNumbers.has(lineNumber)) {
      continue;
    }

    // Skip lines inside test.verify blocks
    const inTestBlock = testBlockRanges.some(r => lineNumber > r.start && lineNumber <= r.end);
    if (inTestBlock) {
      continue;
    }

    // Include everything else (definitions and watch expressions)
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

/**
 * Build code that includes all definitions and ALL tests, but NO watch expressions.
 * Used for "Run All Tests".
 */
export function buildAllTestsCode(fullCode: string): string {
  const lines = fullCode.split('\n');
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip watch expressions
    if (isWatchExpressionLine(line)) {
      continue;
    }

    // Include everything else (definitions and tests)
    resultLines.push(line);
  }

  return resultLines.join('\n');
}
