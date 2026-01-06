/**
 * Catalog Service
 *
 * 拡張機能ホスト側でカタログメタデータを集約・管理するサービス
 * ファイルシステムをスキャンし、正規化されたメタデータを提供
 */

import { listFiles, loadFile } from './projectStorageAdapter';
import { UICatalogItem } from './uiCatalog';

/**
 * カタログアイテムのメタデータ
 */
export interface CatalogItemMetadata {
  id: string;
  displayName: string;
  relativePath: string;
  exportType: 'default' | 'named';
  tags: string[];
  category: 'design' | 'component';
}

/**
 * Catalog Service
 *
 * ファイルシステムをスキャンし、カタログメタデータを提供
 */
export class CatalogService {
  private projectId: string;
  private cache: CatalogItemMetadata[] | null = null;

  constructor(projectId: string = 'default') {
    this.projectId = projectId;
  }

  /**
   * カタログアイテムをスキャン
   *
   * 安全なディレクトリのみをスキャン:
   * - designs/**: ユーザー作成の視覚コンポーネント
   * - components/**: 再利用可能なUIコンポーネント
   *
   * @returns カタログアイテムのメタデータ配列
   */
  async scanCatalogItems(): Promise<CatalogItemMetadata[]> {
    try {
      const files = await listFiles(this.projectId);

      const catalogItems: CatalogItemMetadata[] = [];

      // designs/配下のファイルをスキャン
      const designFiles = files.filter(f =>
        f.startsWith('/designs/') &&
        (f.endsWith('.tsx') || f.endsWith('.jsx')) &&
        !f.includes('/__runtime__/')
      );

      for (const filePath of designFiles) {
        const metadata = await this.extractMetadata(filePath, 'design');
        if (metadata) {
          catalogItems.push(metadata);
        }
      }

      // components/配下のファイルをスキャン
      const componentFiles = files.filter(f =>
        f.startsWith('/components/') &&
        (f.endsWith('.tsx') || f.endsWith('.jsx'))
      );

      for (const filePath of componentFiles) {
        const metadata = await this.extractMetadata(filePath, 'component');
        if (metadata) {
          catalogItems.push(metadata);
        }
      }


      this.cache = catalogItems;
      return catalogItems;
    } catch (error) {
      console.error('[CatalogService] Failed to scan catalog items:', error);
      return [];
    }
  }

  /**
   * ファイルからメタデータを抽出
   *
   * @param filePath ファイルパス
   * @param category カテゴリ（design または component）
   * @returns メタデータ、抽出に失敗した場合は null
   */
  private async extractMetadata(
    filePath: string,
    category: 'design' | 'component'
  ): Promise<CatalogItemMetadata | null> {
    try {
      // ファイル名からIDと表示名を生成
      const fileName = filePath.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || '';

      const id = fileName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');

      const displayName = fileName
        .replace(/([A-Z])/g, ' $1')
        .trim();

      // ファイル内容を読み込んでexport typeを判定
      const content = await loadFile(this.projectId, filePath);
      const exportType: 'default' | 'named' = content?.includes('export default') ? 'default' : 'named';

      // タグを生成（パスから）
      const tags: string[] = [];
      if (category === 'design') {
        tags.push('design');
      } else if (category === 'component') {
        tags.push('component');
      }

      // パスから追加のタグを抽出（例: /designs/buttons/Button.tsx → ['buttons']）
      const pathParts = filePath.split('/').filter(p => p && p !== 'designs' && p !== 'components');
      if (pathParts.length > 1) {
        tags.push(...pathParts.slice(0, -1));
      }

      return {
        id,
        displayName,
        relativePath: filePath,
        exportType,
        tags,
        category,
      };
    } catch (error) {
      console.error(`[CatalogService] Failed to extract metadata from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * キャッシュされたカタログアイテムを取得
   *
   * @returns カタログアイテムのメタデータ配列
   */
  getCachedItems(): CatalogItemMetadata[] {
    return this.cache || [];
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cache = null;
  }
}

