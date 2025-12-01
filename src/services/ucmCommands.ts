/**
 * UCM Commands Service
 *
 * Provides high-level functions for executing UCM commands via PTY.
 * These commands modify the Unison codebase (move, rename, delete).
 * Commands are sent to the UCM terminal so users can see output.
 */

import { getUCMLifecycleService } from './ucmLifecycle';
import { emit } from '@tauri-apps/api/event';
import { logger } from './loggingService';

/**
 * Emit an event to show/focus the UCM terminal panel
 */
export async function showTerminal(): Promise<void> {
  await emit('show-ucm-terminal');
}

/**
 * Write a command to UCM PTY
 */
async function writeCommand(command: string): Promise<void> {
  const ucm = getUCMLifecycleService();

  if (!ucm.isRunning()) {
    throw new Error('UCM is not running');
  }

  // Ensure command ends with newline
  const cmd = command.endsWith('\n') ? command : command + '\n';
  await ucm.write(cmd);
}

/**
 * Move a term to a new FQN (also used for renaming)
 *
 * @param oldFQN - Current fully qualified name
 * @param newFQN - New fully qualified name
 */
export async function moveTerm(oldFQN: string, newFQN: string): Promise<void> {
  logger.info('ucm', 'Moving term', { oldFQN, newFQN });
  await showTerminal();
  await writeCommand(`move.term ${oldFQN} ${newFQN}`);
}

/**
 * Move a type to a new FQN (also used for renaming)
 *
 * @param oldFQN - Current fully qualified name
 * @param newFQN - New fully qualified name
 */
export async function moveType(oldFQN: string, newFQN: string): Promise<void> {
  logger.info('ucm', 'Moving type', { oldFQN, newFQN });
  await showTerminal();
  await writeCommand(`move.type ${oldFQN} ${newFQN}`);
}

/**
 * Move a namespace to a new path (also used for renaming)
 *
 * @param oldPath - Current namespace path
 * @param newPath - New namespace path
 */
export async function moveNamespace(oldPath: string, newPath: string): Promise<void> {
  logger.info('ucm', 'Moving namespace', { oldPath, newPath });
  await showTerminal();
  await writeCommand(`move.namespace ${oldPath} ${newPath}`);
}

/**
 * Delete a term
 *
 * @param fqn - Fully qualified name of the term to delete
 */
export async function deleteTerm(fqn: string): Promise<void> {
  logger.info('ucm', 'Deleting term', { fqn });
  await showTerminal();
  // Use delete.term.force to skip confirmation prompts
  await writeCommand(`delete.term.force ${fqn}`);
}

/**
 * Delete a type
 *
 * @param fqn - Fully qualified name of the type to delete
 */
export async function deleteType(fqn: string): Promise<void> {
  logger.info('ucm', 'Deleting type', { fqn });
  await showTerminal();
  // Use delete.type.force to skip confirmation prompts
  await writeCommand(`delete.type.force ${fqn}`);
}

/**
 * Delete a namespace and all its contents
 *
 * @param path - Namespace path to delete
 */
export async function deleteNamespace(path: string): Promise<void> {
  logger.info('ucm', 'Deleting namespace', { path });
  await showTerminal();
  // Use delete.namespace.force to skip confirmation prompts
  await writeCommand(`delete.namespace.force ${path}`);
}

/**
 * Delete an item based on its type
 *
 * @param fullPath - Fully qualified name/path
 * @param type - Type of item ('term', 'type', or 'namespace')
 */
export async function deleteItem(
  fullPath: string,
  type: 'term' | 'type' | 'namespace'
): Promise<void> {
  switch (type) {
    case 'term':
      await deleteTerm(fullPath);
      break;
    case 'type':
      await deleteType(fullPath);
      break;
    case 'namespace':
      await deleteNamespace(fullPath);
      break;
  }
}

/**
 * Move/rename an item based on its type
 *
 * @param oldPath - Current fully qualified name/path
 * @param newPath - New fully qualified name/path
 * @param type - Type of item ('term', 'type', or 'namespace')
 */
export async function moveItem(
  oldPath: string,
  newPath: string,
  type: 'term' | 'type' | 'namespace'
): Promise<void> {
  switch (type) {
    case 'term':
      await moveTerm(oldPath, newPath);
      break;
    case 'type':
      await moveType(oldPath, newPath);
      break;
    case 'namespace':
      await moveNamespace(oldPath, newPath);
      break;
  }
}
