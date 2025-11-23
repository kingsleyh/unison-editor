import { useState, useRef, useEffect } from 'react';

interface ResizableSplitterProps {
  left: React.ReactNode;
  right: React.ReactNode;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  defaultLeftWidth?: number;
}

export function ResizableSplitter({
  left,
  right,
  minLeftWidth = 200,
  maxLeftWidth = 600,
  defaultLeftWidth = 250,
}: ResizableSplitterProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Constrain width between min and max
      const constrainedWidth = Math.max(
        minLeftWidth,
        Math.min(maxLeftWidth, newWidth)
      );

      setLeftWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
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
  }, [isDragging, minLeftWidth, maxLeftWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  return (
    <div ref={containerRef} className="resizable-container">
      <div className="resizable-left" style={{ width: `${leftWidth}px` }}>
        {left}
      </div>
      <div
        className={`resizable-divider ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
      />
      <div className="resizable-right">{right}</div>
    </div>
  );
}
