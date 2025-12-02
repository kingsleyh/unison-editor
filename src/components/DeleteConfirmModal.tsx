interface DeleteItem {
  name: string;
  isDirectory: boolean;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Single item (legacy) */
  itemName?: string;
  /** Single item type (legacy) */
  itemType?: 'file' | 'directory';
  /** Multiple items to delete */
  items?: DeleteItem[];
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType,
  items,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  function handleConfirm() {
    onConfirm();
    onClose();
  }

  // Support both single item (legacy) and multiple items
  const deleteItems: DeleteItem[] = items || (itemName ? [{ name: itemName, isDirectory: itemType === 'directory' }] : []);
  const count = deleteItems.length;
  const hasDirectories = deleteItems.some(item => item.isDirectory);

  if (count === 0) return null;

  const isSingleItem = count === 1;
  const singleItem = isSingleItem ? deleteItems[0] : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {isSingleItem
              ? `Delete ${singleItem!.isDirectory ? 'Folder' : 'File'}?`
              : `Delete ${count} Items?`}
          </h2>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {isSingleItem ? (
            <p>
              Are you sure you want to delete <strong>{singleItem!.name}</strong>?
            </p>
          ) : (
            <>
              <p>Are you sure you want to delete these {count} items?</p>
              <ul className="delete-items-list">
                {deleteItems.slice(0, 10).map((item, i) => (
                  <li key={i}>
                    {item.isDirectory ? '📁' : '📄'} {item.name}
                  </li>
                ))}
                {count > 10 && <li>...and {count - 10} more</li>}
              </ul>
            </>
          )}
          {hasDirectories && (
            <p className="warning-text">
              {isSingleItem
                ? 'This will delete the folder and all its contents.'
                : 'Folders will be deleted with all their contents.'}
            </p>
          )}
          <p className="warning-text">
            This action cannot be undone.
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={handleConfirm}>
            Delete{count > 1 ? ` (${count})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
