import { invoke } from '@tauri-apps/api/core';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

/**
 * File system service for interacting with local files via Tauri
 */
export class FileSystemService {
  /**
   * Read file contents
   */
  async readFile(path: string): Promise<string> {
    try {
      return await invoke<string>('read_file', { path });
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  }

  /**
   * Write content to file
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      await invoke('write_file', { path, content });
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string, recursive: boolean = false): Promise<FileNode[]> {
    try {
      return await invoke<FileNode[]>('list_directory', { path, recursive });
    } catch (error) {
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  /**
   * Create a new file or directory
   */
  async createFile(path: string, isDirectory: boolean): Promise<void> {
    try {
      await invoke('create_file', { path, isDirectory });
    } catch (error) {
      throw new Error(`Failed to create ${isDirectory ? 'directory' : 'file'}: ${error}`);
    }
  }

  /**
   * Delete a file or directory
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await invoke('delete_file', { path });
    } catch (error) {
      throw new Error(`Failed to delete: ${error}`);
    }
  }

  /**
   * Rename or move a file or directory
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    try {
      await invoke('rename_file', { oldPath, newPath });
    } catch (error) {
      throw new Error(`Failed to rename: ${error}`);
    }
  }

  /**
   * Check if a file or directory exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      return await invoke<boolean>('file_exists', { path });
    } catch (error) {
      throw new Error(`Failed to check file existence: ${error}`);
    }
  }

  /**
   * Get file extension
   */
  getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot + 1);
  }

  /**
   * Check if file is a Unison file
   */
  isUnisonFile(filename: string): boolean {
    return this.getFileExtension(filename) === 'u';
  }

  /**
   * Filter file tree to show only .u files
   * Keeps all directories (since they might contain .u files when expanded)
   * Only filters out non-.u files
   */
  filterUnisonFiles(nodes: FileNode[]): FileNode[] {
    return nodes
      .map((node) => {
        if (node.isDirectory) {
          // Keep all directories - they may contain .u files when expanded
          // If children are already loaded, filter them recursively
          const filteredChildren = node.children
            ? this.filterUnisonFiles(node.children)
            : undefined;

          return { ...node, children: filteredChildren };
        } else if (this.isUnisonFile(node.name)) {
          return node;
        }
        return null;
      })
      .filter((node): node is FileNode => node !== null);
  }
}

// Singleton instance
let fileSystemService: FileSystemService | null = null;

export function getFileSystemService(): FileSystemService {
  if (!fileSystemService) {
    fileSystemService = new FileSystemService();
  }
  return fileSystemService;
}
