/**
 * Service for detecting runnable Unison functions.
 *
 * Runnable functions are those with both IO and Exception abilities in their type signature.
 * Example:
 *
 *   myStuff : '{IO, Exception} ()
 *   myStuff _ = printLine "Hello"
 *
 * When run via UCM's `run` command, the function is executed and output is captured.
 */

export interface RunnableFunction {
  /** The function name */
  name: string;
  /** Line number where the type signature is (1-based) */
  lineNumber: number;
  /** The full type signature line */
  fullLine: string;
}

/**
 * Detect functions with IO and Exception abilities in their type signature.
 *
 * Matches patterns like:
 * - `name : '{IO, Exception} result`
 * - `name : '{Exception, IO} result`
 * - `name : '{IO, Exception, Abort} result`
 * - `name : '{Store s, IO, Exception} result`
 * - `name : '{io2.IO, Exception} result`
 *
 * The abilities can be in any order with other abilities mixed in.
 */
export function detectRunnableFunctions(code: string): RunnableFunction[] {
  const lines = code.split('\n');
  const runnables: RunnableFunction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Look for type annotation pattern: name : '{abilities} returnType
    // The pattern must include both IO (or io2.IO) and Exception
    const match = trimmed.match(/^(\S+)\s*:\s*'\{([^}]+)\}/);

    if (match) {
      const name = match[1];
      const abilities = match[2];

      // Check if abilities include both IO and Exception
      // IO can be written as "IO" or "io2.IO"
      const hasIO = /\bIO\b/.test(abilities) || /\bio2\.IO\b/.test(abilities);
      const hasException = /\bException\b/.test(abilities);

      if (hasIO && hasException) {
        runnables.push({
          name,
          lineNumber: i + 1, // Monaco uses 1-based line numbers
          fullLine: line,
        });
      }
    }
  }

  return runnables;
}

/**
 * Check if a specific line contains a runnable function signature.
 */
export function isRunnableFunctionLine(lineContent: string): boolean {
  const trimmed = lineContent.trimStart();
  const match = trimmed.match(/^(\S+)\s*:\s*'\{([^}]+)\}/);

  if (match) {
    const abilities = match[2];
    const hasIO = /\bIO\b/.test(abilities) || /\bio2\.IO\b/.test(abilities);
    const hasException = /\bException\b/.test(abilities);
    return hasIO && hasException;
  }

  return false;
}

/**
 * Get the function name from a runnable function line.
 */
export function getRunnableFunctionName(lineContent: string): string {
  const trimmed = lineContent.trimStart();
  const match = trimmed.match(/^(\S+)\s*:\s*'\{([^}]+)\}/);

  if (match) {
    const abilities = match[2];
    const hasIO = /\bIO\b/.test(abilities) || /\bio2\.IO\b/.test(abilities);
    const hasException = /\bException\b/.test(abilities);

    if (hasIO && hasException) {
      return match[1];
    }
  }

  return '';
}
