/**
 * ThemeSettings Component
 *
 * Modal for customizing the editor theme with color pickers,
 * font settings, and theme management (import/export/save).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { themeService } from '../../theme/themeService';
import { logger } from '../../services/loggingService';
import type { Theme, SyntaxColors, UIColors, TerminalColors, FontSettings } from '../../types/theme';
import { ColorPicker } from './ColorPicker';
import { AlertModal } from '../AlertModal';
import './ThemeSettings.css';

interface ThemeSettingsProps {
  onClose: () => void;
}

type TabId = 'syntax' | 'interface' | 'terminal' | 'fonts';

// Color definitions for each section
interface ColorDef {
  key: string;
  label: string;
}

const syntaxColorGroups: { title: string; colors: ColorDef[] }[] = [
  {
    title: 'Keywords',
    colors: [
      { key: 'keyword', label: 'Keyword' },
      { key: 'controlKeyword', label: 'Control (if, then, else)' },
      { key: 'typeKeyword', label: 'Type Keyword' },
      { key: 'useKeyword', label: 'Use Keyword' },
      { key: 'linkKeyword', label: 'Link Keyword' },
      { key: 'dataTypeKeyword', label: 'Data Type Keyword' },
      { key: 'docKeyword', label: 'Doc Keyword' },
    ],
  },
  {
    title: 'References',
    colors: [
      { key: 'typeReference', label: 'Type Reference' },
      { key: 'termReference', label: 'Term Reference' },
      { key: 'hashQualifier', label: 'Hash Qualifier' },
      { key: 'typeNamespace', label: 'Type Namespace' },
      { key: 'termNamespace', label: 'Term Namespace' },
      { key: 'constructorNamespace', label: 'Constructor Namespace' },
    ],
  },
  {
    title: 'Operators & Delimiters',
    colors: [
      { key: 'operator', label: 'Operator' },
      { key: 'typeAscription', label: 'Type Ascription (:)' },
      { key: 'bindingEquals', label: 'Binding Equals (=)' },
      { key: 'delayForce', label: 'Delay/Force (\')' },
      { key: 'arrow', label: 'Arrow (->)' },
      { key: 'abilityBraces', label: 'Ability Braces {}' },
      { key: 'dataTypeParams', label: 'Type Parameters' },
      { key: 'dataTypeModifier', label: 'Type Modifier' },
      { key: 'parenthesis', label: 'Parenthesis ()' },
      { key: 'brackets', label: 'Brackets []' },
    ],
  },
  {
    title: 'Literals',
    colors: [
      { key: 'number', label: 'Number' },
      { key: 'string', label: 'String' },
      { key: 'boolean', label: 'Boolean' },
      { key: 'char', label: 'Character' },
    ],
  },
  {
    title: 'Comments & Documentation',
    colors: [
      { key: 'comment', label: 'Comment' },
      { key: 'docBlock', label: 'Doc Block' },
      { key: 'docCode', label: 'Doc Code' },
      { key: 'docDirective', label: 'Doc Directive' },
    ],
  },
  {
    title: 'Other',
    colors: [
      { key: 'constructor', label: 'Constructor' },
      { key: 'pattern', label: 'Pattern' },
    ],
  },
];

const uiColorGroups: { title: string; colors: ColorDef[] }[] = [
  {
    title: 'Editor',
    colors: [
      { key: 'editorBackground', label: 'Background' },
      { key: 'editorForeground', label: 'Foreground' },
      { key: 'editorSelection', label: 'Selection' },
      { key: 'editorLineHighlight', label: 'Line Highlight' },
      { key: 'editorCursor', label: 'Cursor' },
      { key: 'editorLineNumbers', label: 'Line Numbers' },
      { key: 'editorLineNumbersActive', label: 'Active Line Number' },
      { key: 'editorBracketMatch', label: 'Bracket Match' },
      { key: 'editorFindMatch', label: 'Find Match' },
    ],
  },
  {
    title: 'Application',
    colors: [
      { key: 'appBackground', label: 'App Background' },
      { key: 'appForeground', label: 'App Foreground' },
      { key: 'headerBackground', label: 'Header Background' },
      { key: 'headerForeground', label: 'Header Foreground' },
    ],
  },
  {
    title: 'Sidebar',
    colors: [
      { key: 'sidebarBackground', label: 'Background' },
      { key: 'sidebarItemHover', label: 'Item Hover' },
    ],
  },
  {
    title: 'Workspace Panel',
    colors: [
      { key: 'workspacePanelHeaderBackground', label: 'Header Background' },
      { key: 'workspacePanelHeaderForeground', label: 'Header Text' },
      { key: 'workspacePanelBackground', label: 'Background' },
      { key: 'workspacePanelForeground', label: 'Foreground' },
    ],
  },
  {
    title: 'File Explorer Panel',
    colors: [
      { key: 'fileExplorerPanelHeaderBackground', label: 'Header Background' },
      { key: 'fileExplorerPanelHeaderForeground', label: 'Header Text' },
      { key: 'fileExplorerPanelBackground', label: 'Background' },
      { key: 'fileExplorerPanelForeground', label: 'Foreground' },
    ],
  },
  {
    title: 'Outline Panel',
    colors: [
      { key: 'outlinePanelHeaderBackground', label: 'Header Background' },
      { key: 'outlinePanelHeaderForeground', label: 'Header Text' },
      { key: 'outlinePanelBackground', label: 'Background' },
      { key: 'outlinePanelForeground', label: 'Foreground' },
    ],
  },
  {
    title: 'UCM Explorer Panel',
    colors: [
      { key: 'ucmExplorerPanelHeaderBackground', label: 'Header Background' },
      { key: 'ucmExplorerPanelHeaderForeground', label: 'Header Text' },
      { key: 'ucmExplorerPanelBackground', label: 'Background' },
      { key: 'ucmExplorerPanelForeground', label: 'Foreground' },
    ],
  },
  {
    title: 'Dividers',
    colors: [
      { key: 'divider', label: 'Divider' },
      { key: 'dividerHover', label: 'Divider Hover' },
      { key: 'dividerActive', label: 'Divider Active' },
      { key: 'border', label: 'Border' },
      { key: 'borderSubtle', label: 'Border Subtle' },
    ],
  },
  {
    title: 'Tabs',
    colors: [
      { key: 'tabBackground', label: 'Background' },
      { key: 'tabForeground', label: 'Foreground' },
      { key: 'tabActiveBackground', label: 'Active Background' },
      { key: 'tabActiveForeground', label: 'Active Foreground' },
      { key: 'tabBorder', label: 'Border' },
    ],
  },
  {
    title: 'Panels',
    colors: [
      { key: 'panelBackground', label: 'Background' },
      { key: 'panelForeground', label: 'Foreground' },
      { key: 'panelBorder', label: 'Border' },
      { key: 'panelHeaderBackground', label: 'Header Background' },
    ],
  },
  {
    title: 'Inputs & Buttons',
    colors: [
      { key: 'inputBackground', label: 'Input Background' },
      { key: 'inputForeground', label: 'Input Foreground' },
      { key: 'inputBorder', label: 'Input Border' },
      { key: 'inputFocusBorder', label: 'Input Focus Border' },
      { key: 'buttonBackground', label: 'Button Background' },
      { key: 'buttonForeground', label: 'Button Foreground' },
      { key: 'buttonHoverBackground', label: 'Button Hover' },
    ],
  },
  {
    title: 'Status',
    colors: [
      { key: 'statusSuccess', label: 'Success' },
      { key: 'statusWarning', label: 'Warning' },
      { key: 'statusError', label: 'Error' },
      { key: 'statusInfo', label: 'Info' },
    ],
  },
  {
    title: 'Other',
    colors: [
      { key: 'accent', label: 'Accent' },
      { key: 'focusRing', label: 'Focus Ring' },
      { key: 'scrollbarThumb', label: 'Scrollbar Thumb' },
      { key: 'modalBackground', label: 'Modal Background' },
      { key: 'overlayBackground', label: 'Overlay Background' },
    ],
  },
];

const terminalColorGroups: { title: string; colors: ColorDef[] }[] = [
  {
    title: 'Base Colors',
    colors: [
      { key: 'background', label: 'Background' },
      { key: 'foreground', label: 'Foreground' },
      { key: 'cursor', label: 'Cursor' },
      { key: 'cursorAccent', label: 'Cursor Accent' },
      { key: 'selectionBackground', label: 'Selection' },
    ],
  },
  {
    title: 'ANSI Colors',
    colors: [
      { key: 'black', label: 'Black' },
      { key: 'red', label: 'Red' },
      { key: 'green', label: 'Green' },
      { key: 'yellow', label: 'Yellow' },
      { key: 'blue', label: 'Blue' },
      { key: 'magenta', label: 'Magenta' },
      { key: 'cyan', label: 'Cyan' },
      { key: 'white', label: 'White' },
    ],
  },
  {
    title: 'Bright ANSI Colors',
    colors: [
      { key: 'brightBlack', label: 'Bright Black' },
      { key: 'brightRed', label: 'Bright Red' },
      { key: 'brightGreen', label: 'Bright Green' },
      { key: 'brightYellow', label: 'Bright Yellow' },
      { key: 'brightBlue', label: 'Bright Blue' },
      { key: 'brightMagenta', label: 'Bright Magenta' },
      { key: 'brightCyan', label: 'Bright Cyan' },
      { key: 'brightWhite', label: 'Bright White' },
    ],
  },
];

export function ThemeSettings({ onClose }: ThemeSettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('syntax');
  const [theme, setTheme] = useState<Theme>(() => {
    // Deep clone the active theme
    return JSON.parse(JSON.stringify(themeService.getActiveTheme()));
  });
  const [allThemes, setAllThemes] = useState<Theme[]>(() => themeService.getAllThemes());
  const [editingColor, setEditingColor] = useState<{
    category: 'syntax' | 'ui' | 'terminal';
    key: string;
    label: string;
  } | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  // Alert modal state (native alert() doesn't work in Tauri)
  const [alertMessage, setAlertMessage] = useState<{ title?: string; message: string } | null>(null);
  // Track if user explicitly applied/saved a theme (so we don't revert on close)
  // Use a ref to avoid closure issues in the cleanup effect
  const themeSavedRef = useRef(false);

  // Apply theme changes in real-time (preview)
  useEffect(() => {
    themeService.previewTheme(theme);
  }, [theme]);

  // Revert preview on unmount if theme wasn't saved
  useEffect(() => {
    return () => {
      // Only revert if user didn't explicitly save/apply a theme
      if (!themeSavedRef.current) {
        themeService.revertPreview();
      }
    };
  }, []);

  // Handle theme selection
  const handleThemeSelect = (themeId: string) => {
    const selectedTheme = themeService.getTheme(themeId);
    if (selectedTheme) {
      logger.info('editor', 'Theme selected', { themeId, themeName: selectedTheme.metadata.name }, 'ThemeSettings');
      setTheme(JSON.parse(JSON.stringify(selectedTheme)));
      setHasChanges(false);
    } else {
      logger.warn('editor', 'Theme selection failed - theme not found', { themeId }, 'ThemeSettings');
    }
  };

  // Handle color change
  const handleColorChange = useCallback(
    (category: 'syntax' | 'ui' | 'terminal', key: string, value: string) => {
      setTheme(prev => {
        const newTheme = { ...prev };
        if (category === 'syntax') {
          newTheme.syntax = { ...prev.syntax, [key]: value };
        } else if (category === 'ui') {
          newTheme.ui = { ...prev.ui, [key]: value };
        } else {
          newTheme.terminal = { ...prev.terminal, [key]: value };
        }
        return newTheme;
      });
      setHasChanges(true);
    },
    []
  );

  // Handle font change
  const handleFontChange = useCallback(
    (key: keyof FontSettings, value: string | number) => {
      setTheme(prev => ({
        ...prev,
        fonts: { ...prev.fonts, [key]: value },
      }));
      setHasChanges(true);
    },
    []
  );

  // Save as new theme
  const handleSaveAs = () => {
    if (!saveName.trim()) return;

    logger.info('editor', 'Saving theme as new', { newName: saveName.trim(), basedOn: theme.metadata.name }, 'ThemeSettings');

    // Update internal theme data with our edits before saving
    themeService.setActiveThemeData(theme);

    const newTheme = themeService.saveThemeAs(saveName.trim());
    logger.info('editor', 'Theme saved successfully', { themeId: newTheme.metadata.id, themeName: newTheme.metadata.name }, 'ThemeSettings');
    setTheme(JSON.parse(JSON.stringify(newTheme)));
    setAllThemes(themeService.getAllThemes());
    setShowSaveDialog(false);
    setHasChanges(false);
    themeSavedRef.current = true; // Mark that theme was saved so we don't revert on close
  };

  // Export theme
  const handleExport = () => {
    const fileName = `${theme.metadata.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    logger.info('editor', 'Exporting theme', { themeName: theme.metadata.name, fileName }, 'ThemeSettings');

    // Update internal theme data with our edits before exporting
    themeService.setActiveThemeData(theme);

    const json = themeService.exportActiveTheme();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    logger.info('editor', 'Theme exported successfully', { themeName: theme.metadata.name, fileName }, 'ThemeSettings');
  };

  // Import theme
  const handleImport = () => {
    logger.info('editor', 'Opening file picker for theme import', undefined, 'ThemeSettings');

    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('accept', '.json');

    const handleFileSelect = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) {
        logger.debug('editor', 'File picker cancelled - no file selected', undefined, 'ThemeSettings');
        return;
      }

      logger.info('editor', 'File selected for import', { fileName: file.name, fileSize: file.size, fileType: file.type }, 'ThemeSettings');

      // Check file extension
      if (!file.name.toLowerCase().endsWith('.json')) {
        logger.error('editor', 'Theme import failed - invalid file type', undefined, { fileName: file.name, fileType: file.type }, 'ThemeSettings');
        setAlertMessage({
          title: 'Invalid File Type',
          message: `"${file.name}" is not a JSON file. Please select a valid theme file (.json).`,
        });
        return;
      }

      let text: string;
      try {
        text = await file.text();
        logger.debug('editor', 'File content read successfully', { contentLength: text.length }, 'ThemeSettings');
      } catch (readError) {
        logger.error('editor', 'Theme import failed - file read error', readError, { fileName: file.name }, 'ThemeSettings');
        setAlertMessage({
          title: 'File Read Error',
          message: `Failed to read "${file.name}": ${readError instanceof Error ? readError.message : 'Unknown error'}`,
        });
        return;
      }

      // Validate the JSON structure
      const validation = themeService.validateThemeJson(text);
      logger.info('editor', 'Theme validation result', { valid: validation.valid, errors: validation.errors, warnings: validation.warnings }, 'ThemeSettings');

      if (!validation.valid) {
        let errorMessage = 'The file is not a valid theme:\n\n';
        validation.errors.forEach(err => {
          errorMessage += `• ${err}\n`;
        });

        if (validation.warnings.length > 0) {
          errorMessage += '\nWarnings:\n';
          validation.warnings.forEach(warn => {
            errorMessage += `• ${warn}\n`;
          });
        }

        logger.error('editor', 'Theme import failed - validation errors', undefined, { errors: validation.errors, warnings: validation.warnings }, 'ThemeSettings');
        setAlertMessage({
          title: 'Invalid Theme File',
          message: errorMessage,
        });
        return;
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        logger.warn('editor', 'Theme import has warnings', { warnings: validation.warnings }, 'ThemeSettings');
      }

      // Import the theme
      try {
        const imported = themeService.importTheme(text);
        if (imported) {
          logger.info('editor', 'Theme imported successfully', { themeName: imported.metadata.name, themeId: imported.metadata.id }, 'ThemeSettings');
          setAllThemes(themeService.getAllThemes());
          setTheme(JSON.parse(JSON.stringify(imported)));
          themeService.switchTheme(imported.metadata.id);
          themeSavedRef.current = true;
        } else {
          logger.error('editor', 'Theme import returned null', undefined, { fileName: file.name }, 'ThemeSettings');
          setAlertMessage({
            title: 'Import Failed',
            message: 'Failed to import theme. An unexpected error occurred.',
          });
        }
      } catch (importError) {
        logger.error('editor', 'Theme import threw exception', importError, { fileName: file.name }, 'ThemeSettings');
        setAlertMessage({
          title: 'Import Failed',
          message: `Failed to import theme: ${importError instanceof Error ? importError.message : 'Unknown error'}`,
        });
      }
    };

    input.addEventListener('change', handleFileSelect);
    input.click();
  };

  // Delete theme (for user themes only)
  const handleDelete = () => {
    if (theme.metadata.isBuiltin) {
      logger.warn('editor', 'Cannot delete builtin theme', { themeName: theme.metadata.name }, 'ThemeSettings');
      return;
    }

    if (confirm(`Delete theme "${theme.metadata.name}"?`)) {
      logger.info('editor', 'Deleting theme', { themeId: theme.metadata.id, themeName: theme.metadata.name }, 'ThemeSettings');
      themeService.deleteTheme(theme.metadata.id);
      const defaultTheme = themeService.getActiveTheme();
      logger.info('editor', 'Theme deleted, switched to default', { newThemeName: defaultTheme.metadata.name }, 'ThemeSettings');
      setTheme(JSON.parse(JSON.stringify(defaultTheme)));
      setAllThemes(themeService.getAllThemes());
      setHasChanges(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    const original = themeService.getTheme(theme.metadata.id);
    if (original) {
      setTheme(JSON.parse(JSON.stringify(original)));
      setHasChanges(false);
    }
  };

  // Apply and close
  const handleApply = () => {
    if (hasChanges) {
      logger.info('editor', 'Applying theme changes', { themeName: theme.metadata.name, isBuiltin: theme.metadata.isBuiltin }, 'ThemeSettings');

      // First, update the internal theme data with our edits
      themeService.setActiveThemeData(theme);

      if (theme.metadata.isBuiltin) {
        // For builtin themes, save as new custom theme
        const newThemeName = theme.metadata.name + ' (Custom)';
        const newTheme = themeService.saveThemeAs(newThemeName, 'User');
        logger.info('editor', 'Created custom theme from builtin', { originalName: theme.metadata.name, newThemeName: newTheme.metadata.name, themeId: newTheme.metadata.id }, 'ThemeSettings');
        themeService.switchTheme(newTheme.metadata.id);
      } else {
        // For custom themes, save the current active theme (which we just set above)
        // Don't call switchTheme as it would overwrite our changes with the old version
        themeService.saveCurrentTheme();
        logger.info('editor', 'Saved custom theme changes', { themeName: theme.metadata.name, themeId: theme.metadata.id }, 'ThemeSettings');
        // Ensure the active theme ID is persisted
        localStorage.setItem('unison-active-theme-id', theme.metadata.id);
      }
    } else {
      logger.info('editor', 'Switching theme (no changes)', { themeName: theme.metadata.name, themeId: theme.metadata.id }, 'ThemeSettings');
      themeService.switchTheme(theme.metadata.id);
    }
    themeSavedRef.current = true; // Mark that theme was applied so we don't revert on close
    onClose();
  };

  // Render color item
  const renderColorItem = (
    category: 'syntax' | 'ui' | 'terminal',
    key: string,
    label: string,
    colors: SyntaxColors | UIColors | TerminalColors
  ) => {
    const color = (colors as unknown as Record<string, string>)[key];
    return (
      <div key={key} className="color-item">
        <div
          className="color-swatch"
          style={{ backgroundColor: color }}
          onClick={() => setEditingColor({ category, key, label })}
        />
        <div className="color-info">
          <div className="color-label">{label}</div>
          <div className="color-value">{color}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="theme-settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-settings-modal">
        {/* Header */}
        <div className="theme-settings-header">
          <h2>Appearance</h2>
          <div className="theme-settings-header-actions">
            <select
              className="theme-selector"
              value={theme.metadata.id}
              onChange={(e) => handleThemeSelect(e.target.value)}
            >
              <optgroup label="Built-in">
                {allThemes
                  .filter(t => t.metadata.isBuiltin)
                  .map(t => (
                    <option key={t.metadata.id} value={t.metadata.id}>
                      {t.metadata.name}
                    </option>
                  ))}
              </optgroup>
              {allThemes.some(t => !t.metadata.isBuiltin) && (
                <optgroup label="Custom">
                  {allThemes
                    .filter(t => !t.metadata.isBuiltin)
                    .map(t => (
                      <option key={t.metadata.id} value={t.metadata.id}>
                        {t.metadata.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            <button className="theme-action-btn" onClick={handleImport}>
              Import
            </button>
            <button className="theme-action-btn" onClick={handleExport}>
              Export
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="theme-settings-tabs">
          <button
            className={`theme-tab ${activeTab === 'syntax' ? 'active' : ''}`}
            onClick={() => setActiveTab('syntax')}
          >
            Syntax
          </button>
          <button
            className={`theme-tab ${activeTab === 'interface' ? 'active' : ''}`}
            onClick={() => setActiveTab('interface')}
          >
            Interface
          </button>
          <button
            className={`theme-tab ${activeTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveTab('terminal')}
          >
            Terminal
          </button>
          <button
            className={`theme-tab ${activeTab === 'fonts' ? 'active' : ''}`}
            onClick={() => setActiveTab('fonts')}
          >
            Fonts
          </button>
        </div>

        {/* Content */}
        <div className="theme-settings-content">
          {/* Syntax Tab */}
          {activeTab === 'syntax' && (
            <>
              {syntaxColorGroups.map(group => (
                <div key={group.title} className="color-group">
                  <h3 className="color-group-title">{group.title}</h3>
                  <div className="color-grid">
                    {group.colors.map(({ key, label }) =>
                      renderColorItem('syntax', key, label, theme.syntax)
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Interface Tab */}
          {activeTab === 'interface' && (
            <>
              {uiColorGroups.map(group => (
                <div key={group.title} className="color-group">
                  <h3 className="color-group-title">{group.title}</h3>
                  <div className="color-grid">
                    {group.colors.map(({ key, label }) =>
                      renderColorItem('ui', key, label, theme.ui)
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Terminal Tab */}
          {activeTab === 'terminal' && (
            <>
              {terminalColorGroups.map(group => (
                <div key={group.title} className="color-group">
                  <h3 className="color-group-title">{group.title}</h3>
                  <div className="color-grid">
                    {group.colors.map(({ key, label }) =>
                      renderColorItem('terminal', key, label, theme.terminal)
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Fonts Tab */}
          {activeTab === 'fonts' && (
            <div className="font-settings">
              <div className="color-group">
                <h3 className="color-group-title">Editor Fonts</h3>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Family</label>
                  <input
                    type="text"
                    className="font-setting-input"
                    value={theme.fonts.editorFontFamily}
                    onChange={(e) => handleFontChange('editorFontFamily', e.target.value)}
                  />
                </div>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Size</label>
                  <input
                    type="number"
                    className="font-setting-input font-setting-number"
                    value={theme.fonts.editorFontSize}
                    onChange={(e) => handleFontChange('editorFontSize', parseInt(e.target.value) || 14)}
                    min={8}
                    max={32}
                  />
                </div>
                <div className="font-setting-row">
                  <label className="font-setting-label">Line Height</label>
                  <input
                    type="number"
                    className="font-setting-input font-setting-number"
                    value={theme.fonts.editorLineHeight}
                    onChange={(e) => handleFontChange('editorLineHeight', parseFloat(e.target.value) || 1.5)}
                    min={1}
                    max={3}
                    step={0.1}
                  />
                </div>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Weight</label>
                  <input
                    type="number"
                    className="font-setting-input font-setting-number"
                    value={theme.fonts.editorFontWeight}
                    onChange={(e) => handleFontChange('editorFontWeight', parseInt(e.target.value) || 400)}
                    min={100}
                    max={900}
                    step={100}
                  />
                </div>
              </div>

              <div className="color-group">
                <h3 className="color-group-title">Terminal Fonts</h3>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Family</label>
                  <input
                    type="text"
                    className="font-setting-input"
                    value={theme.fonts.terminalFontFamily}
                    onChange={(e) => handleFontChange('terminalFontFamily', e.target.value)}
                  />
                </div>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Size</label>
                  <input
                    type="number"
                    className="font-setting-input font-setting-number"
                    value={theme.fonts.terminalFontSize}
                    onChange={(e) => handleFontChange('terminalFontSize', parseInt(e.target.value) || 13)}
                    min={8}
                    max={32}
                  />
                </div>
                <div className="font-setting-row">
                  <label className="font-setting-label">Line Height</label>
                  <input
                    type="number"
                    className="font-setting-input font-setting-number"
                    value={theme.fonts.terminalLineHeight}
                    onChange={(e) => handleFontChange('terminalLineHeight', parseFloat(e.target.value) || 1.2)}
                    min={1}
                    max={3}
                    step={0.1}
                  />
                </div>
              </div>

              <div className="color-group">
                <h3 className="color-group-title">UI Fonts</h3>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Family</label>
                  <input
                    type="text"
                    className="font-setting-input"
                    value={theme.fonts.uiFontFamily}
                    onChange={(e) => handleFontChange('uiFontFamily', e.target.value)}
                  />
                </div>
                <div className="font-setting-row">
                  <label className="font-setting-label">Font Size</label>
                  <input
                    type="number"
                    className="font-setting-input font-setting-number"
                    value={theme.fonts.uiFontSize}
                    onChange={(e) => handleFontChange('uiFontSize', parseInt(e.target.value) || 13)}
                    min={10}
                    max={24}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="theme-settings-footer">
          <div className="theme-settings-footer-left">
            <button className="btn-secondary" onClick={handleReset} disabled={!hasChanges}>
              Reset
            </button>
            {!theme.metadata.isBuiltin && (
              <button className="btn-secondary btn-danger" onClick={handleDelete}>
                Delete Theme
              </button>
            )}
          </div>
          <div className="theme-settings-footer-right">
            {hasChanges && (
              <span className="theme-badge modified">Unsaved changes</span>
            )}
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleApply}>
              {hasChanges ? 'Apply & Save' : 'Done'}
            </button>
          </div>
        </div>

        {/* Color Picker */}
        {editingColor && (
          <ColorPicker
            color={
              editingColor.category === 'syntax'
                ? (theme.syntax as unknown as Record<string, string>)[editingColor.key]
                : editingColor.category === 'ui'
                ? (theme.ui as unknown as Record<string, string>)[editingColor.key]
                : (theme.terminal as unknown as Record<string, string>)[editingColor.key]
            }
            onChange={(color) =>
              handleColorChange(editingColor.category, editingColor.key, color)
            }
            onClose={() => setEditingColor(null)}
            label={editingColor.label}
          />
        )}

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="theme-settings-overlay">
            <div className="theme-settings-modal" style={{ width: '400px' }}>
              <div className="save-theme-dialog">
                <h3>Save Theme As</h3>
                <label>
                  Theme Name
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveAs();
                      if (e.key === 'Escape') setShowSaveDialog(false);
                    }}
                  />
                </label>
                <div className="save-theme-dialog-actions">
                  <button className="btn-secondary" onClick={() => setShowSaveDialog(false)}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={handleSaveAs}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alert Modal for errors/notifications */}
        <AlertModal
          isOpen={alertMessage !== null}
          onClose={() => setAlertMessage(null)}
          title={alertMessage?.title}
          message={alertMessage?.message || ''}
        />
      </div>
    </div>
  );
}
