/**
 * Syntax help text for Unison keywords and literals
 * Ported from UCM Desktop's SyntaxSegmentHelp.elm
 */

export interface SyntaxHelp {
  title: string;
  description: string;
}

/**
 * Get help text for a syntax segment based on its type and content
 */
export function getHelpForSegment(
  segmentText: string,
  _segmentType?: string
): SyntaxHelp | null {
  const text = segmentText.trim();

  // Literals
  if (text.startsWith('"') && text.endsWith('"')) {
    return textLiteral;
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length === 3) {
    return charLiteral;
  }
  if (text.startsWith('0x') || /^[0-9]/.test(text)) {
    return numericLiteral;
  }
  if (text.startsWith('0xs')) {
    return bytesLiteral;
  }

  // Keywords
  switch (text) {
    case 'do':
      return doKeyword;
    case 'if':
    case 'then':
    case 'else':
      return ifElse;
    case 'match':
    case 'with':
      return matchWith;
    case 'cases':
      return cases;
    case 'handle':
      return handleWith;
    case 'type':
      return typeKeyword;
    case 'ability':
      return abilityKeyword;
    case 'where':
      return abilityWhere;
    case 'unique':
      return uniqueKeyword;
    case 'use':
      return useClause;
    case 'namespace':
      return namespaceKeyword;
    case '::':
      return cons;
    case ':+':
      return snoc;
    case '++':
      return concat;
    case '∀':
    case 'forall':
      return typeForall;
    case '->':
      return functionArrow;
    case 'let':
      return letBinding;
    case '!':
      return delayedForce;
    default:
      return null;
  }
}

// Literal help

const textLiteral: SyntaxHelp = {
  title: 'Text Literal',
  description: 'The value inside of the double quotes is a `Text` literal.',
};

const charLiteral: SyntaxHelp = {
  title: 'Char Literal',
  description:
    'The value inside of the single quotes is a `Char` (character) literal.',
};

const numericLiteral: SyntaxHelp = {
  title: 'Numeric Literal',
  description:
    'A numeric literal. By default, numeric literals in Unison have the type `Nat` (natural number).',
};

const bytesLiteral: SyntaxHelp = {
  title: 'Bytes Literal',
  description:
    'A `Bytes` literal. Bytes literals are prefixed with `0xs` and contain hexadecimal digits.',
};

// Keyword help

const doKeyword: SyntaxHelp = {
  title: 'do Keyword',
  description:
    '`do` introduces a delayed computation, something with the form `() -> a`.',
};

const ifElse: SyntaxHelp = {
  title: 'if-then-else',
  description:
    '`if condition then value1 else value2` evaluates the condition. If the condition is `true`, it evaluates to `value1`, otherwise `value2`.',
};

const matchWith: SyntaxHelp = {
  title: 'match-with',
  description:
    '`match value with` allows pattern matching on a value. Each pattern is tried in order, and the first matching pattern\'s body is evaluated.',
};

const cases: SyntaxHelp = {
  title: 'cases',
  description:
    '`cases` introduces an anonymous function that pattern matches on its argument. It\'s shorthand for `x -> match x with`.',
};

const handleWith: SyntaxHelp = {
  title: 'handle-with',
  description:
    '`handle expression with` allows handling ability requests made within the expression. Ability handlers define how ability operations are interpreted.',
};

const typeKeyword: SyntaxHelp = {
  title: 'type Keyword',
  description:
    '`type` declares a new data type. Data types can have multiple constructors and can be parameterized by type parameters.',
};

const abilityKeyword: SyntaxHelp = {
  title: 'ability Keyword',
  description:
    '`ability` declares a new ability type. Abilities define a set of operations that can be requested and handled.',
};

const abilityWhere: SyntaxHelp = {
  title: 'where Clause',
  description:
    'The `where` clause in an ability declaration specifies the operations (capabilities) that the ability provides.',
};

const uniqueKeyword: SyntaxHelp = {
  title: 'unique Keyword',
  description:
    '`unique type` declares a unique data type. Unique types have a globally unique identifier and cannot be duplicated even if defined identically elsewhere.',
};

const useClause: SyntaxHelp = {
  title: 'use Clause',
  description:
    '`use` brings names into scope. For example, `use base.List map` allows you to refer to `base.List.map` as just `map`.',
};

const namespaceKeyword: SyntaxHelp = {
  title: 'namespace Keyword',
  description:
    '`namespace` creates a new namespace for organizing definitions. Namespaces help structure codebases hierarchically.',
};

// Operator help

const cons: SyntaxHelp = {
  title: 'Cons Operator (::)',
  description:
    'The `::` operator prepends an element to the front of a list. For example, `1 :: [2, 3]` produces `[1, 2, 3]`.',
};

const snoc: SyntaxHelp = {
  title: 'Snoc Operator (:+)',
  description:
    'The `:+` operator appends an element to the end of a list. For example, `[1, 2] :+ 3` produces `[1, 2, 3]`.',
};

const concat: SyntaxHelp = {
  title: 'Concat Operator (++)',
  description:
    'The `++` operator concatenates two lists. For example, `[1, 2] ++ [3, 4]` produces `[1, 2, 3, 4]`. It can also concatenate text.',
};

const typeForall: SyntaxHelp = {
  title: 'Universal Quantification (∀)',
  description:
    'The `∀` (forall) introduces a universally quantified type variable. For example, `∀ a. a -> a` means "for all types a, a function from a to a".',
};

const functionArrow: SyntaxHelp = {
  title: 'Function Arrow (->)',
  description:
    'The `->` arrow separates the parameter type from the return type in a function type signature. For example, `Nat -> Text` is a function that takes a `Nat` and returns `Text`.',
};

const letBinding: SyntaxHelp = {
  title: 'let Binding',
  description:
    '`let name = value` creates a local binding. The name can be used in the expression following the let binding.',
};

const delayedForce: SyntaxHelp = {
  title: 'Force Operator (!)',
  description:
    'The `!` operator forces evaluation of a delayed computation. If `x` has type `() -> a`, then `!x` evaluates it to get a value of type `a`.',
};
