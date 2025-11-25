import { useEffect, useState } from 'react';
import { Editor as MonacoEditor } from '@monaco-editor/react';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import type { DefinitionSummary } from '../types/syntax';

interface DefinitionViewerProps {
  selectedDefinition: { name: string; type: 'term' | 'type' } | null;
  onAddToScratch: (source: string, name: string) => void;
}

export function DefinitionViewer({
  selectedDefinition,
  onAddToScratch,
}: DefinitionViewerProps) {
  const { currentProject, currentBranch } = useUnisonStore();
  const [definition, setDefinition] = useState<DefinitionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = getUCMApiClient();

  useEffect(() => {
    if (selectedDefinition && currentProject && currentBranch) {
      loadDefinition();
    } else {
      setDefinition(null);
      setError(null);
    }
  }, [selectedDefinition, currentProject, currentBranch]);

  async function loadDefinition() {
    if (!selectedDefinition || !currentProject || !currentBranch) return;

    setLoading(true);
    setError(null);
    try {
      const def = await client.getDefinition(
        currentProject.name,
        currentBranch.name,
        selectedDefinition.name
      );

      if (!def) {
        setError(`Definition not found: ${selectedDefinition.name}`);
        setDefinition(null);
      } else {
        setDefinition(def);
      }
    } catch (err) {
      setError(`Failed to load definition: ${err}`);
      setDefinition(null);
      console.error('Error loading definition:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleAddToScratch() {
    if (definition) {
      onAddToScratch(definition.source, definition.name);
    }
  }

  if (!selectedDefinition) {
    return (
      <div className="definition-viewer empty">
        <div className="empty-state">
          <p>Select a definition from the navigation to view it</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="definition-viewer">
        <div className="definition-loading">Loading definition...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="definition-viewer">
        <div className="definition-error">{error}</div>
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="definition-viewer empty">
        <div className="empty-state">
          <p>Definition not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="definition-viewer">
      <div className="definition-header">
        <div className="definition-info">
          <h3 className="definition-name">{definition.name}</h3>
          <div className="definition-meta">
            <span className="definition-type">{definition.type}</span>
            <span className="definition-hash" title={definition.hash}>
              {definition.hash.substring(0, 16)}...
            </span>
          </div>
          {definition.signature && (
            <div className="definition-signature">{definition.signature}</div>
          )}
        </div>
        <button
          className="add-to-scratch-btn"
          onClick={handleAddToScratch}
          title="Add this definition to the scratch file"
        >
          Add to Scratch
        </button>
      </div>

      {definition.documentation && (
        <div className="definition-docs">
          <div className="docs-label">Documentation:</div>
          <div className="docs-content">{definition.documentation}</div>
        </div>
      )}

      <div className="definition-source">
        <MonacoEditor
          language="unison"
          value={definition.source}
          theme="unison-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
            },
          }}
        />
      </div>
    </div>
  );
}
