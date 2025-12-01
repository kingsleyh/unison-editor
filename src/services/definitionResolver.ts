/**
 * DefinitionResolver - Central service for resolving definition identifiers.
 *
 * This service handles all definition lookups, providing:
 * - Unified resolution for both hash and FQN identifiers
 * - Session-persistent caching for performance
 * - Lib dependency detection and parsing
 * - Single source of truth for definition resolution
 *
 * Core principle: Hash is the canonical ID (content-addressed, immutable),
 * FQN is used for display and tree navigation.
 */

import { invoke } from '@tauri-apps/api/core';
import type { DefinitionSummary } from '../types/syntax';
import {
  type ResolvedDefinition,
  isHash,
  normalizeHash,
  parseLibInfo,
} from '../types/navigation';
import { logger } from './loggingService';

interface SearchResult {
  name: string;
  type: 'term' | 'type';
  hash: string;
}

interface CacheEntry {
  resolved: ResolvedDefinition;
  timestamp: number;
}

/**
 * Centralized definition resolver with caching.
 */
export class DefinitionResolver {
  // Primary cache: hash → resolved definition
  private hashCache = new Map<string, CacheEntry>();

  // Reverse lookup: FQN → hash (for deduplication when FQN is known)
  private fqnToHashCache = new Map<string, string>();

  // Cache TTL in milliseconds (5 minutes - definitions are content-addressed so stable)
  private readonly cacheTTL = 5 * 60 * 1000;

  /**
   * Resolve an identifier (hash or FQN) to a complete ResolvedDefinition.
   *
   * @param identifier - Hash (e.g., "#abc123") or FQN (e.g., "base.List.map")
   * @param projectName - Current project name
   * @param branchName - Current branch name
   * @returns ResolvedDefinition or null if not found
   */
  async resolve(
    identifier: string,
    projectName: string,
    branchName: string
  ): Promise<ResolvedDefinition | null> {
    if (!identifier || !projectName || !branchName) {
      return null;
    }

    // Check cache first
    const cached = this.getCached(identifier);
    if (cached) {
      logger.debug('editor', 'Definition cache hit', { identifier });
      return cached;
    }

    logger.debug('editor', 'Resolving definition', { identifier });

    try {
      if (isHash(identifier)) {
        // Hash lookup - call getDefinition directly
        return await this.resolveByHash(identifier, projectName, branchName);
      } else {
        // FQN lookup - try direct lookup first, then search
        return await this.resolveByFQN(identifier, projectName, branchName);
      }
    } catch (error) {
      logger.error('editor', 'Definition resolution failed', error, { identifier });
      return null;
    }
  }

  /**
   * Resolve by hash - get definition and find full FQN via search.
   *
   * When resolving by hash, the UCM API returns a relative name (e.g., "createNote"),
   * but we need the full FQN (e.g., "notes.api.createNote") for tree navigation.
   * So we also search by the definition name to get the full FQN.
   */
  private async resolveByHash(
    hash: string,
    projectName: string,
    branchName: string
  ): Promise<ResolvedDefinition | null> {
    const definition = await invoke<DefinitionSummary | null>('get_definition', {
      projectName,
      branchName,
      name: hash,
    });

    if (!definition) {
      logger.debug('editor', 'Hash not found', { hash });
      return null;
    }

    // The API returns a relative name. We need to search to find the full FQN.
    // Search by the definition's hash to find the canonical FQN in the codebase.
    let fullFqn: string | undefined;

    try {
      // Search for the definition by name to find its full FQN
      const searchResults = await invoke<SearchResult[]>('find_definitions', {
        projectName,
        branchName,
        query: definition.name,
        limit: 20,
      });

      if (searchResults && searchResults.length > 0) {
        // Find the result that matches our hash
        const normalizedHash = normalizeHash(definition.hash);
        const matchByHash = searchResults.find(
          (r) => normalizeHash(r.hash) === normalizedHash
        );

        if (matchByHash) {
          fullFqn = matchByHash.name;
          logger.debug('editor', 'Found full FQN via search', { fullFqn });
        } else {
          // No exact hash match - use best name match as fallback
          const bestMatch = this.findBestMatch(definition.name, searchResults);
          if (bestMatch) {
            fullFqn = bestMatch.name;
            logger.debug('editor', 'Using best match FQN', { fullFqn });
          }
        }
      }
    } catch (err) {
      logger.warn('editor', 'FQN search failed, using API name', { error: String(err) });
    }

    const resolved = this.createResolvedDefinition(definition, fullFqn);
    this.cacheResolution(resolved);
    return resolved;
  }

  /**
   * Resolve by FQN - always search to get the canonical full FQN.
   *
   * IMPORTANT: We always search first because:
   * 1. The input FQN might be partial (e.g., "api.createNote" instead of "notes.api.createNote")
   * 2. The UCM API returns relative names, not full FQNs
   * 3. We need the canonical full FQN for tree navigation
   */
  private async resolveByFQN(
    fqn: string,
    projectName: string,
    branchName: string
  ): Promise<ResolvedDefinition | null> {
    // Always search first to get the canonical full FQN
    logger.debug('editor', 'Searching for FQN', { fqn });

    const searchResults = await invoke<SearchResult[]>('find_definitions', {
      projectName,
      branchName,
      query: fqn,
      limit: 10,
    });

    if (!searchResults || searchResults.length === 0) {
      logger.debug('editor', 'No search results for FQN', { fqn });
      // Fall back to direct lookup as last resort
      const definition = await invoke<DefinitionSummary | null>('get_definition', {
        projectName,
        branchName,
        name: fqn,
      });
      if (definition) {
        logger.debug('editor', 'Direct lookup succeeded, but no FQN available');
        const resolved = this.createResolvedDefinition(definition, fqn);
        this.cacheResolution(resolved);
        return resolved;
      }
      return null;
    }

    // Find best match from search results
    const match = this.findBestMatch(fqn, searchResults);
    if (!match) {
      logger.debug('editor', 'No matching result for FQN', { fqn });
      return null;
    }

    logger.debug('editor', 'Found match', { fqn, matchName: match.name });

    // Load the full definition using the matched name
    let definition = await invoke<DefinitionSummary | null>('get_definition', {
      projectName,
      branchName,
      name: match.name,
    });

    if (!definition) {
      // Try with hash as fallback
      definition = await invoke<DefinitionSummary | null>('get_definition', {
        projectName,
        branchName,
        name: match.hash,
      });
    }

    if (!definition) {
      logger.warn('editor', 'Failed to load definition for match', { matchName: match.name });
      return null;
    }

    // IMPORTANT: Pass match.name as overrideFqn because:
    // - match.name is the FULL FQN from search results (e.g., "notes.api.createNote")
    // - definition.name is often relative (e.g., "api.createNote")
    // We need the full FQN for tree navigation
    const resolved = this.createResolvedDefinition(definition, match.name);
    this.cacheResolution(resolved);
    return resolved;
  }

  /**
   * Find the best matching search result for a query.
   */
  private findBestMatch(query: string, results: SearchResult[]): SearchResult | null {
    if (results.length === 0) return null;

    // Normalize query for comparison
    const queryLower = query.toLowerCase();
    const queryParts = query.split('.');
    const queryLastPart = queryParts[queryParts.length - 1].toLowerCase();

    // Scoring function
    const scoreResult = (result: SearchResult): number => {
      const nameLower = result.name.toLowerCase();
      const nameParts = result.name.split('.');
      const nameLastPart = nameParts[nameParts.length - 1].toLowerCase();

      // Exact match on full name
      if (nameLower === queryLower) return 100;

      // Exact match on last part (most common case for short names)
      if (nameLastPart === queryLastPart) return 80;

      // Full name ends with query (e.g., "base.List.map" ends with "List.map")
      if (nameLower.endsWith(queryLower)) return 70;

      // Last part starts with query last part
      if (nameLastPart.startsWith(queryLastPart)) return 50;

      // Contains query
      if (nameLower.includes(queryLower)) return 30;

      return 0;
    };

    // Score and sort results
    const scored = results.map((r) => ({ result: r, score: scoreResult(r) }));
    scored.sort((a, b) => b.score - a.score);

    // Return best match if it has any score
    return scored[0].score > 0 ? scored[0].result : results[0];
  }

  /**
   * Create a ResolvedDefinition from a DefinitionSummary.
   *
   * @param definition - The definition summary from UCM API
   * @param overrideFqn - Optional FQN override (use when we know the full FQN from search)
   *
   * Note: UCM API returns relative names (e.g., "api.createNote") but we need
   * full FQNs for tree navigation (e.g., "notes.api.createNote"). The search
   * results provide full FQNs, so we pass them as overrideFqn.
   */
  private createResolvedDefinition(
    definition: DefinitionSummary,
    overrideFqn?: string
  ): ResolvedDefinition {
    // Use override FQN if provided (from search results), otherwise fall back to API name
    const fqn = overrideFqn || definition.name;
    const hash = normalizeHash(definition.hash);
    const libInfo = parseLibInfo(fqn);
    const isLibDependency = fqn.startsWith('lib.');

    // Generate short name for display
    let shortName = fqn;
    if (libInfo) {
      // For lib deps, use "libName.pathInLib"
      shortName = `${libInfo.libName}.${libInfo.pathInLib}`;
    }

    return {
      hash,
      fqn,
      shortName,
      type: definition.type as 'term' | 'type',
      isLibDependency,
      libInfo: libInfo || undefined,
    };
  }

  /**
   * Check cache for a resolution (by hash or FQN).
   */
  getCached(identifier: string): ResolvedDefinition | null {
    const now = Date.now();

    if (isHash(identifier)) {
      const normalized = normalizeHash(identifier);
      const entry = this.hashCache.get(normalized);
      if (entry && now - entry.timestamp < this.cacheTTL) {
        return entry.resolved;
      }
    } else {
      // FQN lookup - check reverse cache
      const hash = this.fqnToHashCache.get(identifier);
      if (hash) {
        const entry = this.hashCache.get(hash);
        if (entry && now - entry.timestamp < this.cacheTTL) {
          return entry.resolved;
        }
      }
    }

    return null;
  }

  /**
   * Cache a resolution result.
   */
  private cacheResolution(resolved: ResolvedDefinition): void {
    const entry: CacheEntry = {
      resolved,
      timestamp: Date.now(),
    };

    // Cache by hash (primary)
    this.hashCache.set(resolved.hash, entry);

    // Cache FQN → hash mapping (reverse lookup)
    this.fqnToHashCache.set(resolved.fqn, resolved.hash);

    logger.debug('editor', 'Cached definition', { fqn: resolved.fqn, hash: resolved.hash });
  }

  /**
   * Warm the cache with a DefinitionSummary (e.g., after loading in DefinitionStack).
   */
  cacheDefinition(definition: DefinitionSummary): ResolvedDefinition {
    const resolved = this.createResolvedDefinition(definition);
    this.cacheResolution(resolved);
    return resolved;
  }

  /**
   * Check if we can deduplicate against an identifier.
   * Returns the canonical hash if the identifier is known, null otherwise.
   */
  getCanonicalHash(identifier: string): string | null {
    if (isHash(identifier)) {
      return normalizeHash(identifier);
    }

    // Check if FQN is in cache
    const hash = this.fqnToHashCache.get(identifier);
    return hash || null;
  }

  /**
   * Clear the cache (e.g., after project/branch change).
   */
  clearCache(): void {
    const stats = this.getCacheStats();
    this.hashCache.clear();
    this.fqnToHashCache.clear();
    logger.info('editor', 'Definition cache cleared', stats);
  }

  /**
   * Get cache statistics for debugging.
   */
  getCacheStats(): { hashEntries: number; fqnEntries: number } {
    return {
      hashEntries: this.hashCache.size,
      fqnEntries: this.fqnToHashCache.size,
    };
  }
}

// Singleton instance
let resolverInstance: DefinitionResolver | null = null;

/**
 * Get the singleton DefinitionResolver instance.
 */
export function getDefinitionResolver(): DefinitionResolver {
  if (!resolverInstance) {
    resolverInstance = new DefinitionResolver();
  }
  return resolverInstance;
}

/**
 * Clear and optionally reset the singleton resolver.
 */
export function resetDefinitionResolver(): void {
  if (resolverInstance) {
    resolverInstance.clearCache();
  }
  resolverInstance = null;
}
