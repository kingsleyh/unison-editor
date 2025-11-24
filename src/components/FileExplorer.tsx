import { useState } from 'react';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  isExpanded?: boolean;
}

interface FileExplorerProps {
  onFileClick: (path: string, name: string) => void;
}

export function FileExplorer({ onFileClick }: FileExplorerProps) {
  // For now, use in-memory file list. Will be replaced with actual file system
  const [files] = useState<FileNode[]>([
    {
      name: 'scratch.u',
      path: 'scratch.u',
      isDirectory: false,
    },
  ]);

  function handleFileClick(file: FileNode) {
    if (!file.isDirectory) {
      onFileClick(file.path, file.name);
    }
  }

  function getFileIcon(isDirectory: boolean) {
    return isDirectory ? '📁' : '📄';
  }

  if (files.length === 0) {
    return (
      <div className="file-explorer-empty">
        <p>No local files</p>
        <p className="hint">Create a new scratch file to get started</p>
      </div>
    );
  }

  return (
    <div className="file-explorer-items">
      {files.map((file) => (
        <div
          key={file.path}
          className="file-explorer-item"
          onClick={() => handleFileClick(file)}
        >
          <span className="file-icon">{getFileIcon(file.isDirectory)}</span>
          <span className="file-name">{file.name}</span>
        </div>
      ))}
    </div>
  );
}
