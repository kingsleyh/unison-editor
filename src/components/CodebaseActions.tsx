import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUnisonStore } from '../store/unisonStore';
import { getDefinitionResolver } from '../services/definitionResolver';
import { detectWatchExpressions, detectTestExpressions } from '../services/watchExpressionService';

interface UpdateResult {
  success: boolean;
  output: string;
  errors: string[];
}

interface DiagnosticCount {
  errors: number;
  warnings: number;
}

interface CodebaseActionsProps {
  onSuccess?: () => void;
  onTypecheckAll?: () => void;
  onRunAllWatchExpressions?: () => void;
  onRunAllTestExpressions?: () => void;
  diagnosticCount?: DiagnosticCount;
}

export function CodebaseActions({ onSuccess, onTypecheckAll, onRunAllWatchExpressions, onRunAllTestExpressions, diagnosticCount }: CodebaseActionsProps) {
  const {
    activeTabId,
    getActiveTab,
    currentProject,
    currentBranch,
    refreshNamespace,
    refreshDefinitions,
    setRunOutput,
    setRunPaneCollapsed,
    autoRun,
    setAutoRun,
  } = useUnisonStore();
  const [isSaving, setIsSaving] = useState(false);

  const activeTab = getActiveTab();
  const hasContent = !!activeTab?.content?.trim();
  const isUnisonFile = activeTab?.title?.endsWith('.u') || activeTab?.filePath?.endsWith('.u') || activeTab?.language === 'unison';
  const hasWatchExpressions = activeTab?.content
    ? detectWatchExpressions(activeTab.content).length > 0
    : false;
  const hasTestExpressions = activeTab?.content
    ? detectTestExpressions(activeTab.content).length > 0
    : false;

  async function handleSaveToCodebase() {
    if (!activeTab?.content?.trim()) {
      setRunOutput({
        type: 'error',
        message: 'No code to save. Write some definitions first.',
      });
      setRunPaneCollapsed(false); // Expand to show message
      return;
    }

    if (!currentProject || !currentBranch) {
      setRunOutput({
        type: 'error',
        message: 'No project/branch selected. Select a project first.',
      });
      setRunPaneCollapsed(false);
      return;
    }

    setIsSaving(true);
    setRunOutput({ type: 'info', message: 'Saving to codebase...' });
    setRunPaneCollapsed(false); // Expand to show progress

    try {
      const result = await invoke<UpdateResult>('ucm_update', {
        code: activeTab.content,
        projectName: currentProject.name,
        branchName: currentBranch.name,
      });

      if (result.success) {
        setRunOutput({
          type: 'success',
          message: result.output || 'Saved to codebase',
        });

        // Clear the definition resolver cache so we get fresh data
        getDefinitionResolver().clearCache();

        // Refresh the namespace browser to show new definitions
        refreshNamespace();

        // Trigger definition refresh to reload any open definition cards
        refreshDefinitions();

        if (onSuccess) {
          onSuccess();
        }
      } else {
        // Show the first error, or the full output if no specific errors
        const errorText = result.errors.length > 0
          ? result.errors[0]
          : result.output || 'Failed to save to codebase';

        setRunOutput({
          type: 'error',
          message: errorText,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for common error cases
      if (errorMessage.includes('Failed to spawn ucm mcp')) {
        setRunOutput({
          type: 'error',
          message: 'UCM not found. Make sure UCM is installed and in your PATH.',
        });
      } else {
        setRunOutput({
          type: 'error',
          message: `Failed to save: ${errorMessage}`,
        });
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!activeTabId) {
    return null;
  }

  const hasProblems = diagnosticCount && (diagnosticCount.errors > 0 || diagnosticCount.warnings > 0);

  return (
    <div className="codebase-actions">
      {/* Auto-run slider toggle - show for all .u files */}
      {isUnisonFile && (
        <label className="auto-run-slider" title="Auto-run typecheck on file changes">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => setAutoRun(e.target.checked)}
          />
          <span className="slider"></span>
          <span className="auto-run-label">Auto</span>
        </label>
      )}
      {/* Only show run buttons when auto-run is off */}
      {!autoRun && (
        <>
          {/* Typecheck All button - blue */}
          {isUnisonFile && (
            <button
              className="codebase-action-btn typecheck-all-btn"
              onClick={onTypecheckAll}
              disabled={!currentProject || !currentBranch || !hasContent}
              title="Typecheck file"
            >
              ▶▶
            </button>
          )}
          {/* Run All Tests button - green */}
          {hasTestExpressions && (
            <button
              className="codebase-action-btn run-all-tests-btn"
              onClick={onRunAllTestExpressions}
              disabled={!currentProject || !currentBranch}
              title="Run all tests"
            >
              ▶▶
            </button>
          )}
          {/* Run All Watches button - gold */}
          {hasWatchExpressions && (
            <button
              className="codebase-action-btn run-all-watch-btn"
              onClick={onRunAllWatchExpressions}
              disabled={!currentProject || !currentBranch}
              title="Run all watch expressions"
            >
              ▶▶
            </button>
          )}
        </>
      )}
      {/* Status indicator - to the left of Save to Codebase */}
      <div className={`editor-status-indicator ${hasProblems ? 'has-problems' : 'all-good'}`}>
        {hasProblems ? (
          <>
            <span className="status-icon">✗</span>
            <span className="status-text">
              {diagnosticCount.errors > 0 && `${diagnosticCount.errors} error${diagnosticCount.errors > 1 ? 's' : ''}`}
              {diagnosticCount.errors > 0 && diagnosticCount.warnings > 0 && ', '}
              {diagnosticCount.warnings > 0 && `${diagnosticCount.warnings} warning${diagnosticCount.warnings > 1 ? 's' : ''}`}
            </span>
          </>
        ) : (
          <>
            <span className="status-icon">✓</span>
            <span className="status-text">OK</span>
          </>
        )}
      </div>
      <button
        className="codebase-action-btn update-btn"
        onClick={handleSaveToCodebase}
        disabled={isSaving || !hasContent || !currentProject || !currentBranch}
        title={
          !hasContent
            ? 'Write some code first'
            : !currentProject || !currentBranch
            ? 'Select a project and branch first'
            : 'Save definitions to codebase (add/update)'
        }
      >
        {isSaving ? 'Saving...' : 'Save to Codebase'}
      </button>
    </div>
  );
}
