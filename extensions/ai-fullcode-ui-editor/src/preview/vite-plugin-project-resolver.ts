/**
 * Vite Plugin: Project File Resolver (VSCode Extension内包版)
 *
 * ✅ 新しいアーキテクチャ: 実際のdev serverを直接表示
 * - virtual:design-entryは削除
 * - プロジェクトファイルの解決のみ（@/エイリアス対応）
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { transform } from 'esbuild';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * すべてのプロジェクトディレクトリをスキャンしてファイルを探す
 */
async function findProjectFile(filePath: string): Promise<{ content: string; path: string; projectId: string } | null> {
  try {
    // 拡張機能のルートから相対パスで解決
    // __dirnameは src/preview/ を指す（開発時）または out/preview/ を指す（実行時）
    // 拡張機能のルート（ai-fullcode-ui-editor/）は __dirname/../../.. を指す
    let extensionRoot = join(__dirname, '../../..');

    // __dirnameが out/preview/ を指す場合、src/ に変換
    if (extensionRoot.endsWith('/out') || extensionRoot.endsWith('\\out')) {
      extensionRoot = extensionRoot.replace(/[/\\]out$/, '');
    }

    // VSCode OSSのルート（vscode-oss-fork-source/）を取得
    // extensionRootが extensions/ を指している場合、その親が vscode-oss-fork-source/
    // extensionRootが extensions/ai-fullcode-ui-editor/ を指している場合、../.. で vscode-oss-fork-source/ に到達
    let workspaceRoot: string;
    if (extensionRoot.endsWith('/extensions') || extensionRoot.endsWith('\\extensions')) {
      // extensionRootが extensions/ を指している場合
      workspaceRoot = join(extensionRoot, '..');
    } else if (extensionRoot.includes('/ai-fullcode-ui-editor') || extensionRoot.includes('\\ai-fullcode-ui-editor')) {
      // extensionRootが extensions/ai-fullcode-ui-editor/ を指している場合
      workspaceRoot = join(extensionRoot, '../..');
    } else {
      // フォールバック: extensionRootから extensions/ を探す
      const extensionsIndex = extensionRoot.indexOf('/extensions');
      if (extensionsIndex !== -1) {
        workspaceRoot = join(extensionRoot.substring(0, extensionsIndex), 'vscode-oss-fork-source');
      } else {
        // 最後の手段: 現在のディレクトリから vscode-oss-fork-source を探す
        workspaceRoot = join(__dirname, '../../../../..');
      }
    }

    const projectDir = join(workspaceRoot, 'data', 'projects');

    // ファイルパスを正規化（@/ を削除、先頭の / を削除）
    const normalizedPath = filePath
      .replace(/^@\//, '')
      .replace(/^\/+/, '');

    // ✅ 根本原因の修正: 拡張子が既に含まれているかチェック
    const hasExtension = /\.(tsx|jsx|ts|js)$/.test(normalizedPath);

    // プロジェクトディレクトリが存在しない場合は null を返す
    try {
      await stat(projectDir);
    } catch {
      return null;
    }

    // すべてのプロジェクトディレクトリをスキャン
    const projectEntries = await readdir(projectDir, { withFileTypes: true });

    // ✅ エラーログを1回だけ出力するためのフラグ
    let errorLogged = false;

    for (const entry of projectEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectId = entry.name;
      const projectPath = join(projectDir, projectId, 'files');
      const persistentFilePath = join(projectPath, normalizedPath);

      // ✅ 根本原因の修正: 拡張子が既に含まれている場合は、そのまま使用
      if (hasExtension) {
        try {
          await stat(persistentFilePath);
          const content = await readFile(persistentFilePath, 'utf-8');
          // 成功ログは削減（大量のファイル読み込み時にログが溢れるため）
          return { content, path: persistentFilePath, projectId };
        } catch (error) {
          // ファイルが見つからない場合は次のプロジェクトを試す
          continue;
        }
      } else {
        // 拡張子がない場合のみ、.tsx, .ts, .jsx, .js を順に試す（後方互換性のため）
        const extensions = ['.tsx', '.ts', '.jsx', '.js'];
        for (const ext of extensions) {
          try {
            const filePathWithExt = persistentFilePath + ext;
            await stat(filePathWithExt);
            const content = await readFile(filePathWithExt, 'utf-8');
            // 成功ログは削減（大量のファイル読み込み時にログが溢れるため）
            return { content, path: filePathWithExt, projectId };
          } catch (error) {
            // ファイルが見つからない場合は次の拡張子を試す
            continue;
          }
        }
      }
    }

    // ✅ すべてのプロジェクトを試した後に、ファイルが見つからなかった場合のみエラーログを出力
    if (!errorLogged) {
      const firstProjectPath = projectEntries.length > 0 && projectEntries[0].isDirectory()
        ? join(projectDir, projectEntries[0].name, 'files', normalizedPath)
        : join(projectDir, 'default', 'files', normalizedPath);
      console.error(`[Vite Plugin] ❌ File not found: ${normalizedPath} (searched in all projects)`);
      errorLogged = true;
    }

    return null;
  } catch (error) {
    console.error('[Vite Plugin] Error finding project file:', error);
    return null;
  }
}

/**
 * Vite プラグイン: プロジェクトファイル解決
 */
export default function projectResolver() {
  return {
    name: 'project-file-resolver',
    enforce: 'pre' as const,

    /**
     * モジュール解決をカスタマイズ
     */
    async resolveId(id: string, importer?: string) {
      // ✅ 新しいアーキテクチャ: virtual:design-entryは削除
      // 実際のdev serverを直接表示するため、仮想モジュールは不要

      // CSS ファイルの import を検出してスタブを返す
      if (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.sass') || id.endsWith('.less')) {
        const encodedPath = Buffer.from(id).toString('base64');
        return `\0css-stub:${encodedPath}`;
      }

      // @/ エイリアスで始まる場合のみ処理
      if (!id.startsWith('@/')) {
        return null;
      }

      // 永続ストレージから読み込む
      const result = await findProjectFile(id);
      if (result) {
        // 成功ログは削減（大量のファイル解決時にログが溢れるため）
        const encodedPath = Buffer.from(result.path).toString('base64');
        return `\0project-file:${encodedPath}`;
      }

      // ✅ 根本原因の修正: 未解決のパスを早期に拒否
      // エラーログは findProjectFile 内で既に出力されているので、ここでは何もしない
      // null を返すことで、Vite の標準解決に委譲（通常は失敗する）
      return null;
    },

    /**
     * モジュールの読み込みをカスタマイズ
     */
    async load(id: string): Promise<{ code: string; map: string | null } | null> {
      // ✅ 新しいアーキテクチャ: virtual:design-entryは削除
      // 実際のdev serverを直接表示するため、仮想モジュールの読み込みは不要

      // CSS スタブの処理
      if (id.startsWith('\0css-stub:')) {
        return {
          code: '// CSS import stub for preview environment\nexport default {};\n',
          map: null,
        };
      }

      // 仮想モジュール ID の場合のみ処理
      if (!id.startsWith('\0project-file:')) {
        return null;
      }

      // 仮想モジュール ID から実際のファイルパスを取得
      const encodedPath = id.replace(/^\0project-file:/, '');
      const actualPath = Buffer.from(encodedPath, 'base64').toString('utf-8');

      // CSS ファイルの場合は空モジュールを返す
      if (actualPath.endsWith('.css')) {
        return {
          code: '// CSS import stub for preview environment\nexport default {};\n',
          map: null,
        };
      }

      try {
        let content = await readFile(actualPath, 'utf-8');
        // 成功ログは削減（大量のファイル読み込み時にログが溢れるため）

        // Next.js 専用 export を削除
        const nextJsExports = [
          /export\s+(const|function)\s+metadata\s*[:=]/g,
          /export\s+(const|function)\s+generateMetadata\s*[:=]/g,
          /export\s+const\s+runtime\s*[:=]/g,
          /export\s+const\s+dynamic\s*[:=]/g,
          /export\s+const\s+revalidate\s*[:=]/g,
        ];

        for (const pattern of nextJsExports) {
          content = content.replace(pattern, '// Removed Next.js-only export for preview environment\n// $&');
        }

        // ✅ TSX/JSXファイルの場合はesbuildで変換（Viteのimport-analysisが正しくパースできるように）
        if (actualPath.endsWith('.tsx') || actualPath.endsWith('.jsx')) {
          try {
            const transformResult = await transform(content, {
              loader: actualPath.endsWith('.tsx') ? 'tsx' : 'jsx',
              jsx: 'automatic',
              jsxImportSource: 'react',
              sourcemap: 'inline',
              target: 'esnext',
              format: 'esm',
            });
            return {
              code: transformResult.code,
              map: transformResult.map || null,
            };
          } catch (transformError) {
            console.error(`[Vite Plugin] ❌ Failed to transform TSX/JSX: ${actualPath}`, transformError);
            // 変換に失敗した場合は生のコードを返す（フォールバック）
            return {
              code: content,
              map: null,
            };
          }
        }

        // TSX/JSX以外のファイルはそのまま返す
        return {
          code: content,
          map: null,
        };
      } catch (error) {
        console.error(`[Vite Plugin] ❌ Failed to load file: ${actualPath}`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = `// Error loading file: ${actualPath}
// ${errorMessage}
// This component could not be loaded from persistent storage.
export default function ErrorComponent() {
  console.error('[Vite Plugin] Component not found:', '${actualPath}');
  return null;
}
`;

        // エラーコードもesbuildで変換（JSXを含む可能性があるため）
        try {
          const transformResult = await transform(errorCode, {
            loader: 'tsx',
            jsx: 'automatic',
            jsxImportSource: 'react',
            sourcemap: 'inline',
            target: 'esnext',
            format: 'esm',
          });
          return {
            code: transformResult.code,
            map: transformResult.map || null,
          };
        } catch (transformError) {
          // esbuild変換に失敗した場合は生のコードを返す（フォールバック）
          console.error(`[Vite Plugin] ❌ Failed to transform error code:`, transformError);
          return {
            code: errorCode,
            map: null,
          };
        }
      }
    },
  };
}

