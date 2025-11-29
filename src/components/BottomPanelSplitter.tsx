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
}

/**
 * A horizontal splitter for the bottom panel area.
 * Supports multiple panels that can be collapsed to vertical labels.
 * Similar to the top panel ResizableSplitter behavior.
 */
export function BottomPanelSplitter({
  panels,
  collapsedWidth = 28,
  collapseThreshold = 50,
}: BottomPanelSplitterProps) {
  // Store widths as percentages of the container
  const [widths, setWidths] = useState<number[]>(() =>
    panels.map((p) => p.defaultWidth || 100 / panels.length)
  );
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastWidthsRef = useRef<number[]>(widths);

  // Handle mouse drag for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingIndex === null || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      // Calculate new widths based on mouse position
      const newWidths = [...widths];

      // Calculate the position of the divider we're dragging
      let dividerPosition = 0;
      for (let i = 0; i < draggingIndex; i++) {
        if (!panels[i].collapsed) {
          dividerPosition += (widths[i] / 100) * containerWidth;
        } else {
          dividerPosition += collapsedWidth;
        }
        dividerPosition += 4; // Divider width
      }

      // Calculate the new width for the panel to the left of the divider
      const leftPanelIndex = draggingIndex;
      const leftPanel = panels[leftPanelIndex];

      if (!leftPanel.collapsed) {
        // Calculate total width available for non-collapsed panels
        let availableWidth = containerWidth;
        let collapsedCount = 0;
        panels.forEach((p, i) => {
          if (p.collapsed) {
            availableWidth -= collapsedWidth;
            collapsedCount++;
          }
        });
        availableWidth -= (panels.length - 1) * 4; // Dividers

        // Calculate width based on mouse position
        let leftWidth = mouseX;
        for (let i = 0; i < leftPanelIndex; i++) {
          if (!panels[i].collapsed) {
            leftWidth -= (widths[i] / 100) * containerWidth;
          } else {
            leftWidth -= collapsedWidth;
          }
          leftWidth -= 4; // Divider
        }

        const minWidth = leftPanel.minWidth || 100;
        const leftWidthPercent = (leftWidth / containerWidth) * 100;

        // Check for collapse
        if (leftWidth < minWidth - collapseThreshold) {
          leftPanel.onCollapse(true);
          return;
        }

        // Constrain the width
        const constrainedWidth = Math.max(minWidth, leftWidth);
        const constrainedPercent = (constrainedWidth / containerWidth) * 100;

        // Adjust the panel to the right to compensate
        const rightPanelIndex = draggingIndex + 1;
        if (rightPanelIndex < panels.length && !panels[rightPanelIndex].collapsed) {
          const diff = constrainedPercent - widths[leftPanelIndex];
          newWidths[leftPanelIndex] = constrainedPercent;
          newWidths[rightPanelIndex] = Math.max(10, widths[rightPanelIndex] - diff);
          setWidths(newWidths);
          lastWidthsRef.current = newWidths;
        }
      }
    };

    const handleMouseUp = () => {
      setDraggingIndex(null);
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
  }, [draggingIndex, widths, panels, collapsedWidth, collapseThreshold]);

  const handleDividerMouseDown = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingIndex(index);
  }, []);

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
