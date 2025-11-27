/**
 * Navigation types for definition resolution and navigation.
 *
 * Core principle: Hash is the canonical ID (content-addressed, immutable),
 * FQN is used for display and tree navigation.
 */

/**
 * Information about a lib dependency parsed from its FQN.
 *
 * Unison dependencies can be versioned in several ways:
 * - Semantic version: lib.base_1_0_0.List.map (from @base/1.0.0)
 * - Branch reference: lib.base_main.List.map (from @base/main)
 * - Simple name: lib.base.List.map (unversioned or single version)
 *
 * The lib segment format is: {project}_{version} where version may be:
 * - Semantic: 1_0_0 (representing 1.0.0)
 * - Branch: main, develop, etc.
 */
export interface LibInfo {
  /** Library/project name (e.g., "base", "json", "http") */
  libName: string;
  /** Version string - semantic version (e.g., "1.0.0") or branch name (e.g., "main") */
  version: string;
  /** Whether this is a semantic version vs branch name */
  isSemanticVersion: boolean;
  /** Path within the library (e.g., "List.map") */
  pathInLib: string;
  /** The full lib segment as it appears in the FQN (e.g., "base_1_0_0") */
  rawLibSegment: string;
}

/**
 * A fully resolved definition with all information needed for display and deduplication.
 */
export interface ResolvedDefinition {
  /** Content hash - canonical ID for deduplication (e.g., "#abc123...") */
  hash: string;
  /** Fully qualified name - full path for tree navigation (e.g., "lib.base_v1.List.map") */
  fqn: string;
  /** Short display name without lib prefix (e.g., "base.List.map" or "List.map") */
  shortName: string;
  /** Definition type - from API, not guessed */
  type: 'term' | 'type';
  /** Whether this definition is from a lib dependency */
  isLibDependency: boolean;
  /** Parsed lib info if this is a dependency */
  libInfo?: LibInfo;
}

/**
 * A navigation request - what the user clicked on.
 * May have hash, FQN, or both depending on the source.
 */
export interface NavigationRequest {
  /** Identifier to look up - could be hash or FQN */
  identifier: string;
  /** Type hint (from annotation or guess) */
  type: 'term' | 'type';
  /** Source of the navigation for debugging */
  source?: 'editor-click' | 'card-reference' | 'tree-click' | 'search';
}

/**
 * Check if an identifier is a hash (starts with #)
 */
export function isHash(identifier: string): boolean {
  return identifier.startsWith('#');
}

/**
 * Normalize a hash to include the # prefix
 */
export function normalizeHash(hash: string): string {
  return hash.startsWith('#') ? hash : `#${hash}`;
}

/**
 * Parse lib info from an FQN.
 * Returns null if the FQN is not a lib dependency.
 *
 * Unison lib segment formats (lib.{segment}.path.to.item):
 * - unison_cloud_23_0_0 → libName: "unison_cloud", version: "23.0.0"
 * - base_1_0_0 → libName: "base", version: "1.0.0"
 * - json_main → libName: "json", version: "main" (branch)
 * - base → libName: "base", version: "" (unversioned)
 *
 * The challenge: lib names can have underscores (e.g., "unison_cloud"),
 * and versions are appended with underscores. We detect versions by looking
 * for numeric patterns at the end: _N_N_N (semantic) or _word (branch).
 */
export function parseLibInfo(fqn: string): LibInfo | null {
  if (!fqn.startsWith('lib.')) return null;

  const parts = fqn.split('.');
  if (parts.length < 3) return null;

  const libSegment = parts[1]; // e.g., "unison_cloud_23_0_0", "base_main", or "base"
  const pathInLib = parts.slice(2).join('.');

  // Check for semantic version at the end: _N_N_N or _N_N
  // This matches: _23_0_0, _1_0_0, _2_5, etc.
  const semanticMatch = libSegment.match(/^(.+)_(\d+(?:_\d+){1,2})$/);

  if (semanticMatch) {
    // Found semantic version pattern
    const libName = semanticMatch[1];
    const versionStr = semanticMatch[2].replace(/_/g, '.');
    return {
      libName,
      version: versionStr,
      isSemanticVersion: true,
      pathInLib,
      rawLibSegment: libSegment,
    };
  }

  // Check for branch name at the end: _word (where word is not a number)
  // Common branch names: main, master, develop, release, etc.
  const branchMatch = libSegment.match(/^(.+)_([a-zA-Z][a-zA-Z0-9_-]*)$/);

  if (branchMatch) {
    const libName = branchMatch[1];
    const version = branchMatch[2];

    // Only treat as branch if it looks like a branch name (not another underscore segment)
    // Common branch patterns: main, master, develop, release-*, feature-*, etc.
    const looksLikeBranch =
      /^(main|master|develop|release|feature|hotfix|bugfix)/.test(version) ||
      version.length <= 10; // Short single words are likely branches

    if (looksLikeBranch) {
      return {
        libName,
        version,
        isSemanticVersion: false,
        pathInLib,
        rawLibSegment: libSegment,
      };
    }
  }

  // No recognizable version pattern - treat whole segment as lib name
  return {
    libName: libSegment,
    version: '',
    isSemanticVersion: false,
    pathInLib,
    rawLibSegment: libSegment,
  };
}

/**
 * Get a user-friendly display name for a resolved definition.
 * For lib deps, shows "libName.pathInLib" instead of full FQN.
 */
export function getDisplayName(resolved: ResolvedDefinition): string {
  if (resolved.libInfo) {
    return `${resolved.libInfo.libName}.${resolved.libInfo.pathInLib}`;
  }
  return resolved.fqn;
}

/**
 * Get the version badge text for a lib dependency.
 * Returns null for non-lib items or items without version.
 */
export function getVersionBadge(resolved: ResolvedDefinition): string | null {
  if (resolved.libInfo && resolved.libInfo.version) {
    return resolved.libInfo.version;
  }
  return null;
}
