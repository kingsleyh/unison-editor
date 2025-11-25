import { useEffect, useState } from 'react';
import { useUnisonStore } from '../store/unisonStore';
import { getUCMApiClient } from '../services/ucmApi';
import { ucmContext } from '../services/ucmContext';

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

  const client = getUCMApiClient();

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
      }
    } catch (err) {
      setError(`Failed to load branches: ${err}`);
      console.error('Error loading branches:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const project = projects.find((p) => p.name === e.target.value);
    setCurrentProject(project || null);
    setCurrentBranch(null); // Reset branch when project changes

    // Update ucmContext with manual override
    ucmContext.setManualContext(project?.name || null, null);
  }

  function handleBranchChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const branch = branches.find((b) => b.name === e.target.value);
    setCurrentBranch(branch || null);

    // Update ucmContext with manual override
    ucmContext.setManualContext(currentProject?.name || null, branch?.name || null);
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
