import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUnisonStore } from '../store/unisonStore';
import {
  getWorkspaceConfigService,
  type WorkspaceConfig,
} from '../services/workspaceConfigService';
import { getUCMLifecycleService } from '../services/ucmLifecycle';

interface WorkspaceSetupDialogProps {
  folderPath: string;
  onComplete: () => void;
  onCancel: () => void;
}

type ProjectLinkMode = 'existing' | 'create' | 'none';

interface Project {
  name: string;
  active_branch?: string;
}

export function WorkspaceSetupDialog({
  folderPath,
  onComplete,
  onCancel,
}: WorkspaceSetupDialogProps) {
  const setLinkedProject = useUnisonStore((state) => state.setLinkedProject);
  const setWorkspaceConfigLoaded = useUnisonStore((state) => state.setWorkspaceConfigLoaded);

  const [linkMode, setLinkMode] = useState<ProjectLinkMode>('existing');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [autoSwitch, setAutoSwitch] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(true);

  // Load available projects
  useEffect(() => {
    async function loadProjects() {
      setProjectsLoading(true);
      try {
        const projectList = await invoke<Project[]>('get_projects');
        setProjects(projectList);
        if (projectList.length > 0 && !selectedProject) {
          setSelectedProject(projectList[0].name);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        // Not a critical error - user can still create new project
      } finally {
        setProjectsLoading(false);
      }
    }
    loadProjects();
  }, []);

  // Derive default new project name from folder
  useEffect(() => {
    const parts = folderPath.split('/');
    const folderName = parts[parts.length - 1] || 'my-project';
    // Clean up the folder name for UCM project naming
    const cleanName = folderName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    setNewProjectName(cleanName);
  }, [folderPath]);

  const handleCreateWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const configService = getWorkspaceConfigService();

      // Initialize the workspace directory
      await configService.initWorkspace(folderPath);

      let linkedProjectName: string | null = null;

      if (linkMode === 'create' && newProjectName.trim()) {
        // Create a new UCM project by sending command to UCM PTY
        linkedProjectName = newProjectName.trim();

        const ucmLifecycle = getUCMLifecycleService();

        // UCM should already be running (spawned by WelcomeScreen)
        if (!ucmLifecycle.isRunning()) {
          console.warn('[WorkspaceSetupDialog] UCM not running, cannot create project');
          setError('UCM is not running. Please close and reopen the workspace.');
          setLoading(false);
          return;
        }

        // Send project.create command to UCM PTY
        console.log('[WorkspaceSetupDialog] Creating UCM project:', linkedProjectName);
        await ucmLifecycle.write(`project.create ${linkedProjectName}\n`);

        // Give UCM a moment to process the command
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Switch to the new project
        await ucmLifecycle.write(`switch /${linkedProjectName}/main\n`);

        // Wait for the switch to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (linkMode === 'existing' && selectedProject) {
        linkedProjectName = selectedProject;
      }

      // Update workspace config with linked project
      if (linkedProjectName) {
        const config = await configService.loadConfig(folderPath);
        if (config) {
          const updatedConfig: WorkspaceConfig = {
            ...config,
            linkedProject: linkedProjectName,
            updatedAt: new Date().toISOString(),
          };
          await configService.saveConfig(folderPath, updatedConfig);
          setLinkedProject(linkedProjectName);
        }
      }

      setWorkspaceConfigLoaded(true);
      onComplete();
    } catch (err) {
      console.error('Failed to create workspace:', err);
      setError(`Failed to set up workspace: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [
    folderPath,
    linkMode,
    newProjectName,
    selectedProject,
    setLinkedProject,
    setWorkspaceConfigLoaded,
    onComplete,
  ]);

  const getWorkspaceName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  const isValid = (): boolean => {
    if (linkMode === 'existing') {
      return !!selectedProject;
    }
    if (linkMode === 'create') {
      return !!newProjectName.trim();
    }
    return true; // 'none' is always valid
  };

  return (
    <div className="workspace-setup-overlay">
      <div className="workspace-setup-dialog">
        <h2>Set Up Workspace</h2>

        <div className="setup-field">
          <label>Workspace Folder</label>
          <div className="folder-display">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H8.414l-1-1A2 2 0 006 2.5H1.5z" />
            </svg>
            <span className="folder-name">{getWorkspaceName(folderPath)}</span>
            <span className="folder-path">{folderPath}</span>
          </div>
        </div>

        <div className="setup-field">
          <label>Link to UCM Project</label>

          <div className="link-options">
            <label className="radio-option">
              <input
                type="radio"
                name="linkMode"
                checked={linkMode === 'existing'}
                onChange={() => setLinkMode('existing')}
              />
              <span>Use existing project</span>
              {linkMode === 'existing' && (
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  disabled={projectsLoading || projects.length === 0}
                  className="project-select"
                >
                  {projectsLoading ? (
                    <option>Loading projects...</option>
                  ) : projects.length === 0 ? (
                    <option>No projects found</option>
                  ) : (
                    projects.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
              )}
            </label>

            <label className="radio-option">
              <input
                type="radio"
                name="linkMode"
                checked={linkMode === 'create'}
                onChange={() => setLinkMode('create')}
              />
              <span>Create new project</span>
              {linkMode === 'create' && (
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="project-name"
                  className="project-name-input"
                />
              )}
            </label>

            <label className="radio-option">
              <input
                type="radio"
                name="linkMode"
                checked={linkMode === 'none'}
                onChange={() => setLinkMode('none')}
              />
              <span>Don't link to a project (configure later)</span>
            </label>
          </div>
        </div>

        {linkMode !== 'none' && (
          <div className="setup-field checkbox-field">
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={autoSwitch}
                onChange={(e) => setAutoSwitch(e.target.checked)}
              />
              <span>Automatically switch to this project when opening workspace</span>
            </label>
          </div>
        )}

        {error && <div className="setup-error">{error}</div>}

        <div className="setup-actions">
          <button className="setup-btn secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="setup-btn primary"
            onClick={handleCreateWorkspace}
            disabled={loading || !isValid()}
          >
            {loading ? 'Setting up...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
