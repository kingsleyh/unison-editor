import { invoke } from '@tauri-apps/api/core';
import type { Project, Branch, Definition } from '../store/unisonStore';

export interface NamespaceItem {
  name: string;
  type: 'term' | 'type' | 'namespace';
  hash?: string;
}

export interface DefinitionSummary {
  name: string;
  hash: string;
  type: 'term' | 'type';
  signature?: string;
  source: string;
  documentation?: string;
}

export interface SearchResult {
  name: string;
  type: 'term' | 'type';
  hash: string;
  snippet?: string;
}

/**
 * Client for interacting with UCM's HTTP API via Tauri commands
 */
export class UCMApiClient {
  constructor(_host: string = '127.0.0.1', _port: number = 5858) {
    // Host and port are stored in Rust backend, not needed here
  }

  /**
   * Get all projects
   */
  async getProjects(): Promise<Project[]> {
    return invoke<Project[]>('get_projects');
  }

  /**
   * Get branches for a project
   */
  async getBranches(projectName: string): Promise<Branch[]> {
    console.log('Invoking get_branches with args:', { projectName });
    const result = await invoke<Branch[]>('get_branches', {
      projectName: projectName
    });
    console.log('get_branches result:', result);
    return result;
  }

  /**
   * Get current project, branch, and path
   */
  async getCurrentContext(): Promise<{
    project: Project | null;
    branch: Branch | null;
    path: string;
  }> {
    return invoke('get_current_context');
  }

  /**
   * List namespace contents
   */
  async listNamespace(
    projectName: string,
    branchName: string,
    namespace: string = '.'
  ): Promise<NamespaceItem[]> {
    return invoke<NamespaceItem[]>('list_namespace', {
      projectName,
      branchName,
      namespace,
    });
  }

  /**
   * Get definition details
   */
  async getDefinition(
    projectName: string,
    branchName: string,
    name: string
  ): Promise<DefinitionSummary | null> {
    return invoke<DefinitionSummary | null>('get_definition', {
      projectName,
      branchName,
      name,
    });
  }

  /**
   * Search/find definitions
   */
  async findDefinitions(
    projectName: string,
    branchName: string,
    query: string,
    limit: number = 50
  ): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('find_definitions', {
      projectName,
      branchName,
      query,
      limit,
    });
  }

  /**
   * Get definition dependencies
   */
  async getDependencies(
    projectName: string,
    branchName: string,
    name: string
  ): Promise<Definition[]> {
    return invoke<Definition[]>('get_dependencies', {
      projectName,
      branchName,
      name,
    });
  }

  /**
   * Get definition dependents
   */
  async getDependents(
    projectName: string,
    branchName: string,
    name: string
  ): Promise<Definition[]> {
    return invoke<Definition[]>('get_dependents', {
      projectName,
      branchName,
      name,
    });
  }

  /**
   * Check if UCM is reachable
   */
  async checkConnection(): Promise<boolean> {
    return invoke<boolean>('check_ucm_connection');
  }
}

// Singleton instance
let apiClient: UCMApiClient | null = null;

export function getUCMApiClient(
  host?: string,
  port?: number
): UCMApiClient {
  if (!apiClient || (host && port)) {
    apiClient = new UCMApiClient(host, port);
  }
  return apiClient;
}
