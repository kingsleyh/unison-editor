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

interface CodebaseActionsProps {
  onSuccess?: () => void;
  onRunAllWatchExpressions?: () => void;
  onRunAllTestExpressions?: () => void;
}

export function CodebaseActions({ onSuccess, onRunAllWatchExpressions, onRunAllTestExpressions }: CodebaseActionsProps) {
  const {
    activeTabId,
    getActiveTab,
    currentProject,
    currentBranch,
    refreshNamespace,
    refreshDefinitions,
    setRunOutput,
    setRunPaneCollapsed,
  } = useUnisonStore();
  const [isSaving, setIsSaving] = useState(false);

  const activeTab = getActiveTab();
  const hasContent = !!activeTab?.content?.trim();
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

  return (
    <div className="codebase-actions">
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
