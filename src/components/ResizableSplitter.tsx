import { useState, useRef, useEffect, useCallback } from 'react';

interface ResizableSplitterProps {
  left: React.ReactNode;
  right: React.ReactNode;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  defaultLeftWidth?: number;
  /** Controlled width (if provided, component is controlled) */
  width?: number;
  /** Callback when width changes (for persistence) */
  onWidthChange?: (width: number) => void;
  /** Whether the left panel is collapsed */
  leftCollapsed?: boolean;
  /** Callback when collapse state changes */
  onLeftCollapse?: (collapsed: boolean) => void;
  /** Width when collapsed (shows a thin grab handle) */
  collapsedWidth?: number;
  /** Threshold below minLeftWidth to trigger collapse */
  collapseThreshold?: number;
  /** Label to show vertically when collapsed */
  collapsedLabel?: string;
}

export function ResizableSplitter({
  left,
  right,
  minLeftWidth = 200,
  maxLeftWidth = 600,
  defaultLeftWidth = 250,
  width,
  onWidthChange,
  leftCollapsed = false,
  onLeftCollapse,
  collapsedWidth = 28,
  collapseThreshold = 50,
  collapsedLabel,
}: ResizableSplitterProps) {
  // Internal state for uncontrolled mode
  const [internalWidth, setInternalWidth] = useState(defaultLeftWidth);

  // Use controlled width if provided, otherwise use internal state
  const isControlled = width !== undefined;
  const leftWidth = isControlled ? width : internalWidth;

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Store the last non-collapsed width so we can restore it
  const lastWidthRef = useRef(defaultLeftWidth);

  // Track if we're in the process of collapsing during this drag
  const collapsingRef = useRef(false);

  // Helper to update width - calls callback for controlled, sets state for uncontrolled
  const updateWidth = useCallback((newWidth: number) => {
    if (isControlled) {
      onWidthChange?.(newWidth);
    } else {
      setInternalWidth(newWidth);
    }
  }, [isControlled, onWidthChange]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // If we've started collapsing during this drag, don't allow re-expansion until mouse up
      if (collapsingRef.current) {
        return;
      }

      // Check if we should collapse (dragging past the collapse threshold)
      if (newWidth < minLeftWidth - collapseThreshold && onLeftCollapse && !leftCollapsed) {
        collapsingRef.current = true;
        onLeftCollapse(true);
        return;
      }

      // If currently collapsed and dragging right past the expand threshold, expand
      // Use a larger threshold for expand to provide hysteresis
      const expandThreshold = minLeftWidth * 0.5;
      if (leftCollapsed && newWidth > expandThreshold && onLeftCollapse) {
        onLeftCollapse(false);
        // Set to last known width or the new position, whichever is greater
        const restoredWidth = Math.max(lastWidthRef.current, minLeftWidth);
        updateWidth(restoredWidth);
        return;
      }

      // Normal resize - constrain width between min and max
      if (!leftCollapsed) {
        const constrainedWidth = Math.max(
          minLeftWidth,
          Math.min(maxLeftWidth, newWidth)
        );
        updateWidth(constrainedWidth);
        // Store this as the last good width
        lastWidthRef.current = constrainedWidth;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      collapsingRef.current = false; // Reset for next drag
    };

    if (isDragging) {
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
  }, [isDragging, minLeftWidth, maxLeftWidth, leftCollapsed, onLeftCollapse, collapsedWidth, collapseThreshold, updateWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Double-click on divider to toggle collapse
  const handleDoubleClick = () => {
    if (onLeftCollapse) {
      onLeftCollapse(!leftCollapsed);
    }
  };

  // Calculate the actual width based on collapsed state
  const actualWidth = leftCollapsed ? collapsedWidth : leftWidth;

  return (
    <div ref={containerRef} className="resizable-container">
      <div
        className={`resizable-left ${leftCollapsed ? 'collapsed' : ''}`}
        style={{ width: `${actualWidth}px` }}
        onClick={leftCollapsed ? handleDoubleClick : undefined}
        title={leftCollapsed ? 'Click to expand' : undefined}
      >
        {leftCollapsed ? (
          collapsedLabel && (
            <div className="collapsed-label">
              <span className="collapsed-label-icon">▶</span>
              <span className="collapsed-label-text">{collapsedLabel}</span>
            </div>
          )
        ) : (
          left
        )}
      </div>
      <div
        className={`resizable-divider ${isDragging ? 'dragging' : ''} ${leftCollapsed ? 'collapsed' : ''}`}
        onMouseDown={leftCollapsed ? undefined : handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title={leftCollapsed ? 'Double-click to expand' : 'Drag to resize, double-click to collapse'}
      />
      <div className="resizable-right">{right}</div>
    </div>
  );
}
