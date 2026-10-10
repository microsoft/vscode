/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TextureAtlas } from '../../../browser/gpu/atlas/textureAtlas.js';
import { GlyphRasterizer } from '../../../browser/gpu/raster/glyphRasterizer.js';
import { FullFileRenderStrategy } from '../../../browser/gpu/renderStrategy/fullFileRenderStrategy.js';
import { ViewportRenderStrategy } from '../../../browser/gpu/renderStrategy/viewportRenderStrategy.js';
import { ViewGpuContext } from '../../../browser/gpu/viewGpuContext.js';
import { ViewLineOptions } from '../../../browser/viewParts/viewLines/viewLineOptions.js';
import { TextDirection } from '../../../common/model.js';
import { LanguageIdCodec } from '../../../common/services/languagesRegistry.js';
import { LineTokens } from '../../../common/tokens/lineTokens.js';
import { ViewEventHandler } from '../../../common/viewEventHandler.js';
import { ViewLinesDeletedEvent, ViewLinesInsertedEvent } from '../../../common/viewEvents.js';
import { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import { IViewLayout, ViewLineRenderingData } from '../../../common/viewModel.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';

class TestBuffer extends mock<GPUBuffer>() {
	readonly data: Uint8Array;
	destroyCount = 0;
	constructor(override readonly size: number, override readonly label: string) {
		super();
		this.data = new Uint8Array(size);
	}
	override destroy(): undefined { this.destroyCount++; }
}

class TestDevice extends mock<GPUDevice>() {
	readonly buffers: TestBuffer[] = [];
	override readonly queue = new class extends mock<GPUQueue>() {
		override writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: GPUAllowSharedBufferSource, dataOffset = 0, size?: number): undefined {
			const bytesPerElement = data instanceof Float32Array ? Float32Array.BYTES_PER_ELEMENT : 1;
			const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
			(buffer as TestBuffer).data.set(bytes.subarray(dataOffset * bytesPerElement, size === undefined ? undefined : (dataOffset + size) * bytesPerElement), bufferOffset);
		}
	};
	override createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
		const buffer = new TestBuffer(descriptor.size, descriptor.label ?? '');
		this.buffers.push(buffer);
		return buffer;
	}
	getBuffer(label: string): TestBuffer {
		return this.buffers.findLast(buffer => buffer.label === label)!;
	}
}

class TestContext extends mock<ViewContext>() {
	readonly handlers = new Set<ViewEventHandler>();
	scrollTop = 0;
	override readonly viewLayout = new class extends mock<IViewLayout>() {
		constructor(private readonly context: TestContext) { super(); }
		override getCurrentScrollLeft(): number { return 0; }
		override getCurrentScrollTop(): number { return this.context.scrollTop; }
	}(this);
	override addEventHandler(handler: ViewEventHandler): void { this.handlers.add(handler); }
	override removeEventHandler(handler: ViewEventHandler): void { this.handlers.delete(handler); }
}

class TestGpuContext extends mock<ViewGpuContext>() {
	renderable = true;
	override canRender(): boolean { return this.renderable; }
	override get atlas(): TextureAtlas {
		return this.testAtlas;
	}
	private readonly testAtlas = new class extends mock<TextureAtlas>() {
		override getGlyph(_rasterizer: GlyphRasterizer, chars: string) {
			return { pageIndex: 0, glyphIndex: chars.charCodeAt(0), x: 0, y: 0, w: 1, h: 1, originOffsetX: 0, originOffsetY: 0, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 };
		}
	};
}

class TestViewport extends mock<ViewportData>() {
	override readonly endLineNumber: number;
	override readonly relativeVerticalOffset: number[];
	constructor(override readonly startLineNumber: number, private readonly lines: string[], override readonly bigNumbersDelta = 0, private readonly minColumn = 1, override readonly lineHeight = 20) {
		super();
		this.endLineNumber = startLineNumber + lines.length - 1;
		this.relativeVerticalOffset = lines.map((_, index) => (startLineNumber + index - 1) * this.lineHeight - bigNumbersDelta);
	}
	override getViewLineRenderingData(lineNumber: number): ViewLineRenderingData {
		const content = this.lines[lineNumber - this.startLineNumber];
		return new ViewLineRenderingData(this.minColumn, content.length + 1, content, false, false, false, LineTokens.createEmpty(content, new LanguageIdCodec()), [], 4, 0, TextDirection.LTR, false);
	}
}

suite('GPU render strategies', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options = new class extends mock<ViewLineOptions>() {
		override readonly spaceWidth = 10;
		override readonly useMonospaceOptimizations = true;
	};

	for (const Strategy of [FullFileRenderStrategy, ViewportRenderStrategy]) {
		suite(Strategy.name, () => {
			let device: TestDevice;
			let context: TestContext;
			let gpuContext: TestGpuContext;
			let strategy: FullFileRenderStrategy | ViewportRenderStrategy;
			setup(() => {
				device = new TestDevice();
				context = new TestContext();
				gpuContext = new TestGpuContext();
				strategy = store.add(new Strategy(context, gpuContext, device, { value: new (mock<GlyphRasterizer>())() }));
			});

			test('draws one instance per cell, limited to the visible lines', () => {
				const viewport = new TestViewport(3, ['a', 'b']);
				const count = strategy.update(viewport, options);
				const pass = new class extends mock<GPURenderPassEncoder>() {
					args: number[] = [];
					override draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0): undefined {
						this.args = [vertexCount, instanceCount, firstVertex, firstInstance];
					}
				};
				strategy.draw(pass, viewport);
				deepStrictEqual({ count, draw: pass.args }, { count: 2 * Strategy.maxSupportedColumns, draw: [6, 2 * Strategy.maxSupportedColumns, 0, Strategy === FullFileRenderStrategy ? 2 * Strategy.maxSupportedColumns : 0] });
			});

			test('uses the same large-scroll origin for cells and scroll offsets', () => {
				const viewport = Strategy === FullFileRenderStrategy ? new TestViewport(1002, ['a'], 1_000_000, 1, 1000) : new TestViewport(50002, ['a'], 1_000_000);
				context.scrollTop = (viewport.startLineNumber - 1) * viewport.lineHeight;
				strategy.update(viewport, options);
				const dpr = getActiveWindow().devicePixelRatio;
				const scrollOffset = new Float32Array(device.getBuffer('Monaco scroll offset buffer').data.buffer)[1];
				const cells = new Float32Array(device.getBuffer('Monaco full file cell buffer').data.buffer);
				const rowOffset = Strategy === FullFileRenderStrategy ? (viewport.startLineNumber - 1) * Strategy.maxSupportedColumns * 6 : 0;
				deepStrictEqual([scrollOffset, cells[rowOffset + 1] - scrollOffset], [(context.scrollTop - viewport.bigNumbersDelta) * dpr, Math.floor((viewport.lineHeight * dpr - 10) / 2) + 8]);
				context.scrollTop = 40;
				strategy.update(new TestViewport(3, ['b']), options);
				strictEqual(new Float32Array(device.getBuffer('Monaco scroll offset buffer').data.buffer)[1], 40 * getActiveWindow().devicePixelRatio);
			});

			test('preserves wrapped-line indentation', () => {
				strategy.update(new TestViewport(1, ['    a'], 0, 5), options);
				const cells = new Float32Array(device.getBuffer('Monaco full file cell buffer').data.buffer);
				const dpr = getActiveWindow().devicePixelRatio;
				deepStrictEqual(Array.from(cells.slice(4 * 6, 5 * 6)), [Math.floor(40 * dpr), Math.floor((20 * dpr - 10) / 2) + 8, 0, 0, 97, 0]);
			});

			test('unregisters its event handler when disposed', () => {
				strategy.dispose();
				strictEqual(context.handlers.size, 0);
			});
		});
	}

	test('full-file cache restores a line after DOM fallback', () => {
		const device = new TestDevice();
		const gpuContext = new TestGpuContext();
		const strategy = store.add(new FullFileRenderStrategy(new TestContext(), gpuContext, device, { value: new (mock<GlyphRasterizer>())() }));
		const viewport = new TestViewport(1, ['a']);
		for (let i = 0; i < 2; i++) { strategy.update(viewport, options); }
		gpuContext.renderable = false;
		for (let i = 0; i < 2; i++) { strategy.update(viewport, options); }
		gpuContext.renderable = true;
		for (let i = 0; i < 2; i++) {
			strategy.update(viewport, options);
			strictEqual(new Float32Array(device.getBuffer('Monaco full file cell buffer').data.buffer)[4], 97);
		}
	});

	test('full-file cache clears obsolete rows in both buffers after delete and undo', () => {
		const device = new TestDevice();
		const strategy = store.add(new FullFileRenderStrategy(new TestContext(), new TestGpuContext(), device, { value: new (mock<GlyphRasterizer>())() }));
		const renderTwice = (viewport: TestViewport) => {
			strategy.update(viewport, options);
			strategy.update(viewport, options);
		};
		renderTwice(new TestViewport(1, ['a', 'b', 'c']));
		strategy.onLinesDeleted(new ViewLinesDeletedEvent(2, 3));
		renderTwice(new TestViewport(1, ['a']));
		strategy.onLinesInserted(new ViewLinesInsertedEvent(2, 3));
		renderTwice(new TestViewport(1, ['a', 'd', 'e']));
		const cells = new Float32Array(device.getBuffer('Monaco full file cell buffer').data.buffer);
		deepStrictEqual([cells[4], cells[200 * 6 + 4], cells[400 * 6 + 4], cells[600 * 6 + 4]], [97, 100, 101, 0]);
	});

	test('viewport buffer growth destroys each allocation once', () => {
		const device = new TestDevice();
		const strategy = store.add(new ViewportRenderStrategy(new TestContext(), new TestGpuContext(), device, { value: new (mock<GlyphRasterizer>())() }));
		strategy.update(new TestViewport(1, Array.from({ length: 65 }, () => 'a')), options);
		strategy.dispose();
		deepStrictEqual(device.buffers.map(buffer => buffer.destroyCount), [1, 1, 1]);
	});
});
