import { useState, useRef, useEffect } from 'react';

interface VerticalResizableSplitterProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  minTopHeight?: number;
  minBottomHeight?: number;
  defaultTopPercent?: number; // Percentage of container height
  bottomCollapsed?: boolean;
  onBottomCollapse?: (collapsed: boolean) => void;
  collapsedHeight?: number; // Height of the collapsed bar
}

export function VerticalResizableSplitter({
  top,
  bottom,
  minTopHeight = 100,
  minBottomHeight = 100,
  defaultTopPercent = 50,
  bottomCollapsed = false,
  onBottomCollapse,
  collapsedHeight = 32,
}: VerticalResizableSplitterProps) {
  const [topPercent, setTopPercent] = useState(defaultTopPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Store the last non-collapsed percentage so we can restore it
  const lastTopPercentRef = useRef(defaultTopPercent);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerHeight = containerRect.height;
      const newTopHeight = e.clientY - containerRect.top;

      // Calculate percentage
      let newPercent = (newTopHeight / containerHeight) * 100;

      // Enforce minimum heights as percentages
      const minTopPercent = (minTopHeight / containerHeight) * 100;
      const collapsedPercent = ((containerHeight - collapsedHeight) / containerHeight) * 100;

      // If dragging near the bottom (within collapsedHeight threshold), collapse
      if (newPercent > collapsedPercent && onBottomCollapse) {
        onBottomCollapse(true);
        return;
      }

      // If currently collapsed and dragging up, expand
      if (bottomCollapsed && newPercent < collapsedPercent && onBottomCollapse) {
        onBottomCollapse(false);
        // Restore to last known percentage or a reasonable default
        newPercent = Math.min(lastTopPercentRef.current, collapsedPercent - 5);
      }

      const minBottomPercent = (minBottomHeight / containerHeight) * 100;
      const maxTopPercent = 100 - minBottomPercent;

      // Constrain between min and max
      newPercent = Math.max(minTopPercent, Math.min(maxTopPercent, newPercent));

      setTopPercent(newPercent);
      // Store this as the last good percentage
      lastTopPercentRef.current = newPercent;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minTopHeight, minBottomHeight, bottomCollapsed, onBottomCollapse, collapsedHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Calculate heights based on collapsed state
  const getHeights = () => {
    if (bottomCollapsed) {
      return {
        topHeight: `calc(100% - ${collapsedHeight}px)`,
        bottomHeight: `${collapsedHeight}px`,
      };
    }
    return {
      topHeight: `${topPercent}%`,
      bottomHeight: `${100 - topPercent}%`,
    };
  };

  const { topHeight, bottomHeight } = getHeights();

  return (
    <div ref={containerRef} className="vertical-resizable-container">
      <div className="vertical-resizable-top" style={{ height: topHeight }}>
        {top}
      </div>
      <div
        className={`vertical-resizable-divider ${isDragging ? 'dragging' : ''} ${bottomCollapsed ? 'collapsed' : ''}`}
        onMouseDown={handleMouseDown}
      />
      <div
        className={`vertical-resizable-bottom ${bottomCollapsed ? 'collapsed' : ''}`}
        style={{ height: bottomHeight }}
      >
        {bottom}
      </div>
    </div>
  );
}
