import { useState } from 'react';
import { FileExplorer } from './FileExplorer';
import { NamespaceBrowser } from './NamespaceBrowser';

interface NavigationProps {
  onFileClick: (path: string, name: string) => void;
  onDefinitionClick: (name: string, type: 'term' | 'type') => void;
}

export function Navigation({ onFileClick, onDefinitionClick }: NavigationProps) {
  const [localFilesExpanded, setLocalFilesExpanded] = useState(true);
  const [codebaseExpanded, setCodebaseExpanded] = useState(true);

  return (
    <div className="navigation">
      {/* Local Files Section */}
      <div className="nav-section">
        <div
          className="nav-section-header"
          onClick={() => setLocalFilesExpanded(!localFilesExpanded)}
        >
          <span className="nav-section-arrow">
            {localFilesExpanded ? '▼' : '▶'}
          </span>
          <span className="nav-section-title">Local Files</span>
        </div>
        {localFilesExpanded && (
          <div className="nav-section-content">
            <FileExplorer onFileClick={onFileClick} />
          </div>
        )}
      </div>

      {/* UCM Codebase Section */}
      <div className="nav-section">
        <div
          className="nav-section-header"
          onClick={() => setCodebaseExpanded(!codebaseExpanded)}
        >
          <span className="nav-section-arrow">
            {codebaseExpanded ? '▼' : '▶'}
          </span>
          <span className="nav-section-title">UCM Codebase</span>
        </div>
        {codebaseExpanded && (
          <div className="nav-section-content">
            <NamespaceBrowser onOpenDefinition={onDefinitionClick} />
          </div>
        )}
      </div>
    </div>
  );
}
