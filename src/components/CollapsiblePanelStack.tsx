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
  /** Controlled workspace expanded state (if provided, component is controlled) */
  workspaceExpanded?: boolean;
  /** Controlled file explorer expanded state (if provided, component is controlled) */
  fileExplorerExpanded?: boolean;
  /** Controlled UCM explorer expanded state (if provided, component is controlled) */
  ucmExplorerExpanded?: boolean;
  /** Controlled split percent - file explorer % (if provided, component is controlled) */
  splitPercent?: number;
  /** Callback when workspace expanded changes (for persistence) */
  onWorkspaceExpandedChange?: (expanded: boolean) => void;
  /** Callback when file explorer expanded changes (for persistence) */
  onFileExplorerExpandedChange?: (expanded: boolean) => void;
  /** Callback when UCM explorer expanded changes (for persistence) */
  onUcmExplorerExpandedChange?: (expanded: boolean) => void;
  /** Callback when split percent changes (for persistence) */
  onSplitPercentChange?: (percent: number) => void;
}

/**
 * Key design: Uses absolute positioning from mouse position, NOT incremental deltas.
 * This ensures smooth dragging regardless of re-render timing.
 */
export function CollapsiblePanelStack({
  panels,
  collapsedHeight = 28,
  workspaceExpanded: controlledWorkspaceExpanded,
  fileExplorerExpanded: controlledFileExpanded,
  ucmExplorerExpanded: controlledUcmExpanded,
  splitPercent: controlledSplitPercent,
  onWorkspaceExpandedChange,
  onFileExplorerExpandedChange,
  onUcmExplorerExpandedChange,
  onSplitPercentChange,
}: CollapsiblePanelStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal state for uncontrolled mode - initialized once
  const [internalWorkspaceExpanded, setInternalWorkspaceExpanded] = useState(true);
  const [internalFileExpanded, setInternalFileExpanded] = useState(true);
  const [internalUcmExpanded, setInternalUcmExpanded] = useState(true);
  const [internalSplitPercent, setInternalSplitPercent] = useState(50);

  // Controlled vs uncontrolled for each value
  const isWorkspaceExpandedControlled = controlledWorkspaceExpanded !== undefined;
  const isFileExpandedControlled = controlledFileExpanded !== undefined;
  const isUcmExpandedControlled = controlledUcmExpanded !== undefined;
  const isSplitPercentControlled = controlledSplitPercent !== undefined;

  // Current values (controlled or internal)
  const workspaceExpanded = isWorkspaceExpandedControlled ? controlledWorkspaceExpanded : internalWorkspaceExpanded;
  const fileExpanded = isFileExpandedControlled ? controlledFileExpanded : internalFileExpanded;
  const ucmExpanded = isUcmExpandedControlled ? controlledUcmExpanded : internalUcmExpanded;
  const splitPercent = isSplitPercentControlled ? controlledSplitPercent : internalSplitPercent;

  const [dragging, setDragging] = useState(false);

  // Store starting positions when drag begins
  const dragStartRef = useRef<{
    mouseY: number;
    startSplitPercent: number;
    resizableTop: number;
    resizableHeight: number;
  } | null>(null);

  // Memoized update helpers - call callback for controlled, set state for uncontrolled
  const updateWorkspaceExpanded = useCallback((expanded: boolean) => {
    if (isWorkspaceExpandedControlled) {
      onWorkspaceExpandedChange?.(expanded);
    } else {
      setInternalWorkspaceExpanded(expanded);
      onWorkspaceExpandedChange?.(expanded); // Still notify for persistence
    }
  }, [isWorkspaceExpandedControlled, onWorkspaceExpandedChange]);

  const updateFileExpanded = useCallback((expanded: boolean) => {
    if (isFileExpandedControlled) {
      onFileExplorerExpandedChange?.(expanded);
    } else {
      setInternalFileExpanded(expanded);
      onFileExplorerExpandedChange?.(expanded); // Still notify for persistence
    }
  }, [isFileExpandedControlled, onFileExplorerExpandedChange]);

  const updateUcmExpanded = useCallback((expanded: boolean) => {
    if (isUcmExpandedControlled) {
      onUcmExplorerExpandedChange?.(expanded);
    } else {
      setInternalUcmExpanded(expanded);
      onUcmExplorerExpandedChange?.(expanded); // Still notify for persistence
    }
  }, [isUcmExpandedControlled, onUcmExplorerExpandedChange]);

  const updateSplitPercent = useCallback((percent: number) => {
    if (isSplitPercentControlled) {
      onSplitPercentChange?.(percent);
    } else {
      setInternalSplitPercent(percent);
      onSplitPercentChange?.(percent); // Still notify for persistence
    }
  }, [isSplitPercentControlled, onSplitPercentChange]);

  // Handle drag start on divider
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();

    // Calculate the resizable area (excluding workspace panel)
    const workspaceHeight = workspaceExpanded ? 150 : collapsedHeight; // Approximate
    const resizableTop = containerRect.top + workspaceHeight + 4; // +4 for divider
    const resizableHeight = containerRect.height - workspaceHeight - 4;

    // Store starting state for absolute positioning
    dragStartRef.current = {
      mouseY: e.clientY,
      startSplitPercent: splitPercent,
      resizableTop,
      resizableHeight,
    };

    setDragging(true);
  }, [splitPercent, workspaceExpanded, collapsedHeight]);

  // Handle drag
  useEffect(() => {
    if (!dragging || !dragStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const { mouseY: startY, startSplitPercent, resizableTop, resizableHeight } = dragStartRef.current;

      // Calculate new percentage based on absolute mouse position relative to drag start
      const deltaY = e.clientY - startY;
      const deltaPercent = (deltaY / resizableHeight) * 100;
      let newPercent = startSplitPercent + deltaPercent;

      // Clamp between 0 and 100
      newPercent = Math.max(0, Math.min(100, newPercent));

      // Collapse thresholds - if below 15%, collapse file explorer
      // If above 85%, collapse UCM explorer
      if (newPercent < 15 && fileExpanded) {
        // Collapse file explorer
        updateFileExpanded(false);
        updateSplitPercent(0);
      } else if (newPercent > 85 && ucmExpanded) {
        // Collapse UCM explorer
        updateUcmExpanded(false);
        updateSplitPercent(100);
      } else if (newPercent >= 15 && newPercent <= 85) {
        // Normal resize - ensure both are expanded
        if (!fileExpanded) updateFileExpanded(true);
        if (!ucmExpanded) updateUcmExpanded(true);
        updateSplitPercent(newPercent);
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
      dragStartRef.current = null;
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
  }, [dragging, fileExpanded, ucmExpanded, updateFileExpanded, updateUcmExpanded, updateSplitPercent]);

  // Toggle resizable panels - clicking header expands or collapses
  const handlePanelHeaderClick = useCallback((panelId: string) => {
    if (panelId === 'file-explorer') {
      if (fileExpanded) {
        // Collapse file explorer - UCM explorer takes all space
        updateFileExpanded(false);
        updateSplitPercent(0);
      } else {
        // Expand file explorer
        if (ucmExpanded) {
          // Both will be visible, set to 50/50
          updateSplitPercent(50);
        } else {
          // UCM is collapsed, file explorer takes all space
          updateSplitPercent(100);
        }
        updateFileExpanded(true);
      }
    } else if (panelId === 'ucm-explorer') {
      if (ucmExpanded) {
        // Collapse UCM explorer - file explorer takes all space
        updateUcmExpanded(false);
        updateSplitPercent(100);
      } else {
        // Expand UCM explorer
        if (fileExpanded) {
          // Both will be visible, set to 50/50
          updateSplitPercent(50);
        } else {
          // File explorer is collapsed, UCM takes all space
          updateSplitPercent(0);
        }
        updateUcmExpanded(true);
      }
    } else if (panelId === 'workspace') {
      // Workspace panel - toggle with persistence
      updateWorkspaceExpanded(!workspaceExpanded);
    }
  }, [fileExpanded, ucmExpanded, workspaceExpanded, updateWorkspaceExpanded, updateFileExpanded, updateUcmExpanded, updateSplitPercent]);

  const workspacePanel = panels.find(p => p.id === 'workspace');
  const fileExplorerPanel = panels.find(p => p.id === 'file-explorer');
  const ucmExplorerPanel = panels.find(p => p.id === 'ucm-explorer');

  return (
    <div ref={containerRef} className="collapsible-panel-stack">
      {/* Workspace Panel - Fixed height, just collapses */}
      {workspacePanel && (
        <div className={`collapsible-panel fixed-height ${workspaceExpanded ? 'expanded' : 'collapsed'}`}>
          <div
            className="collapsible-panel-header"
            onClick={() => handlePanelHeaderClick('workspace')}
          >
            <span className="collapsible-panel-chevron">{workspaceExpanded ? '▼' : '▶'}</span>
            <span className="collapsible-panel-title">{workspacePanel.title}</span>
          </div>
          <div
            className="collapsible-panel-content"
            style={{ display: workspaceExpanded ? 'block' : 'none' }}
          >
            {workspacePanel.content}
          </div>
        </div>
      )}

      {/* Resizable area containing File Explorer and UCM Explorer */}
      <div className="resizable-panel-area">
        {/* File Explorer Panel */}
        {fileExplorerPanel && (
          <div
            className={`collapsible-panel resizable ${fileExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: fileExpanded
                ? (ucmExpanded ? `0 0 ${splitPercent}%` : '1 1 auto')
                : '0 0 auto',
              minHeight: fileExpanded ? (fileExplorerPanel.minHeight ?? 80) : collapsedHeight,
            }}
          >
            <div
              className="collapsible-panel-header"
              onClick={() => handlePanelHeaderClick('file-explorer')}
            >
              <span className="collapsible-panel-chevron">{fileExpanded ? '▼' : '▶'}</span>
              <span className="collapsible-panel-title">{fileExplorerPanel.title}</span>
            </div>
            {fileExpanded && (
              <div className="collapsible-panel-content">
                {fileExplorerPanel.content}
              </div>
            )}
          </div>
        )}

        {/* Divider between File Explorer and UCM Explorer */}
        {fileExplorerPanel && ucmExplorerPanel && fileExpanded && ucmExpanded && (
          <div
            className={`collapsible-panel-divider ${dragging ? 'dragging' : ''}`}
            onMouseDown={handleDragStart}
          />
        )}

        {/* UCM Explorer Panel */}
        {ucmExplorerPanel && (
          <div
            className={`collapsible-panel resizable ${ucmExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: ucmExpanded
                ? (fileExpanded ? `1 1 ${100 - splitPercent}%` : '1 1 auto')
                : '0 0 auto',
              minHeight: ucmExpanded ? (ucmExplorerPanel.minHeight ?? 80) : collapsedHeight,
            }}
          >
            <div
              className="collapsible-panel-header"
              onClick={() => handlePanelHeaderClick('ucm-explorer')}
            >
              <span className="collapsible-panel-chevron">{ucmExpanded ? '▼' : '▶'}</span>
              <span className="collapsible-panel-title">{ucmExplorerPanel.title}</span>
            </div>
            {ucmExpanded && (
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
