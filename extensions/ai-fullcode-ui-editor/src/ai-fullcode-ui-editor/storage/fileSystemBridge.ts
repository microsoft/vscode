/**
 * File System Bridge
 *
 * Phase 2: ストレージ層
 * VSCode FS API ↔ projectStorage.ts ブリッジ
 */

import * as vscode from 'vscode';
import { loadFile, saveFile, checkFileExists, listFiles } from './projectStorageAdapter';

/**
 * VSCode FS API用のFileSystemProviderを実装
 *
 * projectStorage.tsをVSCode FS APIとして提供します。
 */
export class ProjectFileSystemProvider implements vscode.FileSystemProvider {
  private projectId: string;
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * ファイルを読み込む
   *
   * @param uri ファイルURI
   * @returns ファイル内容
   */
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const filePath = this.uriToFilePath(uri);
    const content = await loadFile(this.projectId, filePath);
    if (content === null) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return new TextEncoder().encode(content);
  }

  /**
   * ファイルを書き込む
   *
   * @param uri ファイルURI
   * @param content ファイル内容
   * @param options 書き込みオプション
   */
  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    const filePath = this.uriToFilePath(uri);
    const textContent = new TextDecoder().decode(content);

    await saveFile(this.projectId, filePath, textContent);

    // ファイル変更イベントを発火
    this._onDidChangeFile.fire([{
      type: vscode.FileChangeType.Changed,
      uri: uri
    }]);
  }

  /**
   * ファイルの存在を確認
   *
   * @param uri ファイルURI
   * @returns ファイル情報
   */
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const filePath = this.uriToFilePath(uri);
    const exists = await checkFileExists(this.projectId, filePath);

    if (!exists) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    // ファイル内容を取得してサイズを計算
    const content = await loadFile(this.projectId, filePath);
    const size = content ? content.length : 0;

    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: size,
    };
  }

  /**
   * ディレクトリの内容を一覧取得
   *
   * @param uri ディレクトリURI
   * @returns ファイル/ディレクトリの一覧
   */
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const dirPath = this.uriToFilePath(uri);
    const files = await listFiles(this.projectId);

    // 指定されたディレクトリ配下のファイルのみをフィルタ
    const filteredFiles = files.filter(file => {
      const normalizedDirPath = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
      return file.startsWith(normalizedDirPath) && file !== normalizedDirPath;
    });

    return filteredFiles.map(file => {
      const fileName = file.replace(dirPath, '').replace(/^\//, '');
      return [fileName, vscode.FileType.File];
    });
  }

  /**
   * ファイル/ディレクトリを作成
   */
  createDirectory(uri: vscode.Uri): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  /**
   * ファイル/ディレクトリを削除
   */
  delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(uri);
  }

  /**
   * ファイル/ディレクトリをリネーム
   */
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(oldUri);
  }

  /**
   * ファイル/ディレクトリの監視
   */
  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
    // 監視機能は未実装（必要に応じて後で実装）
    return new vscode.Disposable(() => {});
  }

  /**
   * URIをファイルパスに変換
   *
   * @param uri ファイルURI
   * @returns ファイルパス
   */
  private uriToFilePath(uri: vscode.Uri): string {
    // project:// スキームのパスを取得
    // 例: project://default/app/page.tsx → /app/page.tsx
    const path = uri.path;
    return path.startsWith('/') ? path : `/${path}`;
  }
}

