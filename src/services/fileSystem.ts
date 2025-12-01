import { invoke } from '@tauri-apps/api/core';
import { logger } from './loggingService';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

/**
 * File system service for interacting with local files via Tauri
 * All operations support an optional workspace parameter for path validation
 */
export class FileSystemService {
  /**
   * Read file contents
   * @param path - Absolute path to the file
   * @param workspace - Optional workspace root for path validation
   */
  async readFile(path: string, workspace?: string): Promise<string> {
    try {
      const content = await invoke<string>('read_file', { path, workspace });
      return content;
    } catch (error) {
      logger.error('file', 'Failed to read file', error, { path });
      throw new Error(`Failed to read file: ${error}`);
    }
  }

  /**
   * Write content to file
   * @param path - Absolute path to the file
   * @param content - Content to write
   * @param workspace - Optional workspace root for path validation
   */
  async writeFile(path: string, content: string, workspace?: string): Promise<void> {
    try {
      await invoke('write_file', { path, content, workspace });
    } catch (error) {
      logger.error('file', 'Failed to write file', error, { path });
      throw new Error(`Failed to write file: ${error}`);
    }
  }

  /**
   * List directory contents
   * @param path - Absolute path to the directory
   * @param recursive - Whether to list recursively
   * @param workspace - Optional workspace root for path validation
   */
  async listDirectory(path: string, recursive: boolean = false, workspace?: string): Promise<FileNode[]> {
    try {
      const result = await invoke<FileNode[]>('list_directory', { path, recursive, workspace });
      return result;
    } catch (error) {
      logger.error('file', 'Failed to list directory', error, { path });
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  /**
   * Create a new file or directory
   * @param path - Absolute path to create
   * @param isDirectory - Whether to create a directory
   * @param workspace - Optional workspace root for path validation
   */
  async createFile(path: string, isDirectory: boolean, workspace?: string): Promise<void> {
    const itemType = isDirectory ? 'directory' : 'file';
    const op = logger.startOperation('file', `Create ${itemType}`, { path });
    try {
      await invoke('create_file', { path, isDirectory, workspace });
      op.complete();
    } catch (error) {
      op.fail(error);
      throw new Error(`Failed to create ${itemType}: ${error}`);
    }
  }

  /**
   * Delete a file or directory
   * @param path - Absolute path to delete
   * @param workspace - Optional workspace root for path validation
   */
  async deleteFile(path: string, workspace?: string): Promise<void> {
    const op = logger.startOperation('file', 'Delete file', { path });
    try {
      await invoke('delete_file', { path, workspace });
      op.complete();
    } catch (error) {
      op.fail(error);
      throw new Error(`Failed to delete: ${error}`);
    }
  }

  /**
   * Rename or move a file or directory
   * @param oldPath - Current path
   * @param newPath - New path
   * @param workspace - Optional workspace root for path validation
   */
  async renameFile(oldPath: string, newPath: string, workspace?: string): Promise<void> {
    const op = logger.startOperation('file', 'Rename file', { oldPath, newPath });
    try {
      await invoke('rename_file', { oldPath, newPath, workspace });
      op.complete();
    } catch (error) {
      op.fail(error);
      throw new Error(`Failed to rename: ${error}`);
    }
  }

  /**
   * Check if a file or directory exists
   * @param path - Absolute path to check
   * @param workspace - Optional workspace root for path validation
   */
  async fileExists(path: string, workspace?: string): Promise<boolean> {
    try {
      return await invoke<boolean>('file_exists', { path, workspace });
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
