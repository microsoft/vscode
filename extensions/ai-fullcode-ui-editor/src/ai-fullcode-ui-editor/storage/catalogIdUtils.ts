/**
 * Catalog ID Utilities
 *
 * Single source of truth: ID generation logic is unified
 * - CatalogScanner
 * - DesignEntryBuilder
 * - Preview Runtime
 * All use the same ID generation logic
 */

import * as path from 'path';

/**
 * Generate catalog ID from file path (unified logic)
 *
 * Rules:
 * - Pages: Next.js App Router format (app/.../page.tsx) -> parent directory name
 * - Pages: Next.js Pages Router format (pages/...) -> file name or parent directory name
 * - Components: file name based (kebab-case)
 *
 * @param filePath Workspace relative path (e.g. /app/admin/page.tsx)
 * @param kind Type (page or component)
 * @returns Catalog ID (e.g. "admin", "button-card")
 */
export function generateCatalogId(filePath: string, kind: 'page' | 'component'): string {
  // ファイル名を取得
  let fileName = path.basename(filePath, path.extname(filePath));

  // .page.tsx の場合は .page を削除（互換性のため）
  if (fileName.endsWith('.page')) {
    fileName = fileName.replace(/\.page$/, '');
  }

  // Pages: page.tsx の場合は親ディレクトリ名を使用（Next.js App Router形式）
  if (kind === 'page' && fileName === 'page') {
    const dirPath = path.dirname(filePath);
    const dirName = path.basename(dirPath);

    // pages, app, screens は除外
    if (dirName && dirName !== 'pages' && dirName !== 'app' && dirName !== 'screens') {
      fileName = dirName;
    } else {
      // さらに親ディレクトリを確認（例: /app/admin/page.tsx → admin）
      const parentDir = path.dirname(dirPath);
      const parentDirName = path.basename(parentDir);
      if (parentDirName && parentDirName !== 'pages' && parentDirName !== 'app' && parentDirName !== 'screens') {
        fileName = parentDirName;
      }
    }
  }

  // kebab-caseに変換
  const id = fileName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

  return id;
}

/**
 * Generate display name from file path
 *
 * @param filePath Workspace relative path
 * @param kind Type (page or component)
 * @returns Display name (e.g. "Admin Layout", "Button Card")
 */
export function generateDisplayName(filePath: string, kind: 'page' | 'component'): string {
  // ファイル名を取得
  let fileName = path.basename(filePath, path.extname(filePath));

  // .page.tsx の場合は .page を削除
  if (fileName.endsWith('.page')) {
    fileName = fileName.replace(/\.page$/, '');
  }

  // Pages: page.tsx の場合は親ディレクトリ名を使用
  if (kind === 'page' && fileName === 'page') {
    const dirPath = path.dirname(filePath);
    const dirName = path.basename(dirPath);

    if (dirName && dirName !== 'pages' && dirName !== 'app' && dirName !== 'screens') {
      fileName = dirName;
    } else {
      const parentDir = path.dirname(dirPath);
      const parentDirName = path.basename(parentDir);
      if (parentDirName && parentDirName !== 'pages' && parentDirName !== 'app' && parentDirName !== 'screens') {
        fileName = parentDirName;
      }
    }
  }

  // 表示名に変換（PascalCase → Space Separated）
  const name = fileName
    .replace(/([A-Z])/g, ' $1')
    .trim();

  return name;
}

