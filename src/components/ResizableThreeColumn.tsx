import { useState, useRef, useEffect } from 'react';

interface ResizableThreeColumnProps {
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
  minLeftWidth?: number;
  minMiddleWidth?: number;
  minRightWidth?: number;
  defaultLeftWidth?: number;
  defaultMiddleWidth?: number;
}

export function ResizableThreeColumn({
  left,
  middle,
  right,
  minLeftWidth = 200,
  minMiddleWidth = 300,
  minRightWidth = 400,
  defaultLeftWidth = 250,
  defaultMiddleWidth = 400,
}: ResizableThreeColumnProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [middleWidth, setMiddleWidth] = useState(defaultMiddleWidth);
  const [activeDivider, setActiveDivider] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeDivider || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = e.clientX - containerRect.left;

      if (activeDivider === 'left') {
        // Dragging the left divider (between left and middle columns)
        // Ensure we maintain minimum widths for all columns
        const maxLeftWidth = containerWidth - minMiddleWidth - minRightWidth - 8; // 8px for dividers
        const newLeftWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, mouseX));
        setLeftWidth(newLeftWidth);
      } else if (activeDivider === 'right') {
        // Dragging the right divider (between middle and right columns)
        // mouseX should be at least leftWidth + minMiddleWidth + divider width
        const minMiddleRight = leftWidth + minMiddleWidth + 4;
        const maxMiddleRight = containerWidth - minRightWidth;
        const constrainedX = Math.max(minMiddleRight, Math.min(maxMiddleRight, mouseX));
        const newMiddleWidth = constrainedX - leftWidth - 4;
        setMiddleWidth(newMiddleWidth);
      }
    };

    const handleMouseUp = () => {
      setActiveDivider(null);
    };

    if (activeDivider) {
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
  }, [activeDivider, leftWidth, minLeftWidth, minMiddleWidth, minRightWidth]);

  const handleLeftDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDivider('left');
  };

  const handleRightDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDivider('right');
  };

  return (
    <div ref={containerRef} className="three-column-container">
      <div className="three-column-left" style={{ width: `${leftWidth}px` }}>
        {left}
      </div>
      <div
        className={`column-divider ${activeDivider === 'left' ? 'dragging' : ''}`}
        onMouseDown={handleLeftDividerMouseDown}
      />
      <div className="three-column-middle" style={{ width: `${middleWidth}px` }}>
        {middle}
      </div>
      <div
        className={`column-divider ${activeDivider === 'right' ? 'dragging' : ''}`}
        onMouseDown={handleRightDividerMouseDown}
      />
      <div className="three-column-right">{right}</div>
    </div>
  );
}
