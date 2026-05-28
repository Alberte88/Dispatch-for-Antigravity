import path from 'path';
import fs from 'fs';

/**
 * Validates that a target path is contained within the given workspace root.
 * Resolves symlinks (when the path exists) to prevent escapes via symlink traversal.
 *
 * @param {string} targetPath   - The path to validate.
 * @param {string} workspaceRoot - The root directory that targetPath must be inside.
 * @returns {true} Returns true when the path is valid.
 * @throws {Error} Throws 'Path escapes workspace boundary' if the path is outside workspaceRoot.
 */
export function validateWorkspacePath(targetPath, workspaceRoot) {
  const resolvedRoot = path.resolve(workspaceRoot);
  let resolvedTarget = path.resolve(targetPath);

  // Resolve symlinks if the path already exists on disk,
  // preventing escapes via symlinks that point outside the workspace.
  if (fs.existsSync(resolvedTarget)) {
    resolvedTarget = fs.realpathSync(resolvedTarget);
  }

  // Ensure resolvedRoot itself ends with the separator so that a path like
  // /workspace-foo doesn't falsely match /workspace when root is /workspace.
  const rootWithSep = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new Error('Path escapes workspace boundary');
  }

  return true;
}
