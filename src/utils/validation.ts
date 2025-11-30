import { z } from 'zod';

// =============================================================================
// Core UCM Data Schemas
// =============================================================================

/**
 * Project schema from UCM
 */
export const ProjectSchema = z.object({
  name: z.string().min(1),
  active_branch: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Branch schema from UCM
 */
export const BranchSchema = z.object({
  name: z.string().min(1),
  project: z.string().optional(),
});
export type Branch = z.infer<typeof BranchSchema>;

/**
 * Definition type enum
 */
export const DefinitionTypeSchema = z.enum(['term', 'type']);
export type DefinitionType = z.infer<typeof DefinitionTypeSchema>;

/**
 * Definition schema
 */
export const DefinitionSchema = z.object({
  name: z.string().min(1),
  hash: z.string().optional(),
  type: DefinitionTypeSchema,
  source: z.string().optional(),
});
export type Definition = z.infer<typeof DefinitionSchema>;

/**
 * Namespace item types
 */
export const NamespaceItemTypeSchema = z.enum(['term', 'type', 'namespace']);

/**
 * Namespace item from UCM list
 */
export const NamespaceItemSchema = z.object({
  name: z.string().min(1),
  type: NamespaceItemTypeSchema,
  hash: z.string().optional(),
});
export type NamespaceItem = z.infer<typeof NamespaceItemSchema>;

/**
 * Search result from UCM
 */
export const SearchResultSchema = z.object({
  name: z.string().min(1),
  type: DefinitionTypeSchema,
  hash: z.string(),
  snippet: z.string().optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

// =============================================================================
// UCM API Response Schemas
// =============================================================================

/**
 * Watch expression result
 */
export const WatchResultSchema = z.object({
  expression: z.string(),
  result: z.string(),
  lineNumber: z.number().int().min(1),
});
export type WatchResult = z.infer<typeof WatchResultSchema>;

/**
 * Test result
 */
export const TestResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

/**
 * Typecheck result from UCM
 */
export const TypecheckResultSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.string()),
  watchResults: z.array(WatchResultSchema),
  testResults: z.array(TestResultSchema),
  output: z.string(),
});
export type TypecheckResult = z.infer<typeof TypecheckResultSchema>;

/**
 * Run tests result
 */
export const RunTestsResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  errors: z.array(z.string()),
  testResults: z.array(TestResultSchema),
});
export type RunTestsResult = z.infer<typeof RunTestsResultSchema>;

/**
 * Run function result
 */
export const RunFunctionResultSchema = z.object({
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  output: z.string(),
  errors: z.array(z.string()),
});
export type RunFunctionResult = z.infer<typeof RunFunctionResultSchema>;

/**
 * Current context from UCM
 */
export const CurrentContextSchema = z.object({
  project: ProjectSchema.nullable(),
  branch: BranchSchema.nullable(),
  path: z.string(),
});
export type CurrentContext = z.infer<typeof CurrentContextSchema>;

// =============================================================================
// Definition Summary Schema (from syntax types)
// =============================================================================

/**
 * Syntax element for annotated source
 */
export const SyntaxElementSchema = z.object({
  type: z.string(),
  text: z.string(),
  hash: z.string().optional(),
  fqn: z.string().optional(),
});
export type SyntaxElement = z.infer<typeof SyntaxElementSchema>;

/**
 * Doc block for documentation
 */
export const DocBlockSchema: z.ZodType<DocBlock> = z.lazy(() =>
  z.object({
    type: z.enum(['paragraph', 'section', 'code', 'list', 'callout', 'signature', 'source']),
    content: z.union([z.string(), z.array(DocBlockSchema)]).optional(),
    heading: z.string().optional(),
    language: z.string().optional(),
    items: z.array(DocBlockSchema).optional(),
    level: z.enum(['tip', 'important', 'warning', 'caution']).optional(),
  })
);
export type DocBlock = {
  type: 'paragraph' | 'section' | 'code' | 'list' | 'callout' | 'signature' | 'source';
  content?: string | DocBlock[];
  heading?: string;
  language?: string;
  items?: DocBlock[];
  level?: 'tip' | 'important' | 'warning' | 'caution';
};

/**
 * Definition summary from UCM
 */
export const DefinitionSummarySchema = z.object({
  name: z.string(),
  hash: z.string(),
  type: DefinitionTypeSchema,
  signature: z.string().optional(),
  source: z.string().optional(),
  annotatedSource: z.array(SyntaxElementSchema).optional(),
  docs: z.string().nullable().optional(),
  parsedDocs: z.array(DocBlockSchema).nullable().optional(),
});
export type DefinitionSummary = z.infer<typeof DefinitionSummarySchema>;

// =============================================================================
// Workspace Config Schemas
// =============================================================================

/**
 * Persisted tab state
 */
export const PersistedTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  filePath: z.string().optional(),
  content: z.string().optional(),
  language: z.string(),
});
export type PersistedTab = z.infer<typeof PersistedTabSchema>;

/**
 * Window state
 */
export const WindowStateSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  x: z.number().optional(),
  y: z.number().optional(),
  isMaximized: z.boolean().optional(),
});
export type WindowState = z.infer<typeof WindowStateSchema>;

/**
 * Layout state
 */
export const LayoutStateSchema = z.object({
  navPanelCollapsed: z.boolean(),
  navPanelWidth: z.number().positive(),
  workspaceExpanded: z.boolean(),
  fileExplorerExpanded: z.boolean(),
  ucmExplorerExpanded: z.boolean(),
  sidebarSplitPercent: z.number().min(0).max(100),
  termsPanelCollapsed: z.boolean(),
  termsPanelWidth: z.number().positive(),
  editorBottomSplitPercent: z.number().min(0).max(100),
  bottomPanelCollapsed: z.boolean(),
  ucmPanelCollapsed: z.boolean(),
  outputPanelCollapsed: z.boolean(),
  terminalPanelCollapsed: z.boolean(),
  bottomPanelWidths: z.array(z.number()),
  windowState: WindowStateSchema.optional(),
});
export type LayoutState = z.infer<typeof LayoutStateSchema>;

/**
 * Workspace editor state (persisted to disk)
 */
export const WorkspaceEditorStateSchema = z.object({
  version: z.literal(2),
  tabs: z.array(PersistedTabSchema),
  activeTabId: z.string().nullable(),
  autoRun: z.boolean(),
  layout: LayoutStateSchema,
  definitionCards: z
    .array(
      z.object({
        id: z.string(),
        pendingIdentifier: z.string(),
      })
    )
    .optional(),
  selectedCardId: z.string().nullable().optional(),
});
export type WorkspaceEditorState = z.infer<typeof WorkspaceEditorStateSchema>;

/**
 * Workspace config
 */
export const WorkspaceConfigSchema = z.object({
  version: z.literal(1),
  linkedProject: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Safe parse with logging for debugging
 */
export function safeParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[Validation] ${context} failed:`, result.error.issues);
  }
  return result;
}

/**
 * Parse with fallback value
 */
export function parseWithFallback<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fallback: T,
  context: string
): T {
  const result = safeParse(schema, data, context);
  if (result.success) {
    return result.data;
  }
  return fallback;
}

/**
 * Parse array with filtering invalid items
 */
export function parseArrayFiltered<T>(
  schema: z.ZodSchema<T>,
  data: unknown[],
  context: string
): T[] {
  return data
    .map((item, index) => {
      const result = schema.safeParse(item);
      if (!result.success) {
        console.warn(`[Validation] ${context}[${index}] invalid, skipping:`, result.error.issues);
        return null;
      }
      return result.data;
    })
    .filter((item): item is T => item !== null);
}

/**
 * Safe JSON parse with schema validation
 */
export function safeJsonParse<T>(
  json: string,
  schema: z.ZodSchema<T>,
  _context: string
): { success: true; data: T } | { success: false; error: Error } {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: new Error(`Validation failed: ${result.error.message}`) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}
