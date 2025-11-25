import { getUCMApiClient } from './ucmApi';

export interface WatchResult {
  expression: string;
  result: string;
  success: boolean;
}

export interface TypecheckError {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
}

export interface UCMFeedback {
  watchResults: WatchResult[];
  errors: TypecheckError[];
  success: boolean;
}

/**
 * Service for integrating with UCM for live feedback
 */
export class UCMIntegrationService {
  private client = getUCMApiClient();

  /**
   * Load a scratch file into UCM and get feedback
   * This simulates what happens when UCM watches a file
   */
  async loadScratchFile(filePath: string): Promise<UCMFeedback> {
    // For now, return a placeholder
    // In a real implementation, we'd need UCM API support for loading scratch files
    // and getting typeck errors + watch results

    return {
      watchResults: [],
      errors: [],
      success: true,
    };
  }

  /**
   * Add definitions from current file to codebase
   */
  async addToCodebase(projectName: string, branchName: string): Promise<boolean> {
    // This would use the UCM API to run the 'add' command
    // Currently the API doesn't expose this, so this is a placeholder

    console.log(`Would add to codebase: ${projectName}/${branchName}`);
    return true;
  }

  /**
   * Update definitions in codebase
   */
  async updateCodebase(projectName: string, branchName: string): Promise<boolean> {
    // This would use the UCM API to run the 'update' command
    // Currently the API doesn't expose this, so this is a placeholder

    console.log(`Would update codebase: ${projectName}/${branchName}`);
    return true;
  }

  /**
   * Parse watch expressions from file content
   * Watch expressions start with > at the beginning of a line
   */
  parseWatchExpressions(content: string): string[] {
    const lines = content.split('\n');
    const watchExpressions: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('>')) {
        // Extract the expression after the >
        const expression = trimmed.substring(1).trim();
        if (expression) {
          watchExpressions.push(expression);
        }
      }
    }

    return watchExpressions;
  }

  /**
   * Check if current UCM connection is working
   */
  async checkConnection(): Promise<boolean> {
    try {
      return await this.client.checkConnection();
    } catch {
      return false;
    }
  }
}

// Singleton instance
let ucmIntegrationService: UCMIntegrationService | null = null;

export function getUCMIntegrationService(): UCMIntegrationService {
  if (!ucmIntegrationService) {
    ucmIntegrationService = new UCMIntegrationService();
  }
  return ucmIntegrationService;
}
