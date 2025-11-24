// TypeScript types for UCM annotated syntax
// Based on actual UCM API response format

// The annotation can be various types - we'll use a discriminated union
export type Annotation =
  | TypeReference
  | TermReference
  | HashQualifier
  | TypeAscriptionColon
  | UseKeyword
  | BindingEquals
  | DelayForceChar
  | AbilityBraces
  | ControlKeyword
  | TypeKeyword
  | LinkKeyword
  | DataTypeKeyword
  | DataTypeParams
  | DataTypeModifier
  | Parenthesized
  | AnnotationWithTag;

// Simple annotation with just a tag (covers many types)
export interface AnnotationWithTag {
  tag: string;
  contents?: any;
}

// Type reference annotation (hash string)
export interface TypeReference {
  tag: 'TypeReference';
  contents: string; // Hash
}

// Term reference annotation (hash string)
export interface TermReference {
  tag: 'TermReference';
  contents: string; // Hash
}

// Hash qualifier annotation
export interface HashQualifier {
  tag: 'HashQualifier';
  contents: string; // The name
}

// Type ascription colon
export interface TypeAscriptionColon {
  tag: 'TypeAscriptionColon';
}

// Use keyword
export interface UseKeyword {
  tag: 'UseKeyword';
}

// Binding equals
export interface BindingEquals {
  tag: 'BindingEquals';
}

// Delay/force character
export interface DelayForceChar {
  tag: 'DelayForceChar';
}

// Ability braces
export interface AbilityBraces {
  tag: 'AbilityBraces';
}

// Control keywords (if, then, else, etc)
export interface ControlKeyword {
  tag: 'ControlKeyword';
}

// Type keyword
export interface TypeKeyword {
  tag: 'TypeKeyword';
}

// Link keyword
export interface LinkKeyword {
  tag: 'LinkKeyword';
}

// Data type keyword
export interface DataTypeKeyword {
  tag: 'DataTypeKeyword';
}

// Data type params
export interface DataTypeParams {
  tag: 'DataTypeParams';
}

// Data type modifier
export interface DataTypeModifier {
  tag: 'DataTypeModifier';
}

// Parenthesized
export interface Parenthesized {
  tag: 'Parenthesized';
}

// Source segment from UCM API
export interface SourceSegment {
  segment: string;
  annotation?: Annotation | null;
}

// Updated DefinitionSummary to match Rust changes
export interface DefinitionSummary {
  name: string;
  hash: string;
  type: 'term' | 'type';
  signature?: string;
  source?: string; // Deprecated, kept for backwards compatibility
  segments: SourceSegment[]; // New: annotated segments for rich rendering
  documentation?: string;
  doc?: any; // Doc AST for Doc terms
  tag?: string; // "Plain", "Test", or "Doc"
}
