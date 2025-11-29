import { useState, useRef, useEffect, useCallback } from 'react';

export interface PanelConfig {
  id: string;
  title: string;
  content: React.ReactNode;
  defaultExpanded?: boolean;
  /** If true, panel height is determined by content, not resizable */
  fixedHeight?: boolean;
  minHeight?: number;
}

interface CollapsiblePanelStackProps {
  panels: PanelConfig[];
  collapsedHeight?: number;
}

interface PanelState {
  expanded: boolean;
}

export function CollapsiblePanelStack({
  panels,
  collapsedHeight = 28,
}: CollapsiblePanelStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelStates, setPanelStates] = useState<Record<string, PanelState>>(() => {
    const initial: Record<string, PanelState> = {};
    panels.forEach((panel) => {
      initial[panel.id] = {
        expanded: panel.defaultExpanded ?? true,
      };
    });
    return initial;
  });

  // File explorer height as percentage of available resizable space (0-100)
  const [fileExplorerPercent, setFileExplorerPercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startPercent, setStartPercent] = useState(0);

  // Toggle panel expanded state
  const togglePanel = useCallback((panelId: string) => {
    setPanelStates((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        expanded: !prev[panelId]?.expanded,
      },
    }));
  }, []);

  // Handle drag start on divider
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      setStartY(e.clientY);
      setStartPercent(fileExplorerPercent);
    },
    [fileExplorerPercent]
  );

  // Handle drag
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();

      // Calculate the resizable area (excluding workspace panel)
      const workspacePanel = panels.find(p => p.id === 'workspace');
      const workspaceState = workspacePanel ? panelStates[workspacePanel.id] : null;
      const workspaceHeight = workspaceState?.expanded ? 150 : collapsedHeight; // Approximate

      const resizableTop = containerRect.top + workspaceHeight + 4; // +4 for divider
      const resizableHeight = containerRect.height - workspaceHeight - 4;

      // Calculate new percentage based on mouse position
      const mouseRelativeY = e.clientY - resizableTop;
      let newPercent = (mouseRelativeY / resizableHeight) * 100;

      // Clamp between 0 and 100
      newPercent = Math.max(0, Math.min(100, newPercent));

      // Collapse thresholds - if below 15%, collapse file explorer
      // If above 85%, collapse UCM explorer
      const fileExplorerState = panelStates['file-explorer'];
      const ucmExplorerState = panelStates['ucm-explorer'];

      if (newPercent < 15 && fileExplorerState?.expanded) {
        // Collapse file explorer
        setPanelStates(prev => ({
          ...prev,
          'file-explorer': { ...prev['file-explorer'], expanded: false }
        }));
        setFileExplorerPercent(0);
      } else if (newPercent > 85 && ucmExplorerState?.expanded) {
        // Collapse UCM explorer
        setPanelStates(prev => ({
          ...prev,
          'ucm-explorer': { ...prev['ucm-explorer'], expanded: false }
        }));
        setFileExplorerPercent(100);
      } else if (newPercent >= 15 && newPercent <= 85) {
        // Normal resize - ensure both are expanded
        if (!fileExplorerState?.expanded || !ucmExplorerState?.expanded) {
          setPanelStates(prev => ({
            ...prev,
            'file-explorer': { ...prev['file-explorer'], expanded: true },
            'ucm-explorer': { ...prev['ucm-explorer'], expanded: true }
          }));
        }
        setFileExplorerPercent(newPercent);
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, startY, startPercent, panels, panelStates, collapsedHeight]);

  // Toggle resizable panels - clicking header expands or collapses
  const handlePanelHeaderClick = useCallback((panelId: string) => {
    const state = panelStates[panelId];
    const isExpanded = state?.expanded;

    if (panelId === 'file-explorer') {
      if (isExpanded) {
        // Collapse file explorer - UCM explorer takes all space
        setPanelStates(prev => ({
          ...prev,
          'file-explorer': { expanded: false }
        }));
        setFileExplorerPercent(0);
      } else {
        // Expand file explorer
        const ucmExpanded = panelStates['ucm-explorer']?.expanded;
        if (ucmExpanded) {
          // Both will be visible, set to 50/50
          setFileExplorerPercent(50);
        } else {
          // UCM is collapsed, file explorer takes all space
          setFileExplorerPercent(100);
        }
        setPanelStates(prev => ({
          ...prev,
          'file-explorer': { expanded: true }
        }));
      }
    } else if (panelId === 'ucm-explorer') {
      if (isExpanded) {
        // Collapse UCM explorer - file explorer takes all space
        setPanelStates(prev => ({
          ...prev,
          'ucm-explorer': { expanded: false }
        }));
        setFileExplorerPercent(100);
      } else {
        // Expand UCM explorer
        const fileExpanded = panelStates['file-explorer']?.expanded;
        if (fileExpanded) {
          // Both will be visible, set to 50/50
          setFileExplorerPercent(50);
        } else {
          // File explorer is collapsed, UCM takes all space
          setFileExplorerPercent(0);
        }
        setPanelStates(prev => ({
          ...prev,
          'ucm-explorer': { expanded: true }
        }));
      }
    } else {
      // Workspace or other fixed panel - just toggle
      togglePanel(panelId);
    }
  }, [panelStates, togglePanel]);

  const workspacePanel = panels.find(p => p.id === 'workspace');
  const fileExplorerPanel = panels.find(p => p.id === 'file-explorer');
  const ucmExplorerPanel = panels.find(p => p.id === 'ucm-explorer');

  const workspaceExpanded = workspacePanel ? panelStates[workspacePanel.id]?.expanded : false;
  const fileExplorerExpanded = fileExplorerPanel ? panelStates[fileExplorerPanel.id]?.expanded : false;
  const ucmExplorerExpanded = ucmExplorerPanel ? panelStates[ucmExplorerPanel.id]?.expanded : false;

  return (
    <div ref={containerRef} className="collapsible-panel-stack">
      {/* Workspace Panel - Fixed height, just collapses */}
      {workspacePanel && (
        <div className={`collapsible-panel fixed-height ${workspaceExpanded ? 'expanded' : 'collapsed'}`}>
          <div
            className="collapsible-panel-header"
            onClick={() => togglePanel(workspacePanel.id)}
          >
            <span className="collapsible-panel-chevron">{workspaceExpanded ? '▼' : '▶'}</span>
            <span className="collapsible-panel-title">{workspacePanel.title}</span>
          </div>
          {workspaceExpanded && (
            <div className="collapsible-panel-content">
              {workspacePanel.content}
            </div>
          )}
        </div>
      )}

      {/* Resizable area containing File Explorer and UCM Explorer */}
      <div className="resizable-panel-area">
        {/* File Explorer Panel */}
        {fileExplorerPanel && (
          <div
            className={`collapsible-panel resizable ${fileExplorerExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: fileExplorerExpanded
                ? (ucmExplorerExpanded ? `0 0 ${fileExplorerPercent}%` : '1 1 auto')
                : '0 0 auto',
              minHeight: fileExplorerExpanded ? (fileExplorerPanel.minHeight ?? 80) : collapsedHeight,
            }}
          >
            <div
              className="collapsible-panel-header"
              onClick={() => handlePanelHeaderClick(fileExplorerPanel.id)}
            >
              <span className="collapsible-panel-chevron">{fileExplorerExpanded ? '▼' : '▶'}</span>
              <span className="collapsible-panel-title">{fileExplorerPanel.title}</span>
            </div>
            {fileExplorerExpanded && (
              <div className="collapsible-panel-content">
                {fileExplorerPanel.content}
              </div>
            )}
          </div>
        )}

        {/* Divider between File Explorer and UCM Explorer */}
        {fileExplorerPanel && ucmExplorerPanel && fileExplorerExpanded && ucmExplorerExpanded && (
          <div
            className={`collapsible-panel-divider ${dragging ? 'dragging' : ''}`}
            onMouseDown={handleDragStart}
          />
        )}

        {/* UCM Explorer Panel */}
        {ucmExplorerPanel && (
          <div
            className={`collapsible-panel resizable ${ucmExplorerExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: ucmExplorerExpanded
                ? (fileExplorerExpanded ? `1 1 ${100 - fileExplorerPercent}%` : '1 1 auto')
                : '0 0 auto',
              minHeight: ucmExplorerExpanded ? (ucmExplorerPanel.minHeight ?? 80) : collapsedHeight,
            }}
          >
            <div
              className="collapsible-panel-header"
              onClick={() => handlePanelHeaderClick(ucmExplorerPanel.id)}
            >
              <span className="collapsible-panel-chevron">{ucmExplorerExpanded ? '▼' : '▶'}</span>
              <span className="collapsible-panel-title">{ucmExplorerPanel.title}</span>
            </div>
            {ucmExplorerExpanded && (
              <div className="collapsible-panel-content">
                {ucmExplorerPanel.content}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
