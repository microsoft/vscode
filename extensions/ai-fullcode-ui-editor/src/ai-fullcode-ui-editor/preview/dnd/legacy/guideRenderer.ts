/// <reference lib="dom" />

/**
 * Guide Renderer（slot -> guide DOM）
 *
 * slot.renderGuideRect のみでガイド描画（fallback 禁止）
 */

import { Slot } from './types';
import { debugLog } from './types';

/**
 * Guide 要素（DOM）
 */
export interface GuideElement {
  /** ガイド線要素 */
  lineElement: HTMLElement | null;

  /** ガイドボックス要素（Grid inside の場合） */
  boxElement: HTMLElement | null;
}

/**
 * GuideRenderer
 */
export class GuideRenderer {
  private currentGuide: GuideElement | null = null;

  /**
   * ガイドを描画
   *
   * @param slot Slot
   * @returns GuideElement
   */
  render(slot: Slot | null): GuideElement {
    // 既存のガイドを削除
    this.clear();

    if (!slot || !slot.renderGuideRect) {
      debugLog('GUIDE', 'no slot or renderGuideRect');
      return { lineElement: null, boxElement: null };
    }

    const rect = slot.renderGuideRect;

    // Grid inside の場合は box、それ以外は line
    if (slot.kind === 'grid' && slot.targetRow && slot.targetCol) {
      // Grid inside: box highlight
      const doc = (globalThis as any).document;
      if (!doc) {
        return { lineElement: null, boxElement: null };
      }
      const boxElement = doc.createElement('div');
      boxElement.className = 'drop-guide-box';
      boxElement.setAttribute('data-ignore', 'true');
      boxElement.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        border: 2px solid rgba(59, 130, 246, 0.8);
        background-color: rgba(59, 130, 246, 0.1);
        box-sizing: border-box;
      `;
      (doc.body || doc.documentElement).appendChild(boxElement);

      this.currentGuide = { lineElement: null, boxElement };
      debugLog('GUIDE', 'grid box rendered', { rect });
      return this.currentGuide;
    } else {
      // Grid gap / Flex gap: line
      const doc = (globalThis as any).document;
      if (!doc) {
        return { lineElement: null, boxElement: null };
      }
      const lineElement = doc.createElement('div');
      lineElement.className = 'drop-guide-line';
      lineElement.setAttribute('data-ignore', 'true');
      lineElement.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background-color: rgba(59, 130, 246, 0.8);
        box-sizing: border-box;
      `;
      (doc.body || doc.documentElement).appendChild(lineElement);

      this.currentGuide = { lineElement, boxElement: null };
      debugLog('GUIDE', 'line rendered', { rect, kind: slot.kind });
      return this.currentGuide;
    }
  }

  /**
   * ガイドをクリア
   */
  clear(): void {
    if (this.currentGuide) {
      if (this.currentGuide.lineElement && (this.currentGuide.lineElement as any).parentNode) {
        (this.currentGuide.lineElement as any).parentNode.removeChild(this.currentGuide.lineElement);
      }
      if (this.currentGuide.boxElement && (this.currentGuide.boxElement as any).parentNode) {
        (this.currentGuide.boxElement as any).parentNode.removeChild(this.currentGuide.boxElement);
      }
      this.currentGuide = null;
    }
  }
}

