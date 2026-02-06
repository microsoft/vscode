/**
 * Grid Hit Test（mouse -> row/col 判定）
 *
 * マウス位置から Grid の行/列を判定し、境界 band の rect も返す
 */

import { Rect, Slot } from '../dnd/types';
import { GridMetrics, GridBoundary } from './gridMetrics';
import { debugLog } from '../dnd/types';

/**
 * Grid Hit Test 結果
 */
export interface GridHitTestResult {
  /** ターゲット行インデックス（1-based） */
  targetRow: number;

  /** ターゲット列インデックス（1-based） */
  targetCol: number;

  /** ガイド描画用の Rect */
  renderGuideRect: Rect;
}

/**
 * Grid の hit-test を実行
 *
 * @param mouseX マウス X 座標
 * @param mouseY マウス Y 座標
 * @param metrics Grid Metrics
 * @returns GridHitTestResult または null
 */
export function hitTestGrid(
  mouseX: number,
  mouseY: number,
  metrics: GridMetrics
): GridHitTestResult | null {
  // 境界の hit-test を優先
  const columnBoundary = hitTestColumnBoundary(mouseX, mouseY, metrics);
  if (columnBoundary) {
    debugLog('GRID_HIT', 'Column boundary hit', {
      index: columnBoundary.index,
      targetCol: columnBoundary.targetCol,
      targetRow: columnBoundary.targetRow,
    });

    // ✅ Phase 5: renderGuideRect は必須（fallback 禁止）
    if (!columnBoundary.renderGuideRect) {
      console.error('[GridHitTest] ❌ columnBoundary.renderGuideRect is required');
      return null;
    }

    return {
      targetRow: columnBoundary.targetRow || 1,
      targetCol: columnBoundary.targetCol || 1,
      renderGuideRect: columnBoundary.renderGuideRect,
    };
  }

  const rowBoundary = hitTestRowBoundary(mouseX, mouseY, metrics);
  if (rowBoundary) {
    debugLog('GRID_HIT', 'Row boundary hit', {
      index: rowBoundary.index,
      targetRow: rowBoundary.targetRow,
      targetCol: rowBoundary.targetCol,
    });

    // ✅ Phase 5: renderGuideRect は必須（fallback 禁止）
    if (!rowBoundary.renderGuideRect) {
      console.error('[GridHitTest] ❌ rowBoundary.renderGuideRect is required');
      return null;
    }

    return {
      targetRow: rowBoundary.targetRow || 1,
      targetCol: rowBoundary.targetCol || 1,
      renderGuideRect: rowBoundary.renderGuideRect,
    };
  }

  // 境界にヒットしない場合は、セル内を判定
  return hitTestGridCell(mouseX, mouseY, metrics);
}

/**
 * 列境界の hit-test
 */
function hitTestColumnBoundary(
  mouseX: number,
  mouseY: number,
  metrics: GridMetrics
): GridBoundary | null {
  for (const boundary of metrics.columnBoundaries) {
    const rect = boundary.hitTestRect;
    if (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    ) {
      // Row band 内か確認
      if (boundary.rowBand) {
        if (mouseY >= boundary.rowBand.start && mouseY <= boundary.rowBand.end) {
          return boundary;
        }
      } else {
        return boundary;
      }
    }
  }
  return null;
}

/**
 * 行境界の hit-test
 */
function hitTestRowBoundary(
  mouseX: number,
  mouseY: number,
  metrics: GridMetrics
): GridBoundary | null {
  for (const boundary of metrics.rowBoundaries) {
    const rect = boundary.hitTestRect;
    if (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    ) {
      // Column band 内か確認
      if (boundary.columnBand) {
        if (mouseX >= boundary.columnBand.start && mouseX <= boundary.columnBand.end) {
          return boundary;
        }
      } else {
        return boundary;
      }
    }
  }
  return null;
}

/**
 * Grid セル内の hit-test
 */
function hitTestGridCell(
  mouseX: number,
  mouseY: number,
  metrics: GridMetrics
): GridHitTestResult | null {
  // どの行にいるか
  let targetRow = 1;
  for (let i = 0; i < metrics.rowTracks.length; i++) {
    const track = metrics.rowTracks[i];
    if (mouseY >= track.start && mouseY <= track.end) {
      targetRow = i + 1; // 1-based
      break;
    }
    if (mouseY < track.start) {
      targetRow = i + 1;
      break;
    }
    if (i === metrics.rowTracks.length - 1 && mouseY > track.end) {
      targetRow = i + 2;
      break;
    }
  }

  // どの列にいるか
  let targetCol = 1;
  for (let i = 0; i < metrics.columnTracks.length; i++) {
    const track = metrics.columnTracks[i];
    if (mouseX >= track.start && mouseX <= track.end) {
      targetCol = i + 1; // 1-based
      break;
    }
    if (mouseX < track.start) {
      targetCol = i + 1;
      break;
    }
    if (i === metrics.columnTracks.length - 1 && mouseX > track.end) {
      targetCol = i + 2;
      break;
    }
  }

  // セルの Rect を計算
  const rowTrack = metrics.rowTracks[targetRow - 1];
  const colTrack = metrics.columnTracks[targetCol - 1];

  if (!rowTrack || !colTrack) {
    return null;
  }

  const renderGuideRect: Rect = {
    left: colTrack.start,
    top: rowTrack.start,
    width: colTrack.size,
    height: rowTrack.size,
    right: colTrack.end,
    bottom: rowTrack.end,
  };

  debugLog('GRID_HIT', 'Cell hit', {
    targetRow,
    targetCol,
    renderGuideRect,
  });

  return {
    targetRow,
    targetCol,
    renderGuideRect,
  };
}

