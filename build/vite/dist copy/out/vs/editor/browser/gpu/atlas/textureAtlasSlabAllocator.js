/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { NKeyMap } from '../../../../base/common/map.js';
import { ensureNonNullable } from '../gpuUtils.js';
/**
 * The slab allocator is a more complex allocator that places glyphs in square slabs of a fixed
 * size. Slabs are defined by a small range of glyphs sizes they can house, this places like-sized
 * glyphs in the same slab which reduces wasted space.
 *
 * Slabs also may contain "unused" regions on the left and bottom depending on the size of the
 * glyphs they include. This space is used to place very thin or short glyphs, which would otherwise
 * waste a lot of space in their own slab.
 */
export class TextureAtlasSlabAllocator {
    constructor(_canvas, _textureIndex, options) {
        this._canvas = _canvas;
        this._textureIndex = _textureIndex;
        this._slabs = [];
        this._activeSlabsByDims = new NKeyMap();
        this._unusedRects = [];
        this._openRegionsByHeight = new Map();
        this._openRegionsByWidth = new Map();
        /** A set of all glyphs allocated, this is only tracked to enable debug related functionality */
        this._allocatedGlyphs = new Set();
        this._nextIndex = 0;
        this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
            willReadFrequently: true
        }));
        this._slabW = Math.min(options?.slabW ?? (64 << Math.max(Math.floor(getActiveWindow().devicePixelRatio) - 1, 0)), this._canvas.width);
        this._slabH = Math.min(options?.slabH ?? this._slabW, this._canvas.height);
        this._slabsPerRow = Math.floor(this._canvas.width / this._slabW);
        this._slabsPerColumn = Math.floor(this._canvas.height / this._slabH);
    }
    allocate(rasterizedGlyph) {
        // Find ideal slab, creating it if there is none suitable
        const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
        const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
        // The glyph does not fit into the atlas page, glyphs should never be this large in practice
        if (glyphWidth > this._canvas.width || glyphHeight > this._canvas.height) {
            throw new BugIndicatingError('Glyph is too large for the atlas page');
        }
        // The glyph does not fit into a slab
        if (glyphWidth > this._slabW || glyphHeight > this._slabH) {
            // Only if this is the allocator's first glyph, resize the slab size to fit the glyph.
            if (this._allocatedGlyphs.size > 0) {
                return undefined;
            }
            // Find the largest power of 2 devisor that the glyph fits into, this ensure there is no
            // wasted space outside the allocated slabs.
            let sizeCandidate = this._canvas.width;
            while (glyphWidth < sizeCandidate / 2 && glyphHeight < sizeCandidate / 2) {
                sizeCandidate /= 2;
            }
            this._slabW = sizeCandidate;
            this._slabH = sizeCandidate;
            this._slabsPerRow = Math.floor(this._canvas.width / this._slabW);
            this._slabsPerColumn = Math.floor(this._canvas.height / this._slabH);
        }
        // const dpr = getActiveWindow().devicePixelRatio;
        // TODO: Include font size as well as DPR in nearestXPixels calculation
        // Round slab glyph dimensions to the nearest x pixels, where x scaled with device pixel ratio
        // const nearestXPixels = Math.max(1, Math.floor(dpr / 0.5));
        // const nearestXPixels = Math.max(1, Math.floor(dpr));
        const desiredSlabSize = {
            // Nearest square number
            // TODO: This can probably be optimized
            // w: 1 << Math.ceil(Math.sqrt(glyphWidth)),
            // h: 1 << Math.ceil(Math.sqrt(glyphHeight)),
            // Nearest x px
            // w: Math.ceil(glyphWidth / nearestXPixels) * nearestXPixels,
            // h: Math.ceil(glyphHeight / nearestXPixels) * nearestXPixels,
            // Round odd numbers up
            // w: glyphWidth % 0 === 1 ? glyphWidth + 1 : glyphWidth,
            // h: glyphHeight % 0 === 1 ? glyphHeight + 1 : glyphHeight,
            // Exact number only
            w: glyphWidth,
            h: glyphHeight,
        };
        // Get any existing slab
        let slab = this._activeSlabsByDims.get(desiredSlabSize.w, desiredSlabSize.h);
        // Check if the slab is full
        if (slab) {
            const glyphsPerSlab = Math.floor(this._slabW / slab.entryW) * Math.floor(this._slabH / slab.entryH);
            if (slab.count >= glyphsPerSlab) {
                slab = undefined;
            }
        }
        let dx;
        let dy;
        // Search for suitable space in unused rectangles
        if (!slab) {
            // Only check availability for the smallest side
            if (glyphWidth < glyphHeight) {
                const openRegions = this._openRegionsByWidth.get(glyphWidth);
                if (openRegions?.length) {
                    // TODO: Don't search everything?
                    // Search from the end so we can typically pop it off the stack
                    for (let i = openRegions.length - 1; i >= 0; i--) {
                        const r = openRegions[i];
                        if (r.w >= glyphWidth && r.h >= glyphHeight) {
                            dx = r.x;
                            dy = r.y;
                            if (glyphWidth < r.w) {
                                this._unusedRects.push({
                                    x: r.x + glyphWidth,
                                    y: r.y,
                                    w: r.w - glyphWidth,
                                    h: glyphHeight
                                });
                            }
                            r.y += glyphHeight;
                            r.h -= glyphHeight;
                            if (r.h === 0) {
                                if (i === openRegions.length - 1) {
                                    openRegions.pop();
                                }
                                else {
                                    this._unusedRects.splice(i, 1);
                                }
                            }
                            break;
                        }
                    }
                }
            }
            else {
                const openRegions = this._openRegionsByHeight.get(glyphHeight);
                if (openRegions?.length) {
                    // TODO: Don't search everything?
                    // Search from the end so we can typically pop it off the stack
                    for (let i = openRegions.length - 1; i >= 0; i--) {
                        const r = openRegions[i];
                        if (r.w >= glyphWidth && r.h >= glyphHeight) {
                            dx = r.x;
                            dy = r.y;
                            if (glyphHeight < r.h) {
                                this._unusedRects.push({
                                    x: r.x,
                                    y: r.y + glyphHeight,
                                    w: glyphWidth,
                                    h: r.h - glyphHeight
                                });
                            }
                            r.x += glyphWidth;
                            r.w -= glyphWidth;
                            if (r.h === 0) {
                                if (i === openRegions.length - 1) {
                                    openRegions.pop();
                                }
                                else {
                                    this._unusedRects.splice(i, 1);
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }
        // Create a new slab
        if (dx === undefined || dy === undefined) {
            if (!slab) {
                if (this._slabs.length >= this._slabsPerRow * this._slabsPerColumn) {
                    return undefined;
                }
                slab = {
                    x: Math.floor(this._slabs.length % this._slabsPerRow) * this._slabW,
                    y: Math.floor(this._slabs.length / this._slabsPerRow) * this._slabH,
                    entryW: desiredSlabSize.w,
                    entryH: desiredSlabSize.h,
                    count: 0
                };
                // Track unused regions to use for small glyphs
                // +-------------+----+
                // |             |    |
                // |             |    | <- Unused W region
                // |             |    |
                // |-------------+----+
                // |                  | <- Unused H region
                // +------------------+
                const unusedW = this._slabW % slab.entryW;
                const unusedH = this._slabH % slab.entryH;
                if (unusedW) {
                    addEntryToMapArray(this._openRegionsByWidth, unusedW, {
                        x: slab.x + this._slabW - unusedW,
                        w: unusedW,
                        y: slab.y,
                        h: this._slabH - (unusedH ?? 0)
                    });
                }
                if (unusedH) {
                    addEntryToMapArray(this._openRegionsByHeight, unusedH, {
                        x: slab.x,
                        w: this._slabW,
                        y: slab.y + this._slabH - unusedH,
                        h: unusedH
                    });
                }
                this._slabs.push(slab);
                this._activeSlabsByDims.set(slab, desiredSlabSize.w, desiredSlabSize.h);
            }
            const glyphsPerRow = Math.floor(this._slabW / slab.entryW);
            dx = slab.x + Math.floor(slab.count % glyphsPerRow) * slab.entryW;
            dy = slab.y + Math.floor(slab.count / glyphsPerRow) * slab.entryH;
            // Shift current row
            slab.count++;
        }
        // Draw glyph
        this._ctx.drawImage(rasterizedGlyph.source, 
        // source
        rasterizedGlyph.boundingBox.left, rasterizedGlyph.boundingBox.top, glyphWidth, glyphHeight, 
        // destination
        dx, dy, glyphWidth, glyphHeight);
        // Create glyph object
        const glyph = {
            pageIndex: this._textureIndex,
            glyphIndex: this._nextIndex++,
            x: dx,
            y: dy,
            w: glyphWidth,
            h: glyphHeight,
            originOffsetX: rasterizedGlyph.originOffset.x,
            originOffsetY: rasterizedGlyph.originOffset.y,
            fontBoundingBoxAscent: rasterizedGlyph.fontBoundingBoxAscent,
            fontBoundingBoxDescent: rasterizedGlyph.fontBoundingBoxDescent,
        };
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
        let slabEntryPixels = 0;
        let usedPixels = 0;
        let slabEdgePixels = 0;
        let restrictedPixels = 0;
        const slabW = 64 << (Math.floor(getActiveWindow().devicePixelRatio) - 1);
        const slabH = slabW;
        // Draw wasted underneath glyphs first
        for (const slab of this._slabs) {
            let x = 0;
            let y = 0;
            for (let i = 0; i < slab.count; i++) {
                if (x + slab.entryW > slabW) {
                    x = 0;
                    y += slab.entryH;
                }
                ctx.fillStyle = "#FF0000" /* UsagePreviewColors.Wasted */;
                ctx.fillRect(slab.x + x, slab.y + y, slab.entryW, slab.entryH);
                slabEntryPixels += slab.entryW * slab.entryH;
                x += slab.entryW;
            }
            const entriesPerRow = Math.floor(slabW / slab.entryW);
            const entriesPerCol = Math.floor(slabH / slab.entryH);
            const thisSlabPixels = slab.entryW * entriesPerRow * slab.entryH * entriesPerCol;
            slabEdgePixels += (slabW * slabH) - thisSlabPixels;
        }
        // Draw glyphs
        for (const g of this._allocatedGlyphs) {
            usedPixels += g.w * g.h;
            ctx.fillStyle = "#4040FF" /* UsagePreviewColors.Used */;
            ctx.fillRect(g.x, g.y, g.w, g.h);
        }
        // Draw unused space on side
        const unusedRegions = Array.from(this._openRegionsByWidth.values()).flat().concat(Array.from(this._openRegionsByHeight.values()).flat());
        for (const r of unusedRegions) {
            ctx.fillStyle = "#FF000088" /* UsagePreviewColors.Restricted */;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            restrictedPixels += r.w * r.h;
        }
        // Overlay actual glyphs on top
        ctx.globalAlpha = 0.5;
        ctx.drawImage(this._canvas, 0, 0);
        ctx.globalAlpha = 1;
        return canvas.convertToBlob();
    }
    getStats() {
        const w = this._canvas.width;
        const h = this._canvas.height;
        let slabEntryPixels = 0;
        let usedPixels = 0;
        let slabEdgePixels = 0;
        let wastedPixels = 0;
        let restrictedPixels = 0;
        const totalPixels = w * h;
        const slabW = 64 << (Math.floor(getActiveWindow().devicePixelRatio) - 1);
        const slabH = slabW;
        // Draw wasted underneath glyphs first
        for (const slab of this._slabs) {
            let x = 0;
            let y = 0;
            for (let i = 0; i < slab.count; i++) {
                if (x + slab.entryW > slabW) {
                    x = 0;
                    y += slab.entryH;
                }
                slabEntryPixels += slab.entryW * slab.entryH;
                x += slab.entryW;
            }
            const entriesPerRow = Math.floor(slabW / slab.entryW);
            const entriesPerCol = Math.floor(slabH / slab.entryH);
            const thisSlabPixels = slab.entryW * entriesPerRow * slab.entryH * entriesPerCol;
            slabEdgePixels += (slabW * slabH) - thisSlabPixels;
        }
        // Draw glyphs
        for (const g of this._allocatedGlyphs) {
            usedPixels += g.w * g.h;
        }
        // Draw unused space on side
        const unusedRegions = Array.from(this._openRegionsByWidth.values()).flat().concat(Array.from(this._openRegionsByHeight.values()).flat());
        for (const r of unusedRegions) {
            restrictedPixels += r.w * r.h;
        }
        const edgeUsedPixels = slabEdgePixels - restrictedPixels;
        wastedPixels = slabEntryPixels - (usedPixels - edgeUsedPixels);
        // usedPixels += slabEdgePixels - restrictedPixels;
        const efficiency = usedPixels / (usedPixels + wastedPixels + restrictedPixels);
        return [
            `page[${this._textureIndex}]:`,
            `     Total: ${totalPixels}px (${w}x${h})`,
            `      Used: ${usedPixels}px (${((usedPixels / totalPixels) * 100).toFixed(2)}%)`,
            `    Wasted: ${wastedPixels}px (${((wastedPixels / totalPixels) * 100).toFixed(2)}%)`,
            `Restricted: ${restrictedPixels}px (${((restrictedPixels / totalPixels) * 100).toFixed(2)}%) (hard to allocate)`,
            `Efficiency: ${efficiency === 1 ? '100' : (efficiency * 100).toFixed(2)}%`,
            `     Slabs: ${this._slabs.length} of ${Math.floor(this._canvas.width / slabW) * Math.floor(this._canvas.height / slabH)}`
        ].join('\n');
    }
}
function addEntryToMapArray(map, key, entry) {
    let list = map.get(key);
    if (!list) {
        list = [];
        map.set(key, list);
    }
    list.push(entry);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVyZUF0bGFzU2xhYkFsbG9jYXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2dwdS9hdGxhcy90ZXh0dXJlQXRsYXNTbGFiQWxsb2NhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDekQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFTbkQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLE9BQU8seUJBQXlCO0lBcUJyQyxZQUNrQixPQUF3QixFQUN4QixhQUFxQixFQUN0QyxPQUEwQztRQUZ6QixZQUFPLEdBQVAsT0FBTyxDQUFpQjtRQUN4QixrQkFBYSxHQUFiLGFBQWEsQ0FBUTtRQW5CdEIsV0FBTSxHQUF3QixFQUFFLENBQUM7UUFDakMsdUJBQWtCLEdBQWlELElBQUksT0FBTyxFQUFFLENBQUM7UUFFakYsaUJBQVksR0FBa0MsRUFBRSxDQUFDO1FBRWpELHlCQUFvQixHQUErQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzdFLHdCQUFtQixHQUErQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRTdGLGdHQUFnRztRQUMvRSxxQkFBZ0IsR0FBMEMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQU03RSxlQUFVLEdBQUcsQ0FBQyxDQUFDO1FBT3RCLElBQUksQ0FBQyxJQUFJLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFO1lBQzNELGtCQUFrQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDLENBQUM7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