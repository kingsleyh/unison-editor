import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import { ucmContext } from '../services/ucmContext';
import { WorkspaceSetupDialog } from './WorkspaceSetupDialog';
import {
  getWorkspaceConfigService,
  type WorkspaceConfig,
} from '../services/workspaceConfigService';

interface UCMContext {
  project: string;
  branch: string;
}

export function WorkspaceProjectLinker() {
  const workspaceDirectory = useUnisonStore((state) => state.workspaceDirectory);
  const linkedProject = useUnisonStore((state) => state.linkedProject);
  const setWorkspaceDirectory = useUnisonStore((state) => state.setWorkspaceDirectory);
  const addRecentWorkspace = useUnisonStore((state) => state.addRecentWorkspace);
  const clearWorkspaceState = useUnisonStore((state) => state.clearWorkspaceState);
  const setLinkedProject = useUnisonStore((state) => state.setLinkedProject);

  const {
    projects,
    branches,
    currentProject,
    currentBranch,
    setProjects,
    setBranches,
    setCurrentProject,
    setCurrentBranch,
    isConnected,
  } = useUnisonStore();

  const [loading, setLoading] = useState(false);
  const [isSyncingFromTerminal, setIsSyncingFromTerminal] = useState(false);

  // State for workspace setup dialog
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);

  const client = getUCMApiClient();

  // Listen for UCM context changes from the terminal
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<UCMContext>('ucm-context-changed', (event) => {
      const { project, branch } = event.payload;
      setIsSyncingFromTerminal(true);

      const matchingProject = projects.find((p) => p.name === project);
      if (matchingProject && matchingProject.name !== currentProject?.name) {
        setCurrentProject(matchingProject);
      }

      const matchingBranch = branches.find((b) => b.name === branch);
      if (matchingBranch && matchingBranch.name !== currentBranch?.name) {
        setCurrentBranch(matchingBranch);
        ucmContext.setManualContext(project, branch);
      }

      setTimeout(() => setIsSyncingFromTerminal(false), 100);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [projects, branches, currentProject, currentBranch, setCurrentProject, setCurrentBranch]);

  // Load projects on connect
  useEffect(() => {
    if (isConnected) {
      loadProjects();
    }
  }, [isConnected]);

  // Load branches when project changes
  useEffect(() => {
    if (currentProject) {
      loadBranches(currentProject.name);
    }
  }, [currentProject]);

  // Auto-select linked project when projects load
  // This triggers loadBranches which will switch UCM context
  useEffect(() => {
    if (isConnected && linkedProject && projects.length > 0 && !currentProject) {
      const match = projects.find((p) => p.name === linkedProject);
      if (match) {
        console.log('[WorkspaceProjectLinker] Auto-selecting linked project:', match.name);
        setCurrentProject(match);
        ucmContext.setManualContext(match.name, null);
      }
    }
  }, [isConnected, linkedProject, projects, currentProject, setCurrentProject]);

  async function loadProjects() {
    setLoading(true);
    try {
      const projectList = await client.getProjects();
      setProjects(projectList);

      // Auto-select linked project or first project
      if (!currentProject && projectList.length > 0) {
        const projectToSelect = linkedProject
          ? projectList.find((p) => p.name === linkedProject) || projectList[0]
          : projectList[0];
        setCurrentProject(projectToSelect);
        ucmContext.setManualContext(projectToSelect.name, null);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadBranches(projectName: string) {
    setLoading(true);
    try {
      const branchList = await client.getBranches(projectName);
      setBranches(branchList);

      if (!currentBranch && branchList.length > 0) {
        setCurrentBranch(branchList[0]);
        ucmContext.setManualContext(projectName, branchList[0].name);

        if (!isSyncingFromTerminal) {
          try {
            await invoke('ucm_pty_switch_context', {
              project: projectName,
              branch: branchList[0].name,
            });
          } catch (err) {
            console.error('Failed to sync UCM PTY context:', err);
          }
        }
      }
    } catch (err) {
      console.error('Error loading branches:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const project = projects.find((p) => p.name === e.target.value);
    setCurrentProject(project || null);
    setCurrentBranch(null);
    ucmContext.setManualContext(project?.name || null, null);

    // Update linked project in workspace config
    if (project && workspaceDirectory) {
      await updateLinkedProject(project.name);
    }
  }

  async function handleBranchChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const branch = branches.find((b) => b.name === e.target.value);
    setCurrentBranch(branch || null);
    ucmContext.setManualContext(currentProject?.name || null, branch?.name || null);

    if (isSyncingFromTerminal) return;

    if (currentProject && branch) {
      try {
        await invoke('ucm_pty_switch_context', {
          project: currentProject.name,
          branch: branch.name,
        });
      } catch (err) {
        console.error('Failed to sync UCM PTY context:', err);
        try {
          await client.switchContext(currentProject.name, branch.name);
        } catch (apiErr) {
          console.error('Failed to switch UCM context via API:', apiErr);
        }
      }
    }
  }

  async function updateLinkedProject(projectName: string) {
    if (!workspaceDirectory) return;

    try {
      const configService = getWorkspaceConfigService();
      const config = await configService.loadConfig(workspaceDirectory);
      if (config) {
        const updatedConfig: WorkspaceConfig = {
          ...config,
          linkedProject: projectName,
          updatedAt: new Date().toISOString(),
        };
        await configService.saveConfig(workspaceDirectory, updatedConfig);
        setLinkedProject(projectName);
      }
    } catch (err) {
      console.error('Failed to update linked project:', err);
    }
  }

  // Open an existing folder as a workspace (quick open, no setup dialog)
  const handleOpenWorkspace = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Open Workspace Folder',
    });

    if (selected && typeof selected === 'string') {
      clearWorkspaceState();
      setWorkspaceDirectory(selected);
      addRecentWorkspace(selected);
      // App.tsx will handle workspace initialization
    }
  }, [clearWorkspaceState, setWorkspaceDirectory, addRecentWorkspace]);

  // Create a new workspace with setup dialog
  const handleNewWorkspace = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Folder for New Workspace',
    });

    if (selected && typeof selected === 'string') {
      setPendingFolderPath(selected);
      setShowSetupDialog(true);
    }
  }, []);

  // Handle setup dialog completion
  const handleSetupComplete = useCallback(() => {
    if (pendingFolderPath) {
      clearWorkspaceState();
      setWorkspaceDirectory(pendingFolderPath);
      addRecentWorkspace(pendingFolderPath);
    }
    setShowSetupDialog(false);
    setPendingFolderPath(null);
  }, [pendingFolderPath, clearWorkspaceState, setWorkspaceDirectory, addRecentWorkspace]);

  // Handle setup dialog cancellation
  const handleSetupCancel = useCallback(() => {
    setShowSetupDialog(false);
    setPendingFolderPath(null);
  }, []);

  const getWorkspaceName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <>
      <div className="workspace-project-linker">
        {/* Workspace Section */}
        <div className="linker-section">
          <div className="linker-header">WORKSPACE</div>
          <div className="workspace-info">
            <svg
              className="folder-icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0014.5 4H8.414l-1-1A2 2 0 006 2.5H1.5z" />
            </svg>
            <span className="workspace-name" title={workspaceDirectory || undefined}>
              {workspaceDirectory ? getWorkspaceName(workspaceDirectory) : 'No workspace'}
            </span>
          </div>
          <div className="workspace-actions">
            <button
              className="workspace-action-btn"
              onClick={handleOpenWorkspace}
              title="Open an existing folder as workspace"
            >
              Open Folder
            </button>
            <button
              className="workspace-action-btn"
              onClick={handleNewWorkspace}
              title="Create a new workspace with optional UCM project"
            >
              New Workspace
            </button>
          </div>
        </div>

        {/* UCM Project Section */}
        <div className="linker-section">
          <div className="linker-header">
            UCM PROJECT
            {linkedProject && <span className="linked-badge">LINKED</span>}
          </div>

          {!isConnected ? (
            <div className="ucm-status disconnected">
              <span className="status-dot offline"></span>
              <span>Connecting to UCM...</span>
            </div>
          ) : (
            <div className="project-branch-controls">
              <div className="control-row">
                <label>Project</label>
                <select
                  value={currentProject?.name || ''}
                  onChange={handleProjectChange}
                  disabled={loading || projects.length === 0}
                >
                  {projects.length === 0 && <option value="">No projects</option>}
                  {projects.map((project) => (
                    <option key={project.name} value={project.name}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="control-row">
                <label>Branch</label>
                <select
                  value={currentBranch?.name || ''}
                  onChange={handleBranchChange}
                  disabled={loading || branches.length === 0 || !currentProject}
                >
                  {branches.length === 0 && <option value="">No branches</option>}
                  {branches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ucm-status connected">
                <span className="status-dot online"></span>
                <span>Connected</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Workspace Setup Dialog */}
      {showSetupDialog && pendingFolderPath && (
        <WorkspaceSetupDialog
          folderPath={pendingFolderPath}
          onComplete={handleSetupComplete}
          onCancel={handleSetupCancel}
        />
      )}
    </>
  );
}
