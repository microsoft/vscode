/// <reference lib="dom" />

/**
 * Grid Metrics（Grid track/boundary 算出）
 *
 * Grid の実測メトリクスを生成（DOM実測優先）
 */

import { Rect } from '../dnd/types';

/**
 * Grid Track（行/列のトラック情報）
 */
export interface GridTrack {
  /** トラックインデックス（0-based） */
  index: number;

  /** トラックの開始位置（px） */
  start: number;

  /** トラックの終了位置（px） */
  end: number;

  /** トラックのサイズ（px） */
  size: number;
}

/**
 * Grid Boundary（行/列の境界情報）
 */
export interface GridBoundary {
  /** 境界の種類（'row' | 'column'） */
  axis: 'row' | 'column';

  /** 境界インデックス（0-based、0 = 最初の境界） */
  index: number;

  /** 境界の位置（px） */
  position: number;

  /** 境界の hit-test 範囲（tolerance を含む） */
  hitTestRect: Rect;

  /** 境界のガイド描画範囲（track band の範囲のみ、必須） */
  renderGuideRect: Rect;

  /** Row band（column boundary の場合） */
  rowBand?: { start: number; end: number };

  /** Column band（row boundary の場合） */
  columnBand?: { start: number; end: number };

  /** ターゲット行インデックス（1-based、column boundary の場合） */
  targetRow?: number;

  /** ターゲット列インデックス（1-based、row boundary の場合） */
  targetCol?: number;
}

/**
 * Grid Metrics（Grid 全体のメトリクス）
 */
export interface GridMetrics {
  /** Grid コンテナの Rect */
  gridRect: Rect;

  /** 行トラック */
  rowTracks: GridTrack[];

  /** 列トラック */
  columnTracks: GridTrack[];

  /** 行境界 */
  rowBoundaries: GridBoundary[];

  /** 列境界 */
  columnBoundaries: GridBoundary[];

  /** 行間の gap（px） */
  rowGap: number;

  /** 列間の gap（px） */
  columnGap: number;
}

/**
 * Grid track を計算
 *
 * @param templateValue gridTemplateRows または gridTemplateColumns の値
 * @param containerSize コンテナのサイズ（width または height）
 * @param gap gap のサイズ（px）
 * @param containerStart コンテナの開始位置（left または top）
 * @returns GridTrack 配列
 */
export function computeGridTracks(
  templateValue: string,
  containerSize: number,
  gap: number,
  containerStart: number
): GridTrack[] {
  const tracks: GridTrack[] = [];

  if (!templateValue || templateValue.trim() === '') {
    // デフォルト: 1トラック
    tracks.push({
      index: 0,
      start: containerStart,
      end: containerStart + containerSize,
      size: containerSize,
    });
    return tracks;
  }

  // repeat() を展開
  const expanded = expandRepeat(templateValue);

  // トラックサイズをパース
  const trackSizes = parseTrackSizes(expanded, containerSize, gap);

  // トラック位置を計算
  let currentPos = containerStart;
  trackSizes.forEach((size, index) => {
    tracks.push({
      index,
      start: currentPos,
      end: currentPos + size,
      size,
    });
    currentPos += size + gap;
  });

  return tracks;
}

/**
 * repeat() を展開
 */
function expandRepeat(templateValue: string): string {
  // repeat(3, 100px) -> 100px 100px 100px
  const repeatPattern = /repeat\s*\(\s*(\d+)\s*,\s*([^)]+)\s*\)/g;
  return templateValue.replace(repeatPattern, (_, count, value) => {
    const repeatCount = parseInt(count, 10);
    return Array(repeatCount).fill(value.trim()).join(' ');
  });
}

/**
 * トラックサイズをパース
 */
function parseTrackSizes(
  expanded: string,
  containerSize: number,
  gap: number
): number[] {
  const parts = expanded.trim().split(/\s+/);
  const sizes: number[] = [];

  let frTotal = 0;
  const frIndices: number[] = [];
  let fixedTotal = 0;

  // 1回目: fr と固定値を分離
  parts.forEach((part, index) => {
    if (part.endsWith('fr')) {
      const frValue = parseFloat(part);
      frTotal += frValue;
      frIndices.push(index);
      sizes.push(0); // 仮の値
    } else if (part === 'auto') {
      sizes.push(100); // 仮の値（後で調整）
      fixedTotal += 100;
    } else {
      // px, em, rem など
      const pxValue = parseSizeToPx(part);
      sizes.push(pxValue);
      fixedTotal += pxValue;
    }
  });

  // 2回目: fr を計算
  if (frTotal > 0) {
    const gapTotal = gap * (parts.length - 1);
    const availableSize = containerSize - fixedTotal - gapTotal;
    const frUnit = availableSize / frTotal;

    frIndices.forEach(index => {
      const frValue = parseFloat(parts[index]);
      sizes[index] = frUnit * frValue;
    });
  }

  return sizes;
}

/**
 * サイズを px に変換
 */
function parseSizeToPx(size: string): number {
  if (size.endsWith('px')) {
    return parseFloat(size);
  }
  // em, rem, % などは簡易的に処理（実際の実装ではより詳細に）
  const numeric = parseFloat(size);
  return isNaN(numeric) ? 100 : numeric;
}

/**
 * Grid Metrics を計算
 *
 * @param gridElement Grid コンテナの DOM要素
 * @returns GridMetrics
 */
export function computeGridMetrics(gridElement: HTMLElement): GridMetrics {
  const gridRect = (gridElement as any).getBoundingClientRect();
  const style = (globalThis as any).window?.getComputedStyle?.(gridElement) || (gridElement as any).ownerDocument?.defaultView?.getComputedStyle?.(gridElement);
  if (!style) {
    throw new Error('Cannot get computed style');
  }

  const gridTemplateColumns = style.gridTemplateColumns || '';
  const gridTemplateRows = style.gridTemplateRows || '';
  const columnGap = parseFloat(style.columnGap || '0');
  const rowGap = parseFloat(style.rowGap || '0');

  // トラックを計算
  const columnTracks = computeGridTracks(
    gridTemplateColumns,
    gridRect.width,
    columnGap,
    gridRect.left
  );

  const rowTracks = computeGridTracks(
    gridTemplateRows,
    gridRect.height,
    rowGap,
    gridRect.top
  );

  // 境界を計算
  const columnBoundaries = computeColumnBoundaries(
    columnTracks,
    rowTracks,
    columnGap,
    gridRect
  );

  const rowBoundaries = computeRowBoundaries(
    rowTracks,
    columnTracks,
    rowGap,
    gridRect
  );

  return {
    gridRect: {
      left: gridRect.left,
      top: gridRect.top,
      width: gridRect.width,
      height: gridRect.height,
      right: gridRect.right,
      bottom: gridRect.bottom,
    },
    rowTracks,
    columnTracks,
    rowBoundaries,
    columnBoundaries,
    rowGap,
    columnGap,
  };
}

/**
 * 列境界を計算
 */
function computeColumnBoundaries(
  columnTracks: GridTrack[],
  rowTracks: GridTrack[],
  columnGap: number,
  gridRect: DOMRect
): GridBoundary[] {
  const boundaries: GridBoundary[] = [];
  const HIT_TEST_TOLERANCE = 8; // px

  for (let i = 0; i < columnTracks.length - 1; i++) {
    const track1 = columnTracks[i];
    const track2 = columnTracks[i + 1];
    const boundaryX = track1.end + columnGap / 2;

    // Row band を計算（全行をカバー）
    const rowBand = rowTracks.length > 0
      ? { start: rowTracks[0].start, end: rowTracks[rowTracks.length - 1].end }
      : { start: gridRect.top, end: gridRect.bottom };

    // Hit-test rect
    const hitTestRect: Rect = {
      left: boundaryX - HIT_TEST_TOLERANCE,
      top: rowBand.start,
      width: HIT_TEST_TOLERANCE * 2,
      height: rowBand.end - rowBand.start,
      right: boundaryX + HIT_TEST_TOLERANCE,
      bottom: rowBand.end,
    };

    // ✅ Phase 5: Render guide rect（track band の範囲のみ、必須）
    const renderGuideRect: Rect = {
      left: boundaryX - 1,
      top: rowBand.start,
      width: 2,
      height: rowBand.end - rowBand.start,
      right: boundaryX + 1,
      bottom: rowBand.end,
    };

    boundaries.push({
      axis: 'column',
      index: i,
      position: boundaryX,
      hitTestRect,
      renderGuideRect,
      rowBand,
      targetCol: i + 2, // 1-based（境界の右側）
    });
  }

  return boundaries;
}

/**
 * 行境界を計算
 */
function computeRowBoundaries(
  rowTracks: GridTrack[],
  columnTracks: GridTrack[],
  rowGap: number,
  gridRect: DOMRect
): GridBoundary[] {
  const boundaries: GridBoundary[] = [];
  const HIT_TEST_TOLERANCE = 8; // px

  for (let i = 0; i < rowTracks.length - 1; i++) {
    const track1 = rowTracks[i];
    const track2 = rowTracks[i + 1];
    const boundaryY = track1.end + rowGap / 2;

    // Column band を計算（全列をカバー）
    const columnBand = columnTracks.length > 0
      ? { start: columnTracks[0].start, end: columnTracks[columnTracks.length - 1].end }
      : { start: gridRect.left, end: gridRect.right };

    // Hit-test rect
    const hitTestRect: Rect = {
      left: columnBand.start,
      top: boundaryY - HIT_TEST_TOLERANCE,
      width: columnBand.end - columnBand.start,
      height: HIT_TEST_TOLERANCE * 2,
      right: columnBand.end,
      bottom: boundaryY + HIT_TEST_TOLERANCE,
    };

    // ✅ Phase 5: Render guide rect（track band の範囲のみ、必須）
    const renderGuideRect: Rect = {
      left: columnBand.start,
      top: boundaryY - 1,
      width: columnBand.end - columnBand.start,
      height: 2,
      right: columnBand.end,
      bottom: boundaryY + 1,
    };

    boundaries.push({
      axis: 'row',
      index: i,
      position: boundaryY,
      hitTestRect,
      renderGuideRect,
      columnBand,
      targetRow: i + 2, // 1-based（境界の下側）
    });
  }

  return boundaries;
}

