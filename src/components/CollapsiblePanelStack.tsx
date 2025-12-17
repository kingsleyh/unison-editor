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
  /** Controlled workspace expanded state */
  workspaceExpanded?: boolean;
  /** Controlled file explorer expanded state */
  fileExplorerExpanded?: boolean;
  /** Controlled outline expanded state */
  outlineExpanded?: boolean;
  /** Controlled UCM explorer expanded state */
  ucmExplorerExpanded?: boolean;
  /** Controlled split percent - file explorer % of resizable area */
  splitPercent?: number;
  /** Controlled split percent - outline % of outline+ucm area */
  outlineSplitPercent?: number;
  /** Callbacks for state changes */
  onWorkspaceExpandedChange?: (expanded: boolean) => void;
  onFileExplorerExpandedChange?: (expanded: boolean) => void;
  onOutlineExpandedChange?: (expanded: boolean) => void;
  onUcmExplorerExpandedChange?: (expanded: boolean) => void;
  onSplitPercentChange?: (percent: number) => void;
  onOutlineSplitPercentChange?: (percent: number) => void;
}

/**
 * Collapsible panel stack with 3 resizable panels:
 * - File Explorer (top)
 * - Outline (middle)
 * - UCM Explorer (bottom)
 *
 * Uses two split percentages:
 * - splitPercent: File Explorer's share of the total resizable area
 * - outlineSplitPercent: Outline's share of the remaining (Outline + UCM) area
 */
export function CollapsiblePanelStack({
  panels,
  collapsedHeight = 28,
  workspaceExpanded: controlledWorkspaceExpanded,
  fileExplorerExpanded: controlledFileExpanded,
  outlineExpanded: controlledOutlineExpanded,
  ucmExplorerExpanded: controlledUcmExpanded,
  splitPercent: controlledSplitPercent,
  outlineSplitPercent: controlledOutlineSplitPercent,
  onWorkspaceExpandedChange,
  onFileExplorerExpandedChange,
  onOutlineExpandedChange,
  onUcmExplorerExpandedChange,
  onSplitPercentChange,
  onOutlineSplitPercentChange,
}: CollapsiblePanelStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal state for uncontrolled mode
  const [internalWorkspaceExpanded, setInternalWorkspaceExpanded] = useState(true);
  const [internalFileExpanded, setInternalFileExpanded] = useState(true);
  const [internalOutlineExpanded, setInternalOutlineExpanded] = useState(true);
  const [internalUcmExpanded, setInternalUcmExpanded] = useState(true);
  const [internalSplitPercent, setInternalSplitPercent] = useState(40);
  const [internalOutlineSplitPercent, setInternalOutlineSplitPercent] = useState(50);

  // Controlled vs uncontrolled
  const isWorkspaceExpandedControlled = controlledWorkspaceExpanded !== undefined;
  const isFileExpandedControlled = controlledFileExpanded !== undefined;
  const isOutlineExpandedControlled = controlledOutlineExpanded !== undefined;
  const isUcmExpandedControlled = controlledUcmExpanded !== undefined;
  const isSplitPercentControlled = controlledSplitPercent !== undefined;
  const isOutlineSplitPercentControlled = controlledOutlineSplitPercent !== undefined;

  // Current values
  const workspaceExpanded = isWorkspaceExpandedControlled ? controlledWorkspaceExpanded : internalWorkspaceExpanded;
  const fileExpanded = isFileExpandedControlled ? controlledFileExpanded : internalFileExpanded;
  const outlineExpanded = isOutlineExpandedControlled ? controlledOutlineExpanded : internalOutlineExpanded;
  const ucmExpanded = isUcmExpandedControlled ? controlledUcmExpanded : internalUcmExpanded;
  const splitPercent = isSplitPercentControlled ? controlledSplitPercent : internalSplitPercent;
  const outlineSplitPercent = isOutlineSplitPercentControlled ? controlledOutlineSplitPercent : internalOutlineSplitPercent;

  const [dragging, setDragging] = useState<'file-outline' | 'outline-ucm' | null>(null);

  const dragStartRef = useRef<{
    mouseY: number;
    startPercent: number;
    areaTop: number;
    areaHeight: number;
  } | null>(null);

  // Update helpers
  const updateWorkspaceExpanded = useCallback((expanded: boolean) => {
    if (isWorkspaceExpandedControlled) {
      onWorkspaceExpandedChange?.(expanded);
    } else {
      setInternalWorkspaceExpanded(expanded);
      onWorkspaceExpandedChange?.(expanded);
    }
  }, [isWorkspaceExpandedControlled, onWorkspaceExpandedChange]);

  const updateFileExpanded = useCallback((expanded: boolean) => {
    if (isFileExpandedControlled) {
      onFileExplorerExpandedChange?.(expanded);
    } else {
      setInternalFileExpanded(expanded);
      onFileExplorerExpandedChange?.(expanded);
    }
  }, [isFileExpandedControlled, onFileExplorerExpandedChange]);

  const updateOutlineExpanded = useCallback((expanded: boolean) => {
    if (isOutlineExpandedControlled) {
      onOutlineExpandedChange?.(expanded);
    } else {
      setInternalOutlineExpanded(expanded);
      onOutlineExpandedChange?.(expanded);
    }
  }, [isOutlineExpandedControlled, onOutlineExpandedChange]);

  const updateUcmExpanded = useCallback((expanded: boolean) => {
    if (isUcmExpandedControlled) {
      onUcmExplorerExpandedChange?.(expanded);
    } else {
      setInternalUcmExpanded(expanded);
      onUcmExplorerExpandedChange?.(expanded);
    }
  }, [isUcmExpandedControlled, onUcmExplorerExpandedChange]);

  const updateSplitPercent = useCallback((percent: number) => {
    if (isSplitPercentControlled) {
      onSplitPercentChange?.(percent);
    } else {
      setInternalSplitPercent(percent);
      onSplitPercentChange?.(percent);
    }
  }, [isSplitPercentControlled, onSplitPercentChange]);

  const updateOutlineSplitPercent = useCallback((percent: number) => {
    if (isOutlineSplitPercentControlled) {
      onOutlineSplitPercentChange?.(percent);
    } else {
      setInternalOutlineSplitPercent(percent);
      onOutlineSplitPercentChange?.(percent);
    }
  }, [isOutlineSplitPercentControlled, onOutlineSplitPercentChange]);

  // Handle drag start
  const handleDragStart = useCallback((divider: 'file-outline' | 'outline-ucm', e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const workspaceHeight = workspaceExpanded ? 150 : collapsedHeight;
    const areaTop = containerRect.top + workspaceHeight + 4;
    const areaHeight = containerRect.height - workspaceHeight - 4;

    dragStartRef.current = {
      mouseY: e.clientY,
      startPercent: divider === 'file-outline' ? splitPercent : outlineSplitPercent,
      areaTop,
      areaHeight,
    };

    setDragging(divider);
  }, [splitPercent, outlineSplitPercent, workspaceExpanded, collapsedHeight]);

  // Handle drag
  useEffect(() => {
    if (!dragging || !dragStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const { mouseY: startY, startPercent, areaHeight } = dragStartRef.current;
      const deltaY = e.clientY - startY;
      const deltaPercent = (deltaY / areaHeight) * 100;

      if (dragging === 'file-outline') {
        // Dragging between File Explorer and Outline
        let newPercent = startPercent + deltaPercent;
        newPercent = Math.max(0, Math.min(90, newPercent));

        if (newPercent < 10 && fileExpanded) {
          updateFileExpanded(false);
          updateSplitPercent(0);
        } else if (newPercent >= 10) {
          if (!fileExpanded) updateFileExpanded(true);
          updateSplitPercent(newPercent);
        }
      } else if (dragging === 'outline-ucm') {
        // Dragging between Outline and UCM
        let newPercent = startPercent + deltaPercent;
        newPercent = Math.max(0, Math.min(100, newPercent));

        if (newPercent < 15 && outlineExpanded) {
          // Collapse outline when dragged to top
          updateOutlineExpanded(false);
          updateOutlineSplitPercent(0);
        } else if (newPercent > 85 && ucmExpanded) {
          // Collapse UCM when dragged to bottom (header still visible)
          updateUcmExpanded(false);
          updateOutlineSplitPercent(85); // Cap at 85% so UCM header stays visible
        } else if (newPercent >= 15 && newPercent <= 85) {
          // Normal resize range - ensure both are expanded
          if (!outlineExpanded) updateOutlineExpanded(true);
          if (!ucmExpanded) updateUcmExpanded(true);
          updateOutlineSplitPercent(newPercent);
        }
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
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
  }, [dragging, fileExpanded, outlineExpanded, ucmExpanded, updateFileExpanded, updateOutlineExpanded, updateUcmExpanded, updateSplitPercent, updateOutlineSplitPercent]);

  // Handle panel header clicks
  const handlePanelHeaderClick = useCallback((panelId: string) => {
    if (panelId === 'workspace') {
      updateWorkspaceExpanded(!workspaceExpanded);
    } else if (panelId === 'file-explorer') {
      if (fileExpanded) {
        updateFileExpanded(false);
        updateSplitPercent(0);
      } else {
        updateFileExpanded(true);
        updateSplitPercent(40);
      }
    } else if (panelId === 'outline') {
      if (outlineExpanded) {
        updateOutlineExpanded(false);
        updateOutlineSplitPercent(0);
      } else {
        updateOutlineExpanded(true);
        if (!ucmExpanded) {
          // Expand UCM too so both are visible
          updateUcmExpanded(true);
        }
        updateOutlineSplitPercent(50);
      }
    } else if (panelId === 'ucm-explorer') {
      if (ucmExpanded) {
        // Collapse UCM - outline takes 85% (leaving room for UCM header)
        updateUcmExpanded(false);
        updateOutlineSplitPercent(85);
      } else {
        // Expand UCM
        updateUcmExpanded(true);
        if (!outlineExpanded) {
          updateOutlineSplitPercent(0);
        } else {
          updateOutlineSplitPercent(50);
        }
      }
    }
  }, [workspaceExpanded, fileExpanded, outlineExpanded, ucmExpanded, outlineSplitPercent, updateWorkspaceExpanded, updateFileExpanded, updateOutlineExpanded, updateUcmExpanded, updateSplitPercent, updateOutlineSplitPercent]);

  const workspacePanel = panels.find(p => p.id === 'workspace');
  const fileExplorerPanel = panels.find(p => p.id === 'file-explorer');
  const outlinePanel = panels.find(p => p.id === 'outline');
  const ucmExplorerPanel = panels.find(p => p.id === 'ucm-explorer');

  // Calculate flex grow values for the 3 resizable panels
  // Using flex-grow ratios instead of fixed percentages to ensure panels can shrink
  // File Explorer: splitPercent weight
  // Outline: outlineSplitPercent weight of remaining
  // UCM: (100 - outlineSplitPercent) weight of remaining
  const fileGrow = fileExpanded ? splitPercent : 0;
  const remainingWeight = 100 - (fileExpanded ? splitPercent : 0);
  const outlineGrow = outlineExpanded ? (outlineSplitPercent / 100) * remainingWeight : 0;
  const ucmGrow = ucmExpanded ? ((100 - outlineSplitPercent) / 100) * remainingWeight : 0;

  return (
    <div ref={containerRef} className="collapsible-panel-stack">
      {/* Workspace Panel - Fixed height */}
      {workspacePanel && (
        <div className={`collapsible-panel fixed-height workspace-panel ${workspaceExpanded ? 'expanded' : 'collapsed'}`}>
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

      {/* Resizable area containing File Explorer, Outline, and UCM Explorer */}
      <div className="resizable-panel-area">
        {/* File Explorer Panel */}
        {fileExplorerPanel && (
          <div
            className={`collapsible-panel resizable file-explorer-panel ${fileExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: fileExpanded ? `${fileGrow} 1 0` : `0 0 ${collapsedHeight}px`,
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

        {/* Divider between File Explorer and Outline */}
        {fileExplorerPanel && (outlinePanel || ucmExplorerPanel) && fileExpanded && (outlineExpanded || ucmExpanded) && (
          <div
            className={`collapsible-panel-divider ${dragging === 'file-outline' ? 'dragging' : ''}`}
            onMouseDown={(e) => handleDragStart('file-outline', e)}
          />
        )}

        {/* Outline Panel */}
        {outlinePanel && (
          <div
            className={`collapsible-panel resizable outline-panel ${outlineExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: outlineExpanded ? `${outlineGrow} 1 0` : `0 0 ${collapsedHeight}px`,
              minHeight: outlineExpanded ? (outlinePanel.minHeight ?? 80) : collapsedHeight,
            }}
          >
            <div
              className="collapsible-panel-header"
              onClick={() => handlePanelHeaderClick('outline')}
            >
              <span className="collapsible-panel-chevron">{outlineExpanded ? '▼' : '▶'}</span>
              <span className="collapsible-panel-title">{outlinePanel.title}</span>
            </div>
            {outlineExpanded && (
              <div className="collapsible-panel-content">
                {outlinePanel.content}
              </div>
            )}
          </div>
        )}

        {/* Divider between Outline and UCM Explorer */}
        {outlinePanel && ucmExplorerPanel && outlineExpanded && ucmExpanded && (
          <div
            className={`collapsible-panel-divider ${dragging === 'outline-ucm' ? 'dragging' : ''}`}
            onMouseDown={(e) => handleDragStart('outline-ucm', e)}
          />
        )}

        {/* UCM Explorer Panel */}
        {ucmExplorerPanel && (
          <div
            className={`collapsible-panel resizable ucm-explorer-panel ${ucmExpanded ? 'expanded' : 'collapsed'}`}
            style={{
              flex: ucmExpanded ? `${ucmGrow} 1 0` : `0 0 ${collapsedHeight}px`,
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
