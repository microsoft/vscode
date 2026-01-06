/**
 * Design Entry Manager
 * 
 * Phase 3-4: design-entry.tsx生成機能
 * プロジェクト内のTSXファイルからdesign-entry.tsxを生成・更新
 * Phase 4: 複数ファイル集約機能を統合
 */

import { loadFile, saveFile, listFiles } from './projectStorageAdapter';
import { DesignEntryBuilder, DesignEntryConfig, ComponentInfo } from './DesignEntryBuilder';
import { Project } from 'ts-morph';

/**
 * Design Entry Manager
 * 
 * design-entry.tsxの生成・更新を管理
 */
export class DesignEntryManager {
  private projectId: string;
  private builder: DesignEntryBuilder | null = null;

  constructor(projectId: string = 'default') {
    this.projectId = projectId;
  }

  /**
   * DesignEntryBuilderを取得（遅延初期化）
   */
  private getBuilder(): DesignEntryBuilder {
    if (!this.builder) {
      const project = new Project({
        useInMemoryFileSystem: true,
        skipAddingFilesFromTsConfig: true,
      });
      this.builder = new DesignEntryBuilder(project, this.projectId);
    }
    return this.builder;
  }

  /**
   * プロジェクト内のTSXファイルからdesign-entry.tsxを生成
   * 
   * Phase 4: 複数ファイル集約機能を使用
   * 
   * @param entryFile エントリーファイル（省略時は自動選択）
   * @param includeComponents 含めるコンポーネントのパス（オプション）
   * @returns 生成されたdesign-entry.tsxのコード
   */
  async generateDesignEntry(entryFile?: string, includeComponents?: string[]): Promise<string> {
    try {
      // Phase 4: DesignEntryBuilderを使用して複数ファイル集約
      const builder = this.getBuilder();
      const config: DesignEntryConfig = {
        projectId: this.projectId,
        entryFile,
        includeComponents,
      };
      
      const designEntryCode = await builder.buildDesignEntry(config);
      
      // 永続ストレージに保存
      const designEntryPath = '__runtime__/design-entry.tsx';
      await saveFile(this.projectId, designEntryPath, designEntryCode);
      
      
      return designEntryCode;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DesignEntryManager] ❌ design-entry.tsx生成エラー: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * プロジェクト内のコンポーネント一覧を取得
   * 
   * Phase 4: カタログ選択機能で使用
   * 
   * @returns コンポーネント情報の配列
   */
  async getComponents(): Promise<ComponentInfo[]> {
    try {
      const builder = this.getBuilder();
      return await builder.scanProject();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DesignEntryManager] ❌ コンポーネント一覧取得エラー: ${errorMessage}`);
      return [];
    }
  }

  /**
   * design-entry.tsxを更新（既存のファイルを再生成）
   * 
   * @param entryFile エントリーファイル（省略時は自動選択）
   * @param includeComponents 含めるコンポーネントのパス（オプション）
   */
  async updateDesignEntry(entryFile?: string, includeComponents?: string[]): Promise<string> {
    return this.generateDesignEntry(entryFile, includeComponents);
  }

  /**
   * プロジェクトIDを設定
   * 
   * @param projectId プロジェクトID
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * プロジェクトIDを取得
   * 
   * @returns プロジェクトID
   */
  getProjectId(): string {
    return this.projectId;
  }
}

