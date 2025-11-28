import { invoke } from '@tauri-apps/api/core';
import type { Project, Branch, Definition } from '../store/unisonStore';
import type { DefinitionSummary } from '../types/syntax';

export interface NamespaceItem {
  name: string;
  type: 'term' | 'type' | 'namespace';
  hash?: string;
}

export interface SearchResult {
  name: string;
  type: 'term' | 'type';
  hash: string;
  snippet?: string;
}

export interface WatchResult {
  expression: string;
  result: string;
  lineNumber: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface TypecheckResult {
  success: boolean;
  errors: string[];
  watchResults: WatchResult[];
  testResults: TestResult[];
  output: string;
}

export interface RunTestsResult {
  success: boolean;
  output: string;
  errors: string[];
  testResults: TestResult[];
}

export interface RunFunctionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  output: string;
  errors: string[];
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
   * Get definition details (with suffixified/shortened names for display)
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
   * Get definition with fully qualified names (for add-to-scratch)
   * Returns source code where all references use FQN instead of shortened names
   */
  async getDefinitionFQN(
    projectName: string,
    branchName: string,
    name: string
  ): Promise<DefinitionSummary | null> {
    return invoke<DefinitionSummary | null>('get_definition_fqn', {
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

  /**
   * Typecheck code and evaluate watch expressions
   *
   * Watch expressions are lines starting with ">" which are evaluated
   * and their results returned.
   */
  async typecheckCode(
    projectName: string,
    branchName: string,
    code: string
  ): Promise<TypecheckResult> {
    return invoke<TypecheckResult>('ucm_typecheck', {
      projectName,
      branchName,
      code,
    });
  }

  /**
   * Run tests from the codebase
   *
   * Runs tests that are already saved in the codebase.
   * Can optionally specify a subnamespace to run tests from.
   */
  async runTests(
    projectName: string,
    branchName: string,
    subnamespace?: string
  ): Promise<RunTestsResult> {
    return invoke<RunTestsResult>('ucm_run_tests', {
      projectName,
      branchName,
      subnamespace,
    });
  }

  /**
   * Run an IO function
   *
   * Runs a function that has IO and Exception abilities.
   * The function must already be saved in the codebase.
   */
  async runFunction(
    projectName: string,
    branchName: string,
    functionName: string,
    args: string[] = []
  ): Promise<RunFunctionResult> {
    return invoke<RunFunctionResult>('ucm_run', {
      functionName,
      projectName,
      branchName,
      args,
    });
  }

  /**
   * View definitions with fully qualified names
   *
   * Gets source code of definitions with fully qualified names,
   * suitable for adding to scratch files (like UCM's `edit` command).
   */
  async viewDefinitions(
    projectName: string,
    branchName: string,
    names: string[]
  ): Promise<string> {
    return invoke<string>('view_definitions', {
      projectName,
      branchName,
      names,
    });
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
