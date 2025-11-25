import { useState } from 'react';
import { useUnisonStore } from '../store/unisonStore';
import { ConnectionStatus } from './ConnectionStatus';

interface CodebaseActionsProps {
  onAdd?: () => void;
  onUpdate?: () => void;
}

export function CodebaseActions({ onAdd, onUpdate }: CodebaseActionsProps) {
  const { activeTabId, getActiveTab } = useUnisonStore();
  const [isAdding, setIsAdding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const activeTab = getActiveTab();
  const hasUnsavedChanges = activeTab?.isDirty ?? false;
  const hasFilePath = !!activeTab?.filePath;

  async function handleAdd() {
    if (!activeTab || !activeTab.filePath) {
      setMessage({
        type: 'error',
        text: 'No file open. Save the file first.',
      });
      return;
    }

    if (hasUnsavedChanges) {
      setMessage({
        type: 'error',
        text: 'File has unsaved changes. Save the file first.',
      });
      return;
    }

    setIsAdding(true);
    setMessage({ type: 'info', text: 'Adding to codebase...' });

    try {
      // TODO: Implement actual UCM add command
      // This would call UCM via CLI or LSP custom command
      // await invoke('ucm_add', { filePath: activeTab.filePath });

      // For now, just show a placeholder message
      await new Promise(resolve => setTimeout(resolve, 1000));

      setMessage({
        type: 'success',
        text: 'Successfully added to codebase!',
      });

      if (onAdd) {
        onAdd();
      }

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to add: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleUpdate() {
    if (!activeTab || !activeTab.filePath) {
      setMessage({
        type: 'error',
        text: 'No file open. Save the file first.',
      });
      return;
    }

    if (hasUnsavedChanges) {
      setMessage({
        type: 'error',
        text: 'File has unsaved changes. Save the file first.',
      });
      return;
    }

    setIsUpdating(true);
    setMessage({ type: 'info', text: 'Updating codebase...' });

    try {
      // TODO: Implement actual UCM update command
      // This would call UCM via CLI or LSP custom command
      // await invoke('ucm_update', { filePath: activeTab.filePath });

      // For now, just show a placeholder message
      await new Promise(resolve => setTimeout(resolve, 1000));

      setMessage({
        type: 'success',
        text: 'Successfully updated codebase!',
      });

      if (onUpdate) {
        onUpdate();
      }

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Failed to update: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsUpdating(false);
    }
  }

  if (!activeTabId) {
    return null;
  }

  return (
    <div className="codebase-actions">
      <div className="codebase-actions-buttons">
        <button
          className="codebase-action-btn add-btn"
          onClick={handleAdd}
          disabled={isAdding || !hasFilePath || hasUnsavedChanges}
          title={
            !hasFilePath
              ? 'Save file first'
              : hasUnsavedChanges
              ? 'Save unsaved changes first'
              : 'Add definitions to codebase'
          }
        >
          {isAdding ? 'Adding...' : 'Add to Codebase'}
        </button>

        <button
          className="codebase-action-btn update-btn"
          onClick={handleUpdate}
          disabled={isUpdating || !hasFilePath || hasUnsavedChanges}
          title={
            !hasFilePath
              ? 'Save file first'
              : hasUnsavedChanges
              ? 'Save unsaved changes first'
              : 'Update definitions in codebase'
          }
        >
          {isUpdating ? 'Updating...' : 'Update Codebase'}
        </button>
        <ConnectionStatus />
      </div>

      {message && (
        <div className={`codebase-actions-message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
