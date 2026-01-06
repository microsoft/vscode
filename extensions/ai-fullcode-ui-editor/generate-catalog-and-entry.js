/**
 * カタログとdesign-entry.tsxを実際に生成
 * VSCode拡張機能の起動後の動作を再現
 */

const fs = require('fs');
const path = require('path');

const PROJECT_FILES_DIR = '/Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source/data/projects/default/files';
const WORKSPACE_ROOT = '/Users/masato0420/Documents/moon-japan-LP';

const SPECIAL_FILES = [
  'layout.tsx', 'layout.jsx',
  'loading.tsx', 'loading.jsx',
  'error.tsx', 'error.jsx',
  'not-found.tsx', 'not-found.jsx',
  'route.ts', 'route.js'
];

function isSpecialFile(fileName) {
  return SPECIAL_FILES.includes(fileName.toLowerCase());
}

function scanDirectory(dirPath, workspaceRoot, kind) {
  const files = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name !== '__runtime__' && entry.name !== 'node_modules') {
          const subFiles = scanDirectory(fullPath, workspaceRoot, kind);
          files.push(...subFiles);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx'))) {
        if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
          continue;
        }
        
        if (entry.name.includes('[') || entry.name.includes(']') || fullPath.includes('[') || fullPath.includes(']')) {
          continue;
        }
        
        if (isSpecialFile(entry.name)) {
          continue;
        }
        
        try {
          const stats = fs.statSync(fullPath);
          if (!stats.isFile()) {
            continue;
          }
        } catch (error) {
          continue;
        }
        
        const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
        const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
        
        files.push({
          filePath: fullPath,
          normalizedPath,
          kind
        });
      }
    }
  } catch (error) {
    // エラーは無視
  }
  
  return files;
}

function generateCatalogId(normalizedPath, kind) {
  const parts = normalizedPath.split('/');
  let fileName = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '');
  
  if (kind === 'page' && fileName === 'page') {
    const dirName = parts[parts.length - 2];
    if (dirName && dirName !== 'pages' && dirName !== 'app' && dirName !== 'screens') {
      fileName = dirName;
    } else if (parts.length > 2) {
      const parentDirName = parts[parts.length - 3];
      if (parentDirName && parentDirName !== 'pages' && parentDirName !== 'app' && parentDirName !== 'screens') {
        fileName = parentDirName;
      }
    }
  }
  
  return fileName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

function generateDisplayName(normalizedPath, kind) {
  const parts = normalizedPath.split('/');
  let fileName = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '');
  
  if (kind === 'page' && fileName === 'page') {
    const dirName = parts[parts.length - 2];
    if (dirName && dirName !== 'pages' && dirName !== 'app' && dirName !== 'screens') {
      fileName = dirName;
    } else if (parts.length > 2) {
      const parentDirName = parts[parts.length - 3];
      if (parentDirName && parentDirName !== 'pages' && parentDirName !== 'app' && parentDirName !== 'screens') {
        fileName = parentDirName;
      }
    }
  }
  
  return fileName
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

function getComponentRefName(filePath, kind) {
  const parts = filePath.split('/');
  let fileName = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '');
  
  if (kind === 'page' && fileName === 'page') {
    const dirName = parts[parts.length - 2];
    if (dirName && dirName !== 'pages' && dirName !== 'app' && dirName !== 'screens') {
      fileName = dirName;
    } else if (parts.length > 2) {
      const parentDirName = parts[parts.length - 3];
      if (parentDirName && parentDirName !== 'pages' && parentDirName !== 'app' && parentDirName !== 'screens') {
        fileName = parentDirName;
      }
    }
  }
  
  let refName = fileName.charAt(0).toUpperCase() + fileName.slice(1);
  refName = refName.replace(/[^A-Za-z0-9_$]/g, '');
  if (/^[0-9]/.test(refName)) {
    refName = 'Component' + refName;
  }
  if (!refName || refName.length === 0) {
    refName = 'Component';
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(refName)) {
    refName = 'Component';
  }
  
  return refName;
}

// カタログを生成
function generateCatalog() {
  console.log('=== カタログ生成 ===\n');
  
  const pageDirectories = ['pages', 'app', 'screens'];
  const componentDirectories = ['components', 'designs', 'ui'];
  
  const catalogItems = [];
  
  // ページディレクトリをスキャン
  for (const dir of pageDirectories) {
    const dirPath = path.join(WORKSPACE_ROOT, dir);
    if (fs.existsSync(dirPath)) {
      const files = scanDirectory(dirPath, WORKSPACE_ROOT, 'page');
      files.forEach(file => {
        const id = generateCatalogId(file.normalizedPath, 'page');
        const name = generateDisplayName(file.normalizedPath, 'page');
        const importPath = `@/${file.normalizedPath.replace(/^\/+/, '')}`;
        catalogItems.push({
          id,
          name,
          component: file.normalizedPath,
          description: 'Page',
          kind: 'page',
          absoluteFilePath: file.filePath,
          importPathWithExtension: importPath
        });
      });
    }
  }
  
  // コンポーネントディレクトリをスキャン
  for (const dir of componentDirectories) {
    const dirPath = path.join(WORKSPACE_ROOT, dir);
    if (fs.existsSync(dirPath)) {
      const files = scanDirectory(dirPath, WORKSPACE_ROOT, 'component');
      files.forEach(file => {
        const id = generateCatalogId(file.normalizedPath, 'component');
        const name = generateDisplayName(file.normalizedPath, 'component');
        const importPath = `@/${file.normalizedPath.replace(/^\/+/, '')}`;
        catalogItems.push({
          id,
          name,
          component: file.normalizedPath,
          description: 'Component',
          kind: 'component',
          absoluteFilePath: file.filePath,
          importPathWithExtension: importPath
        });
      });
    }
  }
  
  // ファイルを永続ストレージに同期
  let syncCount = 0;
  let syncErrorCount = 0;
  
  for (const item of catalogItems) {
    try {
      if (!fs.existsSync(item.absoluteFilePath)) {
        continue;
      }
      
      const relativePath = item.component.startsWith('/') ? item.component.slice(1) : item.component;
      const persistentPath = path.join(PROJECT_FILES_DIR, relativePath);
      
      // ディレクトリを作成
      const dir = path.dirname(persistentPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // ファイルをコピー
      const content = fs.readFileSync(item.absoluteFilePath, 'utf-8');
      fs.writeFileSync(persistentPath, content, 'utf-8');
      syncCount++;
    } catch (error) {
      syncErrorCount++;
    }
  }
  
  console.log(`✅ カタログアイテム数: ${catalogItems.length}`);
  console.log(`   - Pages: ${catalogItems.filter(i => i.kind === 'page').length}`);
  console.log(`   - Components: ${catalogItems.filter(i => i.kind === 'component').length}`);
  console.log(`✅ 同期済みファイル: ${syncCount}`);
  if (syncErrorCount > 0) {
    console.log(`⚠️ 同期エラー: ${syncErrorCount}`);
  }
  
  // カタログファイルを保存
  const catalogContent = `// UI Catalog (Auto-generated)
// This file lists all available design screens
// DO NOT EDIT MANUALLY

export const uiCatalog: Array<{
  id: string;
  name: string;
  component: string;
  description?: string;
  kind: 'page' | 'component';
  absoluteFilePath: string;
  importPathWithExtension: string;
}> = ${JSON.stringify(catalogItems, null, 2)};
`;
  
  const catalogDir = path.join(PROJECT_FILES_DIR, 'catalog');
  if (!fs.existsSync(catalogDir)) {
    fs.mkdirSync(catalogDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(catalogDir, 'uiCatalog.ts'), catalogContent, 'utf-8');
  console.log('✅ カタログファイルを保存しました');
  
  return catalogItems;
}

// design-entry.tsxを生成
function generateDesignEntry(catalogItems) {
  console.log('\n=== design-entry.tsx生成 ===\n');
  
  // 特殊ファイルを除外
  const validatedItems = catalogItems.filter(item => {
    const fileName = path.basename(item.component).toLowerCase();
    if (isSpecialFile(fileName)) {
      return false;
    }
    
    // ファイルの存在確認
    try {
      if (!fs.existsSync(item.absoluteFilePath)) {
        return false;
      }
    } catch (error) {
      return false;
    }
    
    return true;
  });
  
  console.log(`✅ 検証済みアイテム数: ${validatedItems.length} (除外: ${catalogItems.length - validatedItems.length})`);
  
  // 重複したコンポーネント参照名を防ぐ
  const usedRefNames = new Map();
  const imports = [];
  const registryEntries = [];
  const pageIds = [];
  const componentIds = [];
  const registryKeys = new Set();
  
  for (const item of validatedItems) {
    let componentRefName = getComponentRefName(item.component, item.kind);
    
    // 重複したコンポーネント参照名を防ぐ
    if (usedRefNames.has(componentRefName)) {
      const count = usedRefNames.get(componentRefName) + 1;
      usedRefNames.set(componentRefName, count);
      componentRefName = `${componentRefName}${count}`;
    } else {
      usedRefNames.set(componentRefName, 0);
    }
    
    const importStmt = `import ${componentRefName} from '${item.importPathWithExtension}';`;
    const importWithComment = `// @ts-expect-error - 永続ストレージから動的に読み込まれる（Vite プラグインが解決）\n${importStmt}`;
    imports.push(importWithComment);
    
    // 重複したregistryキーを防ぐ
    if (!registryKeys.has(item.id)) {
      registryKeys.add(item.id);
      registryEntries.push(`  '${item.id}': ${componentRefName},`);
      
      if (item.kind === 'page') {
        pageIds.push(item.id);
      } else {
        componentIds.push(item.id);
      }
    }
  }
  
  const defaultSelected = validatedItems.length > 0 ? validatedItems[0].id : '';
  const escapedDefaultSelected = defaultSelected.replace(/'/g, "\\'");
  
  const allIdsArray = [...pageIds, ...componentIds];
  const allIdsJson = JSON.stringify(allIdsArray);
  const pageIdsJson = JSON.stringify(pageIds);
  const componentIdsJson = JSON.stringify(componentIds);
  
  const code = `// Design Entry Point (Auto-generated)
// This file aggregates all design screens for visual editing
// DO NOT EDIT MANUALLY
//
// Phase 4: Registry方式
// - カタログから生成されたregistry
// - selected propで切り替え可能
// - 非エンジニアは「画面単位」で選択

import React from 'react';

${imports.join('\n')}

const registry = {
${registryEntries.join('\n')}
} as const;

// ✅ 利用可能なIDリストをエクスポート（デバッグ用）
export const pageIds: string[] = ${pageIdsJson};
export const componentIds: string[] = ${componentIdsJson};
export const allIds: string[] = ${allIdsJson};

// ✅ IDが存在するかチェックする関数
export function getComponentById(id: string): React.ComponentType | undefined {
  return registry[id as keyof typeof registry];
}

// ✅ 利用可能なIDを取得する関数
export function listAvailableIds(): string[] {
  return Object.keys(registry);
}

export interface DesignEntryProps {
  selected?: keyof typeof registry;
  previewType?: 'page' | 'component';
}

export default function DesignEntry({ selected, previewType }: DesignEntryProps = {}) {
  const selectedId = selected || '${escapedDefaultSelected}';
  const Component = registry[selectedId as keyof typeof registry];

  if (!Component) {
    // ✅ エラー表示: 利用可能なIDを表示
    const availableIds = Object.keys(registry);
    return (
      <div style={{ padding: '20px', background: '#1e1e1e', color: '#f48771' }}>
        <h2>Design not found</h2>
        <p>Selected ID: <code>{selectedId}</code></p>
        <p>Available IDs ({availableIds.length}):</p>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          {availableIds.map(id => (
            <li key={id}><code>{id}</code></li>
          ))}
        </ul>
      </div>
    );
  }

  // Pages: フルレイアウトで表示
  if (previewType === 'page') {
    return (
      <div
        data-design-only="true"
        data-design-boundary="true"
        data-design-boundary-root="true"
        style={{ minHeight: '100vh', width: '100%' }}
      >
        <Component />
      </div>
    );
  }

  // Components: 中央揃えでパディング付き表示
  if (previewType === 'component') {
    return (
      <div
        data-design-only="true"
        data-design-boundary="true"
        data-design-boundary-root="true"
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          background: '#1e1e1e'
        }}
      >
        <Component />
      </div>
    );
  }

  // デフォルト: フルレイアウト
  return (
    <div
      data-design-only="true"
      data-design-boundary="true"
      data-design-boundary-root="true"
      style={{ minHeight: '100vh' }}
    >
      <Component />
    </div>
  );
}
`;
  
  // design-entry.tsxを保存
  const runtimeDir = path.join(PROJECT_FILES_DIR, '__runtime__');
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(runtimeDir, 'design-entry.tsx'), code, 'utf-8');
  console.log('✅ design-entry.tsxを保存しました');
  
  // 検証
  const layoutImports = code.match(/import\s+\w+\s+from\s+['"]@\/[^'"]*layout\.tsx['"]/g);
  if (layoutImports && layoutImports.length > 0) {
    console.log(`\n❌ layout.tsxのインポートが含まれています: ${layoutImports.length}件`);
    return false;
  }
  
  const importNames = imports.map(imp => {
    const match = imp.match(/import\s+(\w+)\s+from/);
    return match ? match[1] : null;
  }).filter(Boolean);
  
  const duplicateImports = importNames.filter((name, index) => importNames.indexOf(name) !== index);
  if (duplicateImports.length > 0) {
    console.log(`\n❌ 重複したインポート名: ${[...new Set(duplicateImports)].join(', ')}`);
    return false;
  }
  
  const duplicateKeys = Array.from(registryKeys).filter((key, index, arr) => arr.indexOf(key) !== index);
  if (duplicateKeys.length > 0) {
    console.log(`\n❌ 重複したregistryキー: ${duplicateKeys.join(', ')}`);
    return false;
  }
  
  console.log(`✅ インポート文数: ${imports.length}`);
  console.log(`✅ Registryエントリ数: ${registryEntries.length}`);
  console.log(`   - Pages: ${pageIds.length}`);
  console.log(`   - Components: ${componentIds.length}`);
  console.log('✅ layout.tsxのインポートは含まれていません');
  console.log('✅ 重複したインポート名はありません');
  console.log('✅ 重複したregistryキーはありません');
  
  return true;
}

// メイン実行
console.log('🚀 カタログとdesign-entry.tsxの生成開始\n');

try {
  const catalogItems = generateCatalog();
  const designEntryOk = generateDesignEntry(catalogItems);
  
  if (!designEntryOk) {
    console.log('\n❌ design-entry.tsxの生成に失敗しました');
    process.exit(1);
  }
  
  console.log('\n✅ すべての生成が成功しました');
  console.log('\n📝 次のステップ:');
  console.log('   1. VSCode拡張機能を再起動');
  console.log('   2. プレビューを開いて、ページ・コンポーネントが正しく表示されることを確認');
  console.log('   3. カタログからページ・コンポーネントを選択して、エラーが出ないことを確認');
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ エラー:', error);
  process.exit(1);
}

