/**
 * プロジェクトファイルの永続ストレージ層（拡張機能内実装版）
 *
 * 元のapps/web/lib/storage/projectStorage.tsを拡張機能内にコピー
 * 依存関係を調整してVSCode拡張機能環境で動作するように修正
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * プロジェクトファイルを読み込む
 *
 * @param projectId プロジェクトID
 * @param filePath ファイルパス（例: '/test.tsx'）
 * @returns ファイル内容、存在しない場合は null
 */
export async function loadProjectFile(
  projectId: string,
  filePath: string
): Promise<string | null> {
  try {
    // VSCode拡張機能の実行環境では、__dirnameはコンパイル後のout/ai-fullcode-ui-editor/storage/を指す
    // 例: /Users/.../vscode-oss-fork-source/extensions/ai-fullcode-ui-editor/out/ai-fullcode-ui-editor/storage/
    // ../../../../.. で vscode-oss-fork-source/ に戻る
    // プロジェクトファイルは vscode-oss-fork-source/data/projects/{projectId}/files/ に保存
    const workspaceRoot = join(__dirname, '../../../../..'); // vscode-oss-fork-source/
    const projectDir = join(workspaceRoot, 'data', 'projects');
    const projectPath = join(projectDir, projectId, 'files');
    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const persistentFilePath = join(projectPath, normalizedPath);

    const content = await readFile(persistentFilePath, 'utf-8');
    return content;
  } catch (error) {
    // ファイルが存在しない場合は null を返す（エラーではない）
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // その他のエラーはログに記録
    console.error('[ProjectStorageLocal] ファイル読み込みエラー:', error);
    return null;
  }
}

/**
 * プロジェクトファイルを保存する
 *
 * @param projectId プロジェクトID
 * @param filePath ファイルパス（例: '/test.tsx'）
 * @param content ファイル内容
 */
export async function saveProjectFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  try {
    const workspaceRoot = join(__dirname, '../../../../..'); // vscode-oss-fork-source/
    const projectDir = join(workspaceRoot, 'data', 'projects');
    const projectPath = join(projectDir, projectId, 'files');
    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const persistentFilePath = join(projectPath, normalizedPath);

    // ディレクトリが存在しない場合は作成
    await mkdir(dirname(persistentFilePath), { recursive: true });

    await writeFile(persistentFilePath, content, 'utf-8');
  } catch (error) {
    console.error('[ProjectStorageLocal] ファイル保存エラー:', error);
    throw error;
  }
}

/**
 * ファイルが存在するかどうかを確認
 *
 * @param projectId プロジェクトID
 * @param filePath ファイルパス
 * @returns ファイルが存在する場合は true
 */
export async function fileExists(
  projectId: string,
  filePath: string
): Promise<boolean> {
  try {
    const content = await loadProjectFile(projectId, filePath);
    return content !== null;
  } catch {
    return false;
  }
}

/**
 * プロジェクト内のすべてのファイルを一覧取得
 *
 * @param projectId プロジェクトID
 * @returns ファイルパスの配列（例: ['/app/page.tsx', '/components/Header.tsx']）
 */
export async function listProjectFiles(projectId: string): Promise<string[]> {
  try {
    const workspaceRoot = join(__dirname, '../../../../..'); // vscode-oss-fork-source/
    const projectDir = join(workspaceRoot, 'data', 'projects');
    const projectPath = join(projectDir, projectId, 'files');

    const files: string[] = [];

    // 再帰的にファイルを探索
    async function exploreDirectory(dirPath: string, basePath: string = ''): Promise<void> {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            // ディレクトリの場合は再帰的に探索
            await exploreDirectory(fullPath, relativePath);
          } else if (entry.isFile()) {
            // ファイルの場合はパスを追加（先頭に / を付ける）
            files.push(`/${relativePath}`);
          }
        }
      } catch (error) {
        // ディレクトリが存在しない場合は空配列を返す
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return;
        }
        console.error('[ProjectStorageLocal] ディレクトリ探索エラー:', error);
      }
    }

    await exploreDirectory(projectPath);

    return files;
  } catch (error) {
    console.error('[ProjectStorageLocal] ファイル一覧取得エラー:', error);
    return [];
  }
}

