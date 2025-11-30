import { useState, useRef, useEffect, useCallback } from 'react';

export interface BottomPanel {
  id: string;
  label: string;
  component: React.ReactNode;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  minWidth?: number;
  defaultWidth?: number;
  headerActions?: React.ReactNode; // Optional actions to show in the header
}

interface BottomPanelSplitterProps {
  panels: BottomPanel[];
  collapsedWidth?: number;
  collapseThreshold?: number;
  /** Controlled widths (if provided, component is controlled) */
  widths?: number[];
  /** Default widths for uncontrolled mode */
  defaultWidths?: number[];
  /** Callback when widths change (for persistence) */
  onWidthsChange?: (widths: number[]) => void;
}

/**
 * A horizontal splitter for the bottom panel area.
 * Supports multiple panels that can be collapsed to vertical labels.
 *
 * Key design: Uses absolute positioning from mouse position, NOT deltas.
 * This ensures smooth dragging regardless of re-render timing.
 */
export function BottomPanelSplitter({
  panels,
  collapsedWidth = 28,
  collapseThreshold = 50,
  widths: controlledWidths,
  defaultWidths,
  onWidthsChange,
}: BottomPanelSplitterProps) {
  // Internal state for uncontrolled mode - initialized once
  const [internalWidths, setInternalWidths] = useState<number[]>(() =>
    defaultWidths ?? panels.map((p) => p.defaultWidth || 100 / panels.length)
  );

  // Use controlled widths if provided, otherwise use internal state
  const isControlled = controlledWidths !== undefined;
  const widths = isControlled ? controlledWidths : internalWidths;

  // Dragging state: which divider index, and the starting mouse X
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store starting positions when drag begins
  const dragStartRef = useRef<{
    mouseX: number;
    leftPanelPercent: number;
    rightPanelPercent: number;
    containerWidth: number;
  } | null>(null);

  // Helper to update widths
  const updateWidths = useCallback((newWidths: number[]) => {
    if (isControlled) {
      onWidthsChange?.(newWidths);
    } else {
      setInternalWidths(newWidths);
      onWidthsChange?.(newWidths); // Still notify for persistence
    }
  }, [isControlled, onWidthsChange]);

  // Handle mouse drag for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingIndex === null || !containerRef.current || !dragStartRef.current) return;

      const { mouseX: startX, leftPanelPercent: startLeftPercent, rightPanelPercent: startRightPercent, containerWidth } = dragStartRef.current;

      // Calculate mouse delta from drag start
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;

      // Calculate new percentages (absolute from start, not incremental)
      const newLeftPercent = startLeftPercent + deltaPercent;
      const newRightPercent = startRightPercent - deltaPercent;

      // Get panel info
      const leftPanelIndex = draggingIndex;
      const rightPanelIndex = draggingIndex + 1;
      const leftPanel = panels[leftPanelIndex];
      const rightPanel = panels[rightPanelIndex];

      if (!leftPanel || !rightPanel || leftPanel.collapsed || rightPanel.collapsed) return;

      // Get min widths as percentages
      const leftMinPercent = ((leftPanel.minWidth || 100) / containerWidth) * 100;
      const rightMinPercent = ((rightPanel.minWidth || 100) / containerWidth) * 100;

      // Check for collapse thresholds (collapse if dragged past min - threshold)
      const leftCollapsePercent = leftMinPercent - (collapseThreshold / containerWidth) * 100;
      const rightCollapsePercent = rightMinPercent - (collapseThreshold / containerWidth) * 100;

      if (newLeftPercent < leftCollapsePercent) {
        // Collapse left panel
        leftPanel.onCollapse(true);
        return;
      }

      if (newRightPercent < rightCollapsePercent) {
        // Collapse right panel
        rightPanel.onCollapse(true);
        return;
      }

      // Constrain to min widths
      const constrainedLeftPercent = Math.max(leftMinPercent, newLeftPercent);
      const constrainedRightPercent = Math.max(rightMinPercent, newRightPercent);

      // If both can fit, update
      const totalNeeded = constrainedLeftPercent + constrainedRightPercent;
      const totalAvailable = startLeftPercent + startRightPercent;

      if (totalNeeded <= totalAvailable) {
        const newWidths = [...widths];
        newWidths[leftPanelIndex] = constrainedLeftPercent;
        newWidths[rightPanelIndex] = totalAvailable - constrainedLeftPercent;
        updateWidths(newWidths);
      }
    };

    const handleMouseUp = () => {
      setDraggingIndex(null);
      dragStartRef.current = null;
    };

    if (draggingIndex !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [draggingIndex, panels, widths, collapsedWidth, collapseThreshold, updateWidths]);

  const handleDividerMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();

    if (!containerRef.current) return;

    const leftPanel = panels[index];
    const rightPanel = panels[index + 1];

    // Only allow dragging between two expanded panels
    if (!leftPanel || !rightPanel || leftPanel.collapsed || rightPanel.collapsed) return;

    // Store the starting state for absolute positioning
    dragStartRef.current = {
      mouseX: e.clientX,
      leftPanelPercent: widths[index],
      rightPanelPercent: widths[index + 1],
      containerWidth: containerRef.current.getBoundingClientRect().width,
    };

    setDraggingIndex(index);
  }, [panels, widths]);

  const handlePanelClick = useCallback((panel: BottomPanel) => {
    if (panel.collapsed) {
      panel.onCollapse(false);
    }
  }, []);

  // Calculate how many panels are expanded
  const expandedCount = panels.filter((p) => !p.collapsed).length;

  return (
    <div ref={containerRef} className="bottom-panel-splitter">
      {panels.map((panel, index) => (
        <div key={panel.id} style={{ display: 'contents' }}>
          {/* Panel */}
          <div
            className={`bottom-panel ${panel.collapsed ? 'collapsed' : ''}`}
            style={{
              width: panel.collapsed
                ? `${collapsedWidth}px`
                : expandedCount === 1
                  ? '100%'
                  : `${widths[index]}%`,
              flexGrow: panel.collapsed ? 0 : 1,
              flexShrink: panel.collapsed ? 0 : 1,
            }}
            onClick={panel.collapsed ? () => handlePanelClick(panel) : undefined}
            title={panel.collapsed ? `Click to expand ${panel.label}` : undefined}
          >
            {panel.collapsed ? (
              <div className="bottom-panel-collapsed-label">
                <span className="bottom-panel-collapsed-icon">&#9654;</span>
                <span className="bottom-panel-collapsed-text">{panel.label}</span>
              </div>
            ) : (
              <div className="bottom-panel-content">
                <div className="bottom-panel-header">
                  <span className="bottom-panel-title">{panel.label}</span>
                  <div className="bottom-panel-header-actions">
                    {panel.headerActions}
                    <button
                      className="bottom-panel-collapse-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        panel.onCollapse(true);
                      }}
                      title={`Collapse ${panel.label}`}
                    >
                      &#10005;
                    </button>
                  </div>
                </div>
                <div className="bottom-panel-body">{panel.component}</div>
              </div>
            )}
          </div>

          {/* Divider (not after last panel) */}
          {index < panels.length - 1 && (
            <div
              className={`bottom-panel-divider ${draggingIndex === index ? 'dragging' : ''}`}
              onMouseDown={handleDividerMouseDown(index)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
