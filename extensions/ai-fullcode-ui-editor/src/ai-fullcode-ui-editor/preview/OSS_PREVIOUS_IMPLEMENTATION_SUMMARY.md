# OSS移行前の実装まとめ（フルコード対応版）

## 📋 概要

OSS移行前の実装（`apps/web/`配下）を確認し、VSCode拡張（Phase 7）でフルコード対応するための要点をまとめます。

---

## 1. ドラッグ&ドロップ実装

### 1.1 基本アーキテクチャ

**ファイル**: `apps/web/public/iframe-app/drag-and-drop.js`

#### 核心ポイント

1. **要素識別**: `data-nodeid`属性で要素を識別
   - TSXソースに存在する`data-nodeid`のみを使用
   - ランダムID生成は禁止
   - `data-ai-node-id`、`data-node-id`も後方互換性のためにサポート

2. **Slot Preview表示**（Figmaライク）
   - 要素のハイライトは完全撤廃
   - 境界に細い青線のみ表示（`slot-preview`）
   - 縦方向: スロットの中央に1本の横線
   - 横方向: スロットの中央に1本の縦線

3. **Sticky Parent（reorder mode）**
   - ドラッグ開始時に「並び替え」か「移動」かを決定
   - 同じ親内での移動は`reorder`モード
   - Alt/Metaキーが押されている場合は`move`モード（明示的な親変更）

4. **ContainerTargeting**
   - 通常Drag: Slot only（境界のみ）
   - Alt + Drag: ContainerTargeting解禁（グループ外移動可能）

#### 実装の流れ

```javascript
// 1. dragstart: 移動元を記録
handlers.dragstart = (e) => {
  const target = e.target.closest('[data-nodeid], [data-ai-node-id], [data-node-id]');
  const nodeId = ensureNodeId(target);

  // Sticky Parent（reorder mode）の導入
  let sourceParentId = null;
  let mode = 'move';

  // 親要素を探す
  let parentElement = target.parentElement;
  while (parentElement && parentElement !== document.body) {
    const parentNodeId = ensureNodeId(parentElement);
    if (parentNodeId) {
      sourceParentId = parentNodeId;
      if (e.altKey || e.metaKey) {
        mode = 'move'; // 明示的な親変更
      } else {
        mode = 'reorder'; // 同じ親内での並び替え
      }
      break;
    }
    parentElement = parentElement.parentElement;
  }

  dragContext = {
    sourceNodeId: nodeId,
    sourceParentId: sourceParentId,
    mode: mode
  };
};

// 2. dragover: Slot Previewを表示
handlers.dragover = (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Slot Previewを表示（indexベース）
  if (draggedNodeId && typeof window.resolveInsertionSlot === 'function') {
    const insertionSlot = window.resolveInsertionSlot(
      dropTarget,
      e.clientX,
      e.clientY,
      draggedNodeId,
      uiTree
    );

    if (insertionSlot) {
      showSlotPreview(insertionSlot);
    }
  }
};

// 3. drop: DropIntentを解決してOPERATIONを送信
handlers.drop = (e) => {
  e.preventDefault();
  e.stopPropagation();

  // DropContextを作成
  const dropContext = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    targetRect: dropTarget.getBoundingClientRect(),
    targetNodeId,
    sourceNodeId: draggedNodeId,
    targetElement: dropTarget,
    isRoot,
    dragContext: dragContext, // Sticky Parent情報
    isExplicitContainerMove: e.altKey || e.metaKey, // Alt + Dragフラグ
  };

  // DropIntentを解決
  const dropIntent = resolveDropIntent(dropContext, uiTree, draggedNodeId);

  // OPERATIONメッセージを送信
  postMessageClient({
    type: 'OPERATION',
    operation: {
      type: 'move',
      filePath: activeFilePath,
      sourceId: draggedNodeId,
      targetId: dropIntent.parentId,
      position: 'inside',
      insideIndex: dropIntent.index,
    }
  });
};
```

### 1.2 DropIntent解決（2段階アーキテクチャ）

**ファイル**: `apps/web/lib/ui-structure/drop/resolveDropIntent.ts`

#### Step 1: DOMHitTest → VisualDropHint（DOM基準の視覚的ヒント）

```typescript
const hint = performDOMHitTest(
  context.mouseX,
  context.mouseY,
  context.targetElement,
  context.targetNodeId
);
```

#### Step 2: VisualDropHint → StructuralDropIntent（AST基準の構造的意図）

```typescript
// Alt + Dragの場合、Slot解決が失敗した場合のみContainerTargetingを使用
if (isExplicitContainerMove && draggedNodeId) {
  // まずSlot解決を試みる
  const insertionSlot = resolveInsertionSlot(
    context.targetElement,
    mouseX,
    mouseY,
    draggedNodeId,
    currentTree
  );

  if (insertionSlot) {
    return {
      kind: 'insert-at-index',
      parentId: insertionSlot.parentId,
      index: insertionSlot.index,
    };
  }

  // Slot解決が失敗した場合のみContainerTargetingを使用
  const containerTarget = resolveContainerTarget(
    context.targetElement,
    mouseX,
    mouseY,
    draggedNodeId,
    currentTree
  );

  if (containerTarget) {
    return {
      kind: 'insert-at-index',
      parentId: containerTarget.targetContainerNodeId,
      index: containerTarget.targetIndex,
    };
  }
}

// 通常Drag: StructuralDropIntentを解決
return resolveStructuralIntent(
  hint,
  currentTree,
  draggedNodeId,
  context.dragContext || undefined
);
```

---

## 2. プロパティ編集実装

### 2.1 UnifiedPropertiesPanel

**ファイル**: `apps/web/app/editor/components/UnifiedPropertiesPanel.tsx`

#### 核心ポイント

1. **要素情報の取得**
   - `ELEMENT_INFO`メッセージで要素情報を受信
   - `tagName`, `id`, `classList`, `attributes`, `textContent`, `computedStyle`, `nodeId`を保持

2. **属性編集**
   - 属性の現在値を表示
   - クリックで編集モードに切り替え
   - Enterで保存、Escapeでキャンセル
   - `UPDATE_ATTRIBUTE`メッセージを送信

3. **スタイル編集**
   - レイアウト: `width`, `height`, `display`, `position`
   - 色: `color`, `background-color`
   - タイポグラフィ: `font-size`, `font-weight`, `line-height`
   - リアルタイムで`UPDATE_ATTRIBUTE`メッセージを送信

4. **テキストコンテンツ編集**
   - テキストエリアで編集
   - `UPDATE_TEXT_CONTENT`メッセージを送信

#### 実装の流れ

```typescript
// 1. 要素情報を受信
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'ELEMENT_INFO') {
      const info = event.data.payload;
      setSelectedElement(info);

      // 属性の現在値を設定
      if (info.attributes) {
        setAttributeValues(info.attributes);
      }

      // computedStyleから実際のスタイル値を取得
      if (info.computedStyle) {
        setStyleValues(info.computedStyle);
      }
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

// 2. 属性変更を送信
const handleAttributeSave = (key: string) => {
  if (!selectedElement?.nodeId) return;

  const iframe = document.querySelector('iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'UPDATE_ATTRIBUTE',
      payload: {
        nodeId: selectedElement.nodeId,
        attribute: key,
        value: attributeValues[key]
      }
    }, '*');
  }
};

// 3. スタイル変更を送信
const handleStyleChange = (property: string, value: string) => {
  const newStyles = { ...styleValues, [property]: value };
  setStyleValues(newStyles);

  if (selectedElement?.nodeId) {
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      const styleString = Object.entries(newStyles)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');

      iframe.contentWindow.postMessage({
        type: 'UPDATE_ATTRIBUTE',
        payload: {
          nodeId: selectedElement.nodeId,
          attribute: 'style',
          value: styleString
        }
      }, '*');
    }
  }
};
```

---

## 3. レイアウト実装

### 3.1 LayoutApplier

**ファイル**: `apps/web/lib/layout/layoutApplier.ts`

#### 核心ポイント

1. **レイアウト設定の適用方法**
   - `style`属性: 文字列形式（`display: flex; flex-direction: column; ...`）
   - `className`属性: Tailwindクラス（`flex flex-col items-center ...`）

2. **既存スタイル/クラスの削除**
   - レイアウト関連のスタイル/クラスを削除してから追加
   - レイアウト関連の判定:
     - スタイル: `display`, `flex-direction`, `flex-wrap`, `align-items`, `justify-content`, `gap`, `grid-template-columns`, etc.
     - クラス: `flex`, `grid`, `flex-col`, `flex-row`, `items-start`, `justify-center`, `gap-*`, etc.

3. **Tailwindクラスへの変換**
   - Flex: `flex flex-col items-center justify-center gap-4`
   - Grid: `grid grid-cols-3 gap-4`

#### 実装の流れ

```typescript
export function applyLayoutConfig(
  file: SourceFile,
  element: JsxElement | JsxSelfClosingElement,
  config: LayoutConfig
): boolean {
  const applyMethod = config.applyMethod || 'style';

  if (applyMethod === 'style') {
    // style属性で適用
    const existingStyle = getExistingStyleString(element);

    // 既存のstyle属性からレイアウト関連のスタイルを削除
    let newStyleString = existingStyle || '';
    if (existingStyle) {
      const layoutStyles = [
        'display', 'flex-direction', 'flex-wrap',
        'align-items', 'justify-content', 'gap',
        'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-auto-flow',
      ];

      const styles = existingStyle.split(';').map(s => s.trim()).filter(s => s);
      const filteredStyles = styles.filter(style => {
        const prop = style.split(':')[0].trim();
        return !layoutStyles.includes(prop);
      });

      newStyleString = filteredStyles.join('; ');
    }

    // 新しいレイアウトスタイルを追加
    const layoutStyleString = layoutConfigToStyleString(config);
    newStyleString = newStyleString
      ? `${newStyleString}; ${layoutStyleString}`
      : layoutStyleString;

    // style属性を更新
    setJsxAttribute(element, 'style', newStyleString);
  } else {
    // className属性で適用（Tailwind）
    const existingClassName = getExistingClassName(element);

    // 既存のclassNameからレイアウト関連のクラスを削除
    let existingClasses: string[] = [];
    if (existingClassName) {
      existingClasses = existingClassName.split(' ').filter(c => c.trim());
    }

    const filteredClasses = existingClasses.filter(c => !isLayoutClass(c));

    // 新しいレイアウトクラスを追加
    const layoutClasses = layoutConfigToTailwindClasses(config);
    const newClasses = [...filteredClasses, ...layoutClasses.split(' ').filter(c => c.trim())].filter(c => c);
    const newClassName = newClasses.join(' ');

    // className属性を更新
    setJsxAttribute(element, 'className', newClassName);
  }

  return true;
}
```

---

## 4. VSCode拡張（Phase 7）への適用方針

### 4.1 ドラッグ&ドロップ

**現在のPhase 7実装との違い**:

1. **要素識別**
   - OSS前: `data-nodeid`属性（TSXソース由来）
   - Phase 7: `StableElementIdService`（WeakMap + domPath + AST Locator）
   - **適用**: `StableElementIdService`を使用しつつ、`data-nodeid`も参照可能にする

2. **Slot Preview**
   - OSS前: 境界に細い青線（Figmaライク）
   - Phase 7: 選択枠のみ
   - **適用**: Slot Previewを追加実装

3. **DropIntent解決**
   - OSS前: 2段階アーキテクチャ（DOMHitTest → VisualDropHint → StructuralDropIntent）
   - Phase 7: 未実装
   - **適用**: DropIntent解決ロジックを追加実装

4. **Sticky Parent（reorder mode）**
   - OSS前: ドラッグ開始時に`reorder`/`move`を決定
   - Phase 7: 未実装
   - **適用**: `LayoutInteractionController`に`reorder`モードを追加

### 4.2 プロパティ編集

**現在のPhase 7実装との違い**:

1. **PropertyPanel**
   - OSS前: `UnifiedPropertiesPanel`（属性・スタイル・テキスト編集）
   - Phase 7: 未実装
   - **適用**: `PropertyPanel.tsx`を実装（右サイドバー）

2. **属性編集**
   - OSS前: `UPDATE_ATTRIBUTE`メッセージを送信
   - Phase 7: `SET_PROPERTY` UI操作ASTを生成
   - **適用**: `SET_PROPERTY` UI操作ASTを生成し、ChangePlanに変換

3. **スタイル編集**
   - OSS前: リアルタイムで`UPDATE_ATTRIBUTE`メッセージを送信
   - Phase 7: `VirtualStyleResolver`で仮想スタイルを合成
   - **適用**: `VirtualStyleResolver`を使用しつつ、PropertyPanelから編集可能にする

### 4.3 レイアウト

**現在のPhase 7実装との違い**:

1. **レイアウト適用**
   - OSS前: `applyLayoutConfig`でASTに直接適用
   - Phase 7: 未実装
   - **適用**: ChangePlan生成時にレイアウト設定をASTに適用するロジックを追加

2. **Tailwind対応**
   - OSS前: `layoutConfigToTailwindClasses`でTailwindクラスに変換
   - Phase 7: 未実装
   - **適用**: ChangePlan生成時にTailwindクラスを生成するロジックを追加

---

## 5. 実装優先順位

### Phase 7.1: ドラッグ&ドロップ（基本）

1. ✅ **Slot Preview表示**（境界に細い青線）
2. ✅ **DropIntent解決**（2段階アーキテクチャ）
3. ✅ **Sticky Parent（reorder mode）**

### Phase 7.2: プロパティ編集

1. ✅ **PropertyPanel実装**（右サイドバー）
2. ✅ **属性編集**（`SET_PROPERTY` UI操作AST）
3. ✅ **スタイル編集**（`VirtualStyleResolver`統合）

### Phase 7.3: レイアウト

1. ✅ **レイアウト適用**（ChangePlan生成時にAST適用）
2. ✅ **Tailwind対応**（`layoutConfigToTailwindClasses`）

---

## 6. 重要な設計原則

### 6.1 非破壊性

- **Preview DOMは一切変更しない**
- すべての操作はUI操作ASTとして記録
- 仮想スタイルはOverlay上のみで可視化

### 6.2 コードが唯一のSource of Truth

- **DOM操作は禁止**
- すべての変更はAST操作として記録
- ChangePlan生成時にASTに適用

### 6.3 安定性

- **エラーが起きてもPreviewは消えない**
- UI操作レイヤーは完全に分離
- try/catchで安全に隔離

---

## 7. 次のステップ

1. **Slot Preview実装**（Phase 7.1）
2. **PropertyPanel実装**（Phase 7.2）
3. **レイアウト適用ロジック**（Phase 7.3）

