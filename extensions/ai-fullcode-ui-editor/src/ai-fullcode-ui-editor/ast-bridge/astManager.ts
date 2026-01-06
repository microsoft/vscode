/**
 * AST管理の中心クラス（VSCode OSS拡張機能版）
 * 
 * ts-morphを使用して、TypeScript/ReactコードのASTを管理します。
 * ファイル単位でキャッシュし、無駄な再読み込みを防ぎます。
 * 
 * 注意: このファイルは既存のapps/web/lib/ast/astManager.tsをベースにしていますが、
 * VSCode OSS拡張機能内で独立して動作するように簡略化されています。
 */

import { Project, SourceFile, QuoteKind, ScriptKind, SyntaxKind, JsxElement, JsxSelfClosingElement, JsxAttribute, Node } from 'ts-morph';

/**
 * JSX要素の特定の属性を取得（簡易版）
 */
function getJsxAttributeByName(
  element: JsxElement | JsxSelfClosingElement,
  name: string
): JsxAttribute | undefined {
  const attrs = element.getKind() === SyntaxKind.JsxElement
    ? (element as JsxElement).getOpeningElement().getAttributes()
    : (element as JsxSelfClosingElement).getAttributes();
  
  for (const attr of attrs) {
    if (attr.getKind() === SyntaxKind.JsxAttribute) {
      const jsxAttr = attr as JsxAttribute;
      const attrName = jsxAttr.getNameNode().getText();
      if (attrName === name || (name === 'class' && attrName === 'className') || (name === 'className' && attrName === 'class')) {
        return jsxAttr;
      }
    }
  }
  return undefined;
}

/**
 * JSX要素の属性を設定（簡易版）
 */
function setJsxAttribute(
  element: JsxElement | JsxSelfClosingElement,
  name: string,
  value: string
): void {
  const existingAttr = getJsxAttributeByName(element, name);

  if (existingAttr) {
    const initializer = existingAttr.getInitializer();
    if (initializer) {
      initializer.replaceWithText(`"${value}"`);
    } else {
      existingAttr.setInitializer(`"${value}"`);
    }
  } else {
    if (element.getKind() === SyntaxKind.JsxElement) {
      (element as JsxElement)
        .getOpeningElement()
        .addAttribute({
          name,
          initializer: `"${value}"`,
        });
    } else {
      (element as JsxSelfClosingElement).addAttribute({
        name,
        initializer: `"${value}"`,
      });
    }
  }
}

/**
 * JSX要素の属性を削除（簡易版）
 */
function removeJsxAttribute(
  element: JsxElement | JsxSelfClosingElement,
  name: string
): void {
  const attr = getJsxAttributeByName(element, name);
  if (attr) {
    attr.remove();
  }
}

/**
 * JSX要素をIDで検索（data-nodeid属性で検索）
 * 
 * 優先順位:
 * 1. data-nodeid属性
 * 2. data-ai-node-id属性（後方互換性）
 * 3. id属性（後方互換性）
 */
function findJsxElementById(
  file: SourceFile,
  id: string
): JsxElement | JsxSelfClosingElement | undefined {
  const jsxElements = file.getDescendantsOfKind(SyntaxKind.JsxElement) as JsxElement[];
  const selfClosingElements = file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement) as JsxSelfClosingElement[];
  const allElements: Array<JsxElement | JsxSelfClosingElement> = [...jsxElements, ...selfClosingElements];

  for (const element of allElements) {
    // 優先順位1: data-nodeid属性
    const nodeIdAttr = getJsxAttributeByName(element, 'data-nodeid');
    if (nodeIdAttr) {
      const initializer = nodeIdAttr.getInitializer();
      if (initializer) {
        const attrValue = initializer.getText().replace(/['"]/g, '');
        if (attrValue === id) {
          return element;
        }
      }
    }
    
    // 優先順位2: data-ai-node-id属性（後方互換性）
    const aiNodeIdAttr = getJsxAttributeByName(element, 'data-ai-node-id');
    if (aiNodeIdAttr) {
      const initializer = aiNodeIdAttr.getInitializer();
      if (initializer) {
        const attrValue = initializer.getText().replace(/['"]/g, '');
        if (attrValue === id) {
          return element;
        }
      }
    }
    
    // 優先順位3: id属性（後方互換性）
    const idAttr = getJsxAttributeByName(element, 'id');
    if (idAttr) {
      const initializer = idAttr.getInitializer();
      if (initializer) {
        const attrValue = initializer.getText().replace(/['"]/g, '');
        if (attrValue === id) {
          return element;
        }
      }
    }
  }

  return undefined;
}

export class ASTManager {
  private project: Project;
  private cache: Map<string, SourceFile> = new Map();

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
        useTrailingCommas: false,
      },
    });
  }

  /**
   * ファイルを読み込みキャッシュする（1回だけ）
   * ⚠️ 解決策2-A: IDをコードに永続化する
   * 既存のSourceFileがある場合、そのIDを抽出して保持する
   * 新しいSourceFileを作成した後、既存のIDを再付与する
   * 
   * @param path ファイルパス
   * @param content ファイル内容
   * @returns SourceFileインスタンス
   */
  loadFile(path: string, content: string): SourceFile {
    // 既存のSourceFileがある場合、そのIDを抽出して保持する
    const existingFile = this.cache.get(path);
    let existingIds: Map<string, string> | null = null;
    
    if (existingFile) {
      // 既存のSourceFileからIDを抽出
      existingIds = this.extractNodeIds(existingFile);
    }

    // ファイル拡張子に基づいてscriptKindを決定
    const scriptKind = path.endsWith('.tsx') || path.endsWith('.jsx')
      ? ScriptKind.TSX
      : path.endsWith('.ts') || path.endsWith('.js')
      ? ScriptKind.TS
      : ScriptKind.TSX; // デフォルトはTSX

    // 既存のSourceFileを削除（新しいSourceFileを作成するため）
    if (existingFile) {
      this.project.removeSourceFile(existingFile);
    }

    const file = this.project.createSourceFile(path, content, {
      overwrite: true,
      scriptKind: scriptKind,
    });

    // 既存のIDを再付与（解決策2-A）
    if (existingIds && existingIds.size > 0) {
      this.restoreNodeIds(file, existingIds);
    }

    this.cache.set(path, file);
    return file;
  }

  /**
   * 既存のSourceFileからIDを抽出
   * @param file SourceFile
   * @returns IDマップ（要素の位置情報 => ID）
   */
  private extractNodeIds(file: SourceFile): Map<string, string> {
    const ids = new Map<string, string>();
    
    const jsxElements = file.getDescendantsOfKind(SyntaxKind.JsxElement) as JsxElement[];
    const selfClosingElements = file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement) as JsxSelfClosingElement[];
    
    for (const element of [...jsxElements, ...selfClosingElements]) {
      // 要素の位置情報を取得（タグ名 + 親のタグ名 + 開始位置）
      const tagName = element.getKind() === SyntaxKind.JsxElement
        ? (element as JsxElement).getOpeningElement().getTagNameNode().getText()
        : (element as JsxSelfClosingElement).getTagNameNode().getText();
      
      const parent = element.getParent();
      let parentTagName = '';
      if (parent && (parent.getKind() === SyntaxKind.JsxElement || parent.getKind() === SyntaxKind.JsxSelfClosingElement)) {
        parentTagName = parent.getKind() === SyntaxKind.JsxElement
          ? (parent as JsxElement).getOpeningElement().getTagNameNode().getText()
          : (parent as JsxSelfClosingElement).getTagNameNode().getText();
      }
      
      const start = element.getStart();
      const key = `${tagName}:${parentTagName}:${start}`;
      
      // data-nodeidまたはdata-ai-node-idを取得
      const nodeIdAttr = getJsxAttributeByName(element, 'data-nodeid');
      if (nodeIdAttr) {
        const initializer = nodeIdAttr.getInitializer();
        if (initializer) {
          const id = initializer.getText().replace(/['"]/g, '');
          ids.set(key, id);
        }
      } else {
        const aiNodeIdAttr = getJsxAttributeByName(element, 'data-ai-node-id');
        if (aiNodeIdAttr) {
          const initializer = aiNodeIdAttr.getInitializer();
          if (initializer) {
            const id = initializer.getText().replace(/['"]/g, '');
            ids.set(key, id);
          }
        }
      }
    }
    
    return ids;
  }

  /**
   * 既存のIDを新しいSourceFileに再付与
   * @param file SourceFile
   * @param ids IDマップ
   */
  private restoreNodeIds(file: SourceFile, ids: Map<string, string>): void {
    const jsxElements = file.getDescendantsOfKind(SyntaxKind.JsxElement) as JsxElement[];
    const selfClosingElements = file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement) as JsxSelfClosingElement[];
    
    for (const element of [...jsxElements, ...selfClosingElements]) {
      // 要素の位置情報を取得
      const tagName = element.getKind() === SyntaxKind.JsxElement
        ? (element as JsxElement).getOpeningElement().getTagNameNode().getText()
        : (element as JsxSelfClosingElement).getTagNameNode().getText();
      
      const parent = element.getParent();
      let parentTagName = '';
      if (parent && (parent.getKind() === SyntaxKind.JsxElement || parent.getKind() === SyntaxKind.JsxSelfClosingElement)) {
        parentTagName = parent.getKind() === SyntaxKind.JsxElement
          ? (parent as JsxElement).getOpeningElement().getTagNameNode().getText()
          : (parent as JsxSelfClosingElement).getTagNameNode().getText();
      }
      
      const start = element.getStart();
      const key = `${tagName}:${parentTagName}:${start}`;
      
      // 既存のIDを取得
      const existingId = ids.get(key);
      if (existingId) {
        // IDを再付与
        setJsxAttribute(element, 'data-nodeid', existingId);
        setJsxAttribute(element, 'data-ai-node-id', existingId);
      }
    }
  }

  /**
   * AST からコード文字列に戻す
   * @param path ファイルパス
   * @returns 更新されたコード文字列
   */
  emit(path: string): string {
    const file = this.cache.get(path);
    if (!file) {
      throw new Error(`File not loaded: ${path}`);
    }

    return file.getFullText();
  }

  /**
   * コード全体を一括置換（危険：通常は使用しない）
   * @param path ファイルパス
   * @param newContent 新しいコード内容
   */
  overwrite(path: string, newContent: string): void {
    const file = this.cache.get(path);
    if (!file) {
      throw new Error(`File not loaded: ${path}`);
    }
    file.replaceWithText(newContent);
  }

  /**
   * 読み込まれているファイルを取得
   * @param path ファイルパス
   * @returns SourceFileインスタンス（存在しない場合はundefined）
   */
  getFile(path: string): SourceFile | undefined {
    return this.cache.get(path);
  }

  /**
   * ファイルが読み込まれているか確認
   * @param path ファイルパス
   * @returns 読み込まれている場合true
   */
  hasFile(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * ASTパッチを適用
   * @param path ファイルパス
   * @param patchFn パッチ関数
   * @returns 更新されたコード
   */
  applyPatch(path: string, patchFn: (file: SourceFile) => void): string {
    const file = this.cache.get(path);
    if (!file) {
      throw new Error(`File not loaded: ${path}`);
    }

    patchFn(file);
    return file.getFullText();
  }

  /**
   * JSX要素をIDで検索（外部から使用可能）
   * @param path ファイルパス
   * @param id 要素ID（data-nodeid）
   * @returns JSX要素（見つからない場合はundefined）
   */
  findJsxElementById(path: string, id: string): JsxElement | JsxSelfClosingElement | undefined {
    const file = this.cache.get(path);
    if (!file) {
      return undefined;
    }
    return findJsxElementById(file, id);
  }

  /**
   * JSX要素の属性を設定（外部から使用可能）
   * @param element JSX要素
   * @param name 属性名
   * @param value 属性値
   */
  setJsxAttribute(
    element: JsxElement | JsxSelfClosingElement,
    name: string,
    value: string
  ): void {
    setJsxAttribute(element, name, value);
  }

  /**
   * JSX要素の属性を削除（外部から使用可能）
   * @param element JSX要素
   * @param name 属性名
   */
  removeJsxAttribute(
    element: JsxElement | JsxSelfClosingElement,
    name: string
  ): void {
    removeJsxAttribute(element, name);
  }
}

// シングルトンインスタンスをエクスポート
export const astManager = new ASTManager();

