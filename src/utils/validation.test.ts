import { describe, it, expect, vi } from 'vitest';
import {
  ProjectSchema,
  BranchSchema,
  DefinitionSchema,
  NamespaceItemSchema,
  TypecheckResultSchema,
  WorkspaceEditorStateSchema,
  safeParse,
  parseWithFallback,
  parseArrayFiltered,
  safeJsonParse,
} from './validation';

describe('Validation Schemas', () => {
  describe('ProjectSchema', () => {
    it('validates a valid project', () => {
      const result = ProjectSchema.safeParse({ name: 'myproject' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('myproject');
      }
    });

    it('validates a project with optional active_branch', () => {
      const result = ProjectSchema.safeParse({
        name: 'myproject',
        active_branch: 'main',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.active_branch).toBe('main');
      }
    });

    it('rejects empty name', () => {
      const result = ProjectSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing name', () => {
      const result = ProjectSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('BranchSchema', () => {
    it('validates a valid branch', () => {
      const result = BranchSchema.safeParse({ name: 'main' });
      expect(result.success).toBe(true);
    });

    it('validates branch with optional project', () => {
      const result = BranchSchema.safeParse({
        name: 'feature',
        project: 'myproject',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('DefinitionSchema', () => {
    it('validates a term definition', () => {
      const result = DefinitionSchema.safeParse({
        name: 'myFunction',
        type: 'term',
      });
      expect(result.success).toBe(true);
    });

    it('validates a type definition with hash', () => {
      const result = DefinitionSchema.safeParse({
        name: 'MyType',
        type: 'type',
        hash: '#abc123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = DefinitionSchema.safeParse({
        name: 'invalid',
        type: 'namespace', // invalid - should be term or type
      });
      expect(result.success).toBe(false);
    });
  });

  describe('NamespaceItemSchema', () => {
    it('validates a namespace item', () => {
      const result = NamespaceItemSchema.safeParse({
        name: 'subnamespace',
        type: 'namespace',
      });
      expect(result.success).toBe(true);
    });

    it('validates all item types', () => {
      const types = ['term', 'type', 'namespace'] as const;
      for (const type of types) {
        const result = NamespaceItemSchema.safeParse({
          name: 'item',
          type,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('TypecheckResultSchema', () => {
    it('validates a successful typecheck result', () => {
      const result = TypecheckResultSchema.safeParse({
        success: true,
        errors: [],
        watchResults: [],
        testResults: [],
        output: 'All good!',
      });
      expect(result.success).toBe(true);
    });

    it('validates a typecheck result with errors', () => {
      const result = TypecheckResultSchema.safeParse({
        success: false,
        errors: ['Type mismatch', 'Unknown identifier'],
        watchResults: [],
        testResults: [],
        output: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.errors).toHaveLength(2);
      }
    });

    it('validates a typecheck result with watch results', () => {
      const result = TypecheckResultSchema.safeParse({
        success: true,
        errors: [],
        watchResults: [
          { expression: 'x + y', result: '42', lineNumber: 5 },
        ],
        testResults: [],
        output: '',
      });
      expect(result.success).toBe(true);
    });

    it('validates a typecheck result with test results', () => {
      const result = TypecheckResultSchema.safeParse({
        success: true,
        errors: [],
        watchResults: [],
        testResults: [
          { name: 'test1', passed: true, message: '' },
          { name: 'test2', passed: false, message: 'Expected true, got false' },
        ],
        output: '',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.testResults[0].passed).toBe(true);
        expect(result.data.testResults[1].passed).toBe(false);
      }
    });
  });

  describe('WorkspaceEditorStateSchema', () => {
    it('validates a minimal workspace state', () => {
      const result = WorkspaceEditorStateSchema.safeParse({
        version: 2,
        tabs: [],
        activeTabId: null,
        autoRun: false,
        layout: {
          navPanelCollapsed: false,
          navPanelWidth: 250,
          workspaceExpanded: true,
          fileExplorerExpanded: true,
          ucmExplorerExpanded: true,
          sidebarSplitPercent: 50,
          termsPanelCollapsed: true,
          termsPanelWidth: 400,
          editorBottomSplitPercent: 65,
          bottomPanelCollapsed: false,
          ucmPanelCollapsed: false,
          outputPanelCollapsed: false,
          terminalPanelCollapsed: true,
          bottomPanelWidths: [40, 35, 25],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid version', () => {
      const result = WorkspaceEditorStateSchema.safeParse({
        version: 1, // Should be 2
        tabs: [],
        activeTabId: null,
        autoRun: false,
        layout: {
          navPanelCollapsed: false,
          navPanelWidth: 250,
          workspaceExpanded: true,
          fileExplorerExpanded: true,
          ucmExplorerExpanded: true,
          sidebarSplitPercent: 50,
          termsPanelCollapsed: true,
          termsPanelWidth: 400,
          editorBottomSplitPercent: 65,
          bottomPanelCollapsed: false,
          ucmPanelCollapsed: false,
          outputPanelCollapsed: false,
          terminalPanelCollapsed: true,
          bottomPanelWidths: [40, 35, 25],
        },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Validation Helpers', () => {
  describe('safeParse', () => {
    it('returns success with valid data', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = safeParse(ProjectSchema, { name: 'test' }, 'test');
      expect(result.success).toBe(true);
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns error and logs warning with invalid data', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = safeParse(ProjectSchema, { name: '' }, 'test');
      expect(result.success).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('parseWithFallback', () => {
    it('returns parsed data when valid', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseWithFallback(
        ProjectSchema,
        { name: 'test' },
        { name: 'fallback' },
        'test'
      );
      expect(result.name).toBe('test');
      consoleSpy.mockRestore();
    });

    it('returns fallback when invalid', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseWithFallback(
        ProjectSchema,
        { invalid: 'data' },
        { name: 'fallback' },
        'test'
      );
      expect(result.name).toBe('fallback');
      consoleSpy.mockRestore();
    });
  });

  describe('parseArrayFiltered', () => {
    it('filters out invalid items', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const items = [
        { name: 'valid1', type: 'term' },
        { name: '', type: 'term' }, // invalid - empty name
        { name: 'valid2', type: 'type' },
        { name: 'invalid', type: 'invalid' }, // invalid type
      ];
      const result = parseArrayFiltered(DefinitionSchema, items, 'test');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('valid1');
      expect(result[1].name).toBe('valid2');
      consoleSpy.mockRestore();
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON with valid schema', () => {
      const json = JSON.stringify({ name: 'test' });
      const result = safeJsonParse(json, ProjectSchema, 'test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('test');
      }
    });

    it('returns error for invalid JSON', () => {
      const result = safeJsonParse('not json', ProjectSchema, 'test');
      expect(result.success).toBe(false);
    });

    it('returns error for valid JSON but invalid schema', () => {
      const json = JSON.stringify({ invalid: 'data' });
      const result = safeJsonParse(json, ProjectSchema, 'test');
      expect(result.success).toBe(false);
    });
  });
});
