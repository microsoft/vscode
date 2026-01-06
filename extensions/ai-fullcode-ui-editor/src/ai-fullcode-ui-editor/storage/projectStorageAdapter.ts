/**
 * Project Storage Adapter
 *
 * Phase 2: ストレージ層
 * VSCode FS API ↔ projectStorage.ts ブリッジ
 */

import * as path from 'path';
import * as fs from 'fs/promises';

// 既存のprojectStorage.tsを動的にインポート
let projectStorageModule: any = null;

/**
 * projectStorageモジュールを取得（遅延読み込み）
 */
async function getProjectStorageModule(): Promise<any> {
  if (!projectStorageModule) {
    try {
      // 拡張機能内のprojectStorageLocalモジュールをインポート
      // これにより、TypeScriptファイルの直接インポート問題を回避
      projectStorageModule = await import('./projectStorageLocal');
    } catch (error) {
      console.error('[Project Storage Adapter] モジュール読み込み失敗:', error);
      // フォールバック: エラーをログに記録するが、処理は続行
    }
  }
  return projectStorageModule;
}

/**
 * プロジェクトファイルを読み込む
 *
 * VSCode FS API経由でprojectStorage.tsを呼び出します。
 *
 * @param projectId プロジェクトID
 * @param filePath ファイルパス（例: '/test.tsx'）
 * @returns ファイル内容、存在しない場合は null
 */
export async function loadFile(
  projectId: string,
  filePath: string
): Promise<string | null> {
  try {
    const module = await getProjectStorageModule();
    if (!module) {
      return null;
    }

    const content = await module.loadProjectFile(projectId, filePath);
    return content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Project Storage Adapter] ファイル読み込みエラー:', errorMessage);
    return null;
  }
}

/**
 * プロジェクトファイルを保存する
 *
 * VSCode FS API経由でprojectStorage.tsを呼び出します。
 *
 * @param projectId プロジェクトID
 * @param filePath ファイルパス（例: '/test.tsx'）
 * @param content ファイル内容
 */
export async function saveFile(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  try {
    const module = await getProjectStorageModule();
    if (!module) {
      return;
    }

    await module.saveProjectFile(projectId, filePath, content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Project Storage Adapter] ファイル保存エラー:', errorMessage);
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
export async function checkFileExists(
  projectId: string,
  filePath: string
): Promise<boolean> {
  try {
    const module = await getProjectStorageModule();
    if (!module) {
      return false;
    }

    const exists = await module.fileExists(projectId, filePath);
    return exists;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Project Storage Adapter] ファイル存在確認エラー:', errorMessage);
    return false;
  }
}

/**
 * プロジェクト内のすべてのファイルを一覧取得
 *
 * @param projectId プロジェクトID
 * @returns ファイルパスの配列（例: ['/app/page.tsx', '/components/Header.tsx']）
 */
export async function listFiles(
  projectId: string
): Promise<string[]> {
  try {
    const module = await getProjectStorageModule();
    if (!module) {
      return [];
    }

    const files = await module.listProjectFiles(projectId);
    return files;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Project Storage Adapter] ファイル一覧取得エラー:', errorMessage);
    return [];
  }
}

