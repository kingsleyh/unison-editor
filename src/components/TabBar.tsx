import { useState, useRef, useEffect } from 'react';
import type { EditorTab } from '../store/unisonStore';

interface TabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
}: TabBarProps) {
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if tabs overflow
  useEffect(() => {
    const checkOverflow = () => {
      const container = tabsContainerRef.current;
      if (!container) return;

      const isOverflowing = container.scrollWidth > container.clientWidth;
      setHasOverflow(isOverflowing);
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [tabs]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowOverflowMenu(false);
      }
    };

    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOverflowMenu]);

  const handleTabSelect = (tabId: string) => {
    onTabClick(tabId);
    setShowOverflowMenu(false);
  };

  return (
    <div className="tabs-bar">
      <div className="tabs" ref={tabsContainerRef}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onTabClick(tab.id)}
          >
            <span className="tab-title">
              {tab.title}
              {tab.isDirty && !tab.saveStatus && <span className="tab-dirty">●</span>}
              {tab.saveStatus === 'saving' && <span className="tab-saving">⟳</span>}
              {tab.saveStatus === 'saved' && <span className="tab-saved">✓</span>}
              {tab.saveStatus === 'error' && <span className="tab-error">✕</span>}
            </span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="tab-actions">
        {hasOverflow && (
          <div className="tab-overflow-menu" ref={dropdownRef}>
            <button
              className="tab-overflow-btn"
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              title="Show all tabs"
            >
              »
            </button>
            {showOverflowMenu && (
              <div className="tab-dropdown">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`tab-dropdown-item ${
                      tab.id === activeTabId ? 'active' : ''
                    }`}
                    onClick={() => handleTabSelect(tab.id)}
                  >
                    <span className="tab-dropdown-title">
                      {tab.title}
                      {tab.isDirty && !tab.saveStatus && <span className="tab-dirty">●</span>}
                      {tab.saveStatus === 'saving' && <span className="tab-saving">⟳</span>}
                      {tab.saveStatus === 'saved' && <span className="tab-saved">✓</span>}
                      {tab.saveStatus === 'error' && <span className="tab-error">✕</span>}
                    </span>
                    <button
                      className="tab-dropdown-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTabClose(tab.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
