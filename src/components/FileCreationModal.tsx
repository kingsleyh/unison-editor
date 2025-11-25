import { useState } from 'react';

interface FileCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (filename: string, template: string) => void;
  defaultPath?: string;
}

const FILE_TEMPLATES = {
  scratch: `-- Scratch file
-- Use this for experimenting with Unison code

`,
  module: `-- Module file

`,
  test: `-- Test file

test> myTests = check let
  use Nat == +

  expect (1 + 1 == 2)
`,
};

export function FileCreationModal({
  isOpen,
  onClose,
  onCreate,
  defaultPath = '',
}: FileCreationModalProps) {
  const [filename, setFilename] = useState('');
  const [template, setTemplate] = useState<keyof typeof FILE_TEMPLATES>('scratch');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate filename
    if (!filename.trim()) {
      setError('Filename cannot be empty');
      return;
    }

    // Ensure .u extension
    let finalFilename = filename.trim();
    if (!finalFilename.endsWith('.u')) {
      finalFilename += '.u';
    }

    // Check for invalid characters
    if (finalFilename.includes('/') || finalFilename.includes('\\')) {
      setError('Filename cannot contain / or \\');
      return;
    }

    onCreate(finalFilename, FILE_TEMPLATES[template]);
    handleClose();
  }

  function handleClose() {
    setFilename('');
    setTemplate('scratch');
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New File</h2>
          <button className="modal-close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {defaultPath && (
              <div className="modal-info">
                Location: {defaultPath}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="filename">Filename</label>
              <input
                type="text"
                id="filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="myfile.u"
                autoFocus
              />
              <div className="form-hint">
                .u extension will be added automatically if not provided
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="template">Template</label>
              <select
                id="template"
                value={template}
                onChange={(e) => setTemplate(e.target.value as keyof typeof FILE_TEMPLATES)}
              >
                <option value="scratch">Scratch File (blank with comment)</option>
                <option value="module">Module File (empty)</option>
                <option value="test">Test File (with test template)</option>
              </select>
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create File
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
