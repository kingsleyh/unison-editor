import { useState, useRef, useEffect, useCallback } from 'react';

export interface BottomPanel {
  id: string;
  label: string;
  component: React.ReactNode;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  minWidth?: number;
  defaultWidth?: number;
  headerActions?: React.ReactNode;
}

interface BottomPanelSplitterProps {
  panels: BottomPanel[];
  widths?: number[];
  defaultWidths?: number[];
  onWidthsChange?: (widths: number[]) => void;
}

/**
 * Bottom panel splitter with tab bar.
 *
 * Design:
 * - Tab bar at bottom shows all panel names
 * - Click a tab to toggle panel open/closed
 * - Open panels share space with resizable dividers
 * - Closed panels disappear completely (remaining panels expand)
 * - Drag dividers to resize, respecting min widths
 * - No drag-to-close behavior
 */
export function BottomPanelSplitter({
  panels,
  widths: controlledWidths,
  defaultWidths,
  onWidthsChange,
}: BottomPanelSplitterProps) {
  const [internalWidths, setInternalWidths] = useState<number[]>(() =>
    defaultWidths ?? panels.map((p) => p.defaultWidth || 100 / panels.length)
  );

  const isControlled = controlledWidths !== undefined;
  const widths = isControlled ? controlledWidths : internalWidths;

  const [draggingExpandedIndex, setDraggingExpandedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dragStartRef = useRef<{
    mouseX: number;
    leftOriginalIndex: number;
    rightOriginalIndex: number;
    leftWidthPx: number;
    rightWidthPx: number;
  } | null>(null);

  const updateWidths = useCallback((newWidths: number[]) => {
    if (isControlled) {
      onWidthsChange?.(newWidths);
    } else {
      setInternalWidths(newWidths);
      onWidthsChange?.(newWidths);
    }
  }, [isControlled, onWidthsChange]);

  // Get expanded panels with their original indices
  const expandedPanels = panels
    .map((panel, index) => ({ panel, originalIndex: index }))
    .filter(({ panel }) => !panel.collapsed);

  // Calculate total base width of expanded panels
  const totalExpandedBaseWidth = expandedPanels.reduce(
    (sum, { originalIndex }) => sum + (widths[originalIndex] || 20),
    0
  );

  // Get rendered width percentage for an expanded panel
  const getExpandedPanelWidth = (originalIndex: number): number => {
    if (expandedPanels.length === 1) return 100;
    if (totalExpandedBaseWidth === 0) return 100 / expandedPanels.length;
    return ((widths[originalIndex] || 20) / totalExpandedBaseWidth) * 100;
  };

  // Handle mouse move during drag
  useEffect(() => {
    if (draggingExpandedIndex === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;

      const { mouseX: startX, leftOriginalIndex, rightOriginalIndex, leftWidthPx, rightWidthPx } = dragStartRef.current;
      const deltaX = e.clientX - startX;

      const newLeftPx = leftWidthPx + deltaX;
      const newRightPx = rightWidthPx - deltaX;

      const leftPanel = panels[leftOriginalIndex];
      const rightPanel = panels[rightOriginalIndex];
      const leftMinPx = leftPanel.minWidth || 100;
      const rightMinPx = rightPanel.minWidth || 100;

      // Constrain to min widths (no collapse behavior)
      const constrainedLeftPx = Math.max(leftMinPx, newLeftPx);
      const constrainedRightPx = Math.max(rightMinPx, newRightPx);
      const totalPx = leftWidthPx + rightWidthPx;

      // Only update if within bounds
      if (constrainedLeftPx + constrainedRightPx <= totalPx) {
        const newWidths = [...widths];
        newWidths[leftOriginalIndex] = constrainedLeftPx;
        newWidths[rightOriginalIndex] = totalPx - constrainedLeftPx;
        updateWidths(newWidths);
      }
    };

    const handleMouseUp = () => {
      setDraggingExpandedIndex(null);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [draggingExpandedIndex, panels, widths, updateWidths]);

  // Handle divider mouse down
  const handleDividerMouseDown = (expandedIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const leftItem = expandedPanels[expandedIndex];
    const rightItem = expandedPanels[expandedIndex + 1];
    if (!leftItem || !rightItem) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const dividerCount = expandedPanels.length - 1;
    const availableWidth = containerRect.width - dividerCount * 4;

    const leftWidthPercent = getExpandedPanelWidth(leftItem.originalIndex);
    const rightWidthPercent = getExpandedPanelWidth(rightItem.originalIndex);

    dragStartRef.current = {
      mouseX: e.clientX,
      leftOriginalIndex: leftItem.originalIndex,
      rightOriginalIndex: rightItem.originalIndex,
      leftWidthPx: (leftWidthPercent / 100) * availableWidth,
      rightWidthPx: (rightWidthPercent / 100) * availableWidth,
    };

    setDraggingExpandedIndex(expandedIndex);
  };

  // Toggle panel open/closed
  const handleTabClick = (panel: BottomPanel) => {
    panel.onCollapse(!panel.collapsed);
  };

  return (
    <div className="bottom-panel-container">
      {/* Panel content area */}
      <div ref={containerRef} className="bottom-panel-splitter">
        {expandedPanels.length === 0 ? (
          <div className="bottom-panel-empty">
            Click a tab below to open a panel
          </div>
        ) : (
          expandedPanels.map(({ panel, originalIndex }, expandedIndex) => (
            <div key={panel.id} style={{ display: 'contents' }}>
              <div
                className="bottom-panel"
                style={{
                  width: expandedPanels.length === 1 ? '100%' : `${getExpandedPanelWidth(originalIndex)}%`,
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 'auto',
                  minWidth: panel.minWidth || 100,
                }}
              >
                <div className="bottom-panel-content">
                  <div className="bottom-panel-header">
                    <span className="bottom-panel-title">{panel.label}</span>
                    <div className="bottom-panel-header-actions">
                      {panel.headerActions}
                    </div>
                  </div>
                  <div className="bottom-panel-body">{panel.component}</div>
                </div>
              </div>

              {/* Divider after each expanded panel except the last */}
              {expandedIndex < expandedPanels.length - 1 && (
                <div
                  className={`bottom-panel-divider ${draggingExpandedIndex === expandedIndex ? 'dragging' : ''}`}
                  onMouseDown={handleDividerMouseDown(expandedIndex)}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Tab bar at bottom */}
      <div className="bottom-panel-tabs">
        {panels.map((panel) => (
          <button
            key={panel.id}
            className={`bottom-panel-tab ${!panel.collapsed ? 'active' : ''}`}
            onClick={() => handleTabClick(panel)}
            title={panel.collapsed ? `Open ${panel.label}` : `Close ${panel.label}`}
          >
            {panel.label}
          </button>
        ))}
      </div>
    </div>
  );
}
