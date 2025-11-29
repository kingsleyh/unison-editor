import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import { ucmContext } from '../services/ucmContext';

interface UCMContext {
  project: string;
  branch: string;
}

export function ProjectBranchSelector() {
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
  const [error, setError] = useState<string | null>(null);
  // Track if we're currently syncing to avoid feedback loops
  const [isSyncingFromTerminal, setIsSyncingFromTerminal] = useState(false);

  const client = getUCMApiClient();

  // Listen for UCM context changes from the terminal (UCM → Editor sync)
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<UCMContext>('ucm-context-changed', (event) => {
      const { project, branch } = event.payload;
      console.log('[ProjectBranchSelector] UCM context changed from terminal:', project, branch);

      // Update editor state to match terminal
      setIsSyncingFromTerminal(true);

      // Find matching project
      const matchingProject = projects.find((p) => p.name === project);
      if (matchingProject && matchingProject.name !== currentProject?.name) {
        setCurrentProject(matchingProject);
        // This will trigger branch loading
      }

      // Find matching branch (after branches are loaded)
      const matchingBranch = branches.find((b) => b.name === branch);
      if (matchingBranch && matchingBranch.name !== currentBranch?.name) {
        setCurrentBranch(matchingBranch);
        ucmContext.setManualContext(project, branch);
      }

      // Reset sync flag after a short delay
      setTimeout(() => setIsSyncingFromTerminal(false), 100);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [projects, branches, currentProject, currentBranch, setCurrentProject, setCurrentBranch]);

  // Load projects on mount
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

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const projectList = await client.getProjects();
      setProjects(projectList);

      // Auto-select first project if none selected
      if (!currentProject && projectList.length > 0) {
        setCurrentProject(projectList[0]);
        // Set manual context for UCM providers
        ucmContext.setManualContext(projectList[0].name, null);
      }
    } catch (err) {
      setError(`Failed to load projects: ${err}`);
      console.error('Error loading projects:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadBranches(projectName: string) {
    setLoading(true);
    setError(null);
    try {
      console.log('Loading branches for project:', projectName);
      const branchList = await client.getBranches(projectName);
      console.log('Branches loaded:', branchList);
      setBranches(branchList);

      // Auto-select first branch if none selected
      if (!currentBranch && branchList.length > 0) {
        setCurrentBranch(branchList[0]);
        // Set manual context for UCM providers (with branch)
        ucmContext.setManualContext(projectName, branchList[0].name);

        // Skip syncing if this change originated from the terminal
        if (!isSyncingFromTerminal) {
          // Sync to UCM PTY terminal
          try {
            await invoke('ucm_pty_switch_context', {
              project: projectName,
              branch: branchList[0].name,
            });
            console.log(`[loadBranches] Synced UCM PTY to ${projectName}/${branchList[0].name}`);
          } catch (err) {
            console.error('Failed to sync UCM PTY context:', err);
            // Fallback to API-based switch
            try {
              await client.switchContext(projectName, branchList[0].name);
              console.log(`Switched UCM context via API to ${projectName}/${branchList[0].name}`);
            } catch (apiErr) {
              console.error('Failed to switch UCM context via API:', apiErr);
            }
          }
        }
      }
    } catch (err) {
      setError(`Failed to load branches: ${err}`);
      console.error('Error loading branches:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const project = projects.find((p) => p.name === e.target.value);
    setCurrentProject(project || null);
    setCurrentBranch(null); // Reset branch when project changes

    // Update ucmContext with manual override
    ucmContext.setManualContext(project?.name || null, null);

    // Auto-sync UCM context when project changes
    // Note: The branch will be synced in loadBranches after branches are loaded
    // For now, we switch to the project with a default branch assumption
    // The real sync happens when a branch is selected
  }

  async function handleBranchChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const branch = branches.find((b) => b.name === e.target.value);
    setCurrentBranch(branch || null);

    // Update ucmContext with manual override
    ucmContext.setManualContext(currentProject?.name || null, branch?.name || null);

    // Skip syncing to PTY if this change originated from the terminal
    if (isSyncingFromTerminal) {
      console.log('[ProjectBranchSelector] Skipping PTY sync (change from terminal)');
      return;
    }

    // Sync to UCM PTY terminal (Editor → UCM sync)
    if (currentProject && branch) {
      try {
        // Send switch command to the UCM PTY terminal
        await invoke('ucm_pty_switch_context', {
          project: currentProject.name,
          branch: branch.name,
        });
        console.log(`[ProjectBranchSelector] Synced UCM PTY to ${currentProject.name}/${branch.name}`);
      } catch (err) {
        console.error('Failed to sync UCM PTY context:', err);
        // Fallback to API-based switch (for other UCM instances)
        try {
          await client.switchContext(currentProject.name, branch.name);
          console.log(`Switched UCM context via API to ${currentProject.name}/${branch.name}`);
        } catch (apiErr) {
          console.error('Failed to switch UCM context via API:', apiErr);
        }
      }
    }
  }

  if (!isConnected) {
    return (
      <div className="project-branch-selector disconnected">
        <span className="status-indicator offline">●</span>
        <span>Not connected to UCM</span>
      </div>
    );
  }

  return (
    <div className="project-branch-selector">
      <span className="status-indicator online">●</span>

      {error && <div className="error-message">{error}</div>}

      <div className="selector-group">
        <label htmlFor="project-select">Project:</label>
        <select
          id="project-select"
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

      <div className="selector-group">
        <label htmlFor="branch-select">Branch:</label>
        <select
          id="branch-select"
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
    </div>
  );
}
