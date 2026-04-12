/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { ensureNonNullable } from '../gpuUtils.js';
/**
 * The shelf allocator is a simple allocator that places glyphs in rows, starting a new row when the
 * current row is full. Due to its simplicity, it can waste space but it is very fast.
 */
export class TextureAtlasShelfAllocator {
    constructor(_canvas, _textureIndex) {
        this._canvas = _canvas;
        this._textureIndex = _textureIndex;
        this._currentRow = {
            x: 0,
            y: 0,
            h: 0
        };
        /** A set of all glyphs allocated, this is only tracked to enable debug related functionality */
        this._allocatedGlyphs = new Set();
        this._nextIndex = 0;
        this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
            willReadFrequently: true
        }));
    }
    allocate(rasterizedGlyph) {
        // The glyph does not fit into the atlas page
        const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
        const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
        if (glyphWidth > this._canvas.width || glyphHeight > this._canvas.height) {
            throw new BugIndicatingError('Glyph is too large for the atlas page');
        }
        // Finalize and increment row if it doesn't fix horizontally
        if (rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1 > this._canvas.width - this._currentRow.x) {
            this._currentRow.x = 0;
            this._currentRow.y += this._currentRow.h;
            this._currentRow.h = 1;
        }
        // Return undefined if there isn't any room left
        if (this._currentRow.y + rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1 > this._canvas.height) {
            return undefined;
        }
        // Draw glyph
        this._ctx.drawImage(rasterizedGlyph.source, 
        // source
        rasterizedGlyph.boundingBox.left, rasterizedGlyph.boundingBox.top, glyphWidth, glyphHeight, 
        // destination
        this._currentRow.x, this._currentRow.y, glyphWidth, glyphHeight);
        // Create glyph object
        const glyph = {
            pageIndex: this._textureIndex,
            glyphIndex: this._nextIndex++,
            x: this._currentRow.x,
            y: this._currentRow.y,
            w: glyphWidth,
            h: glyphHeight,
            originOffsetX: rasterizedGlyph.originOffset.x,
            originOffsetY: rasterizedGlyph.originOffset.y,
            fontBoundingBoxAscent: rasterizedGlyph.fontBoundingBoxAscent,
            fontBoundingBoxDescent: rasterizedGlyph.fontBoundingBoxDescent,
        };
        // Shift current row
        this._currentRow.x += glyphWidth;
        this._currentRow.h = Math.max(this._currentRow.h, glyphHeight);
        // Set the glyph
        this._allocatedGlyphs.add(glyph);
        return glyph;
    }
    getUsagePreview() {
        const w = this._canvas.width;
        const h = this._canvas.height;
        const canvas = new OffscreenCanvas(w, h);
        const ctx = ensureNonNullable(canvas.getContext('2d'));
        ctx.fillStyle = "#808080" /* UsagePreviewColors.Unused */;
        ctx.fillRect(0, 0, w, h);
        const rowHeight = new Map(); // y -> h
        const rowWidth = new Map(); // y -> w
        for (const g of this._allocatedGlyphs) {
            rowHeight.set(g.y, Math.max(rowHeight.get(g.y) ?? 0, g.h));
            rowWidth.set(g.y, Math.max(rowWidth.get(g.y) ?? 0, g.x + g.w));
        }
        for (const g of this._allocatedGlyphs) {
            ctx.fillStyle = "#4040FF" /* UsagePreviewColors.Used */;
            ctx.fillRect(g.x, g.y, g.w, g.h);
            ctx.fillStyle = "#FF0000" /* UsagePreviewColors.Wasted */;
            ctx.fillRect(g.x, g.y + g.h, g.w, rowHeight.get(g.y) - g.h);
        }
        for (const [rowY, rowW] of rowWidth.entries()) {
            if (rowY !== this._currentRow.y) {
                ctx.fillStyle = "#FF0000" /* UsagePreviewColors.Wasted */;
                ctx.fillRect(rowW, rowY, w - rowW, rowHeight.get(rowY));
            }
        }
        return canvas.convertToBlob();
    }
    getStats() {
        const w = this._canvas.width;
        const h = this._canvas.height;
        let usedPixels = 0;
        let wastedPixels = 0;
        const totalPixels = w * h;
        const rowHeight = new Map(); // y -> h
        const rowWidth = new Map(); // y -> w
        for (const g of this._allocatedGlyphs) {
            rowHeight.set(g.y, Math.max(rowHeight.get(g.y) ?? 0, g.h));
            rowWidth.set(g.y, Math.max(rowWidth.get(g.y) ?? 0, g.x + g.w));
        }
        for (const g of this._allocatedGlyphs) {
            usedPixels += g.w * g.h;
            wastedPixels += g.w * (rowHeight.get(g.y) - g.h);
        }
        for (const [rowY, rowW] of rowWidth.entries()) {
            if (rowY !== this._currentRow.y) {
                wastedPixels += (w - rowW) * rowHeight.get(rowY);
            }
        }
        return [
            `page${this._textureIndex}:`,
            `     Total: ${totalPixels} (${w}x${h})`,
            `      Used: ${usedPixels} (${((usedPixels / totalPixels) * 100).toPrecision(2)}%)`,
            `    Wasted: ${wastedPixels} (${((wastedPixels / totalPixels) * 100).toPrecision(2)}%)`,
            `Efficiency: ${((usedPixels / (usedPixels + wastedPixels)) * 100).toPrecision(2)}%`,
        ].join('\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVyZUF0bGFzU2hlbGZBbGxvY2F0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9ncHUvYXRsYXMvdGV4dHVyZUF0bGFzU2hlbGZBbGxvY2F0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFJbkQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLDBCQUEwQjtJQWV0QyxZQUNrQixPQUF3QixFQUN4QixhQUFxQjtRQURyQixZQUFPLEdBQVAsT0FBTyxDQUFpQjtRQUN4QixrQkFBYSxHQUFiLGFBQWEsQ0FBUTtRQWIvQixnQkFBVyxHQUF1QjtZQUN6QyxDQUFDLEVBQUUsQ0FBQztZQUNKLENBQUMsRUFBRSxDQUFDO1lBQ0osQ0FBQyxFQUFFLENBQUM7U0FDSixDQUFDO1FBRUYsZ0dBQWdHO1FBQy9FLHFCQUFnQixHQUEwQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRTdFLGVBQVUsR0FBRyxDQUFDLENBQUM7UUFNdEIsSUFBSSxDQUFDLElBQUksR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUU7WUFDM0Qsa0JBQWtCLEVBQUUsSUFBSTtTQUN4QixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTSxRQUFRLENBQUMsZUFBaUM7UUFDaEQsNkNBQTZDO1FBQzdDLE1BQU0sVUFBVSxHQUFHLGVBQWUsQ0FBQyxXQUFXLENBQUMsS0FBSyxHQUFHLGVBQWUsQ0FBQyxXQUFXLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUM1RixNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsV0FBVyxDQUFDLE1BQU0sR0FBRyxl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