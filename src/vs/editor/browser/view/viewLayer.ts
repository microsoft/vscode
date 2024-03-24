/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { BugIndicatingError } from 'vs/base/common/errors';
import { TextureAtlas } from 'vs/editor/browser/view/gpu/textureAtlas';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

/**
 * Represents a visible line
 */
export interface IVisibleLine extends ILine {
	getDomNode(): HTMLElement | null;
	setDomNode(domNode: HTMLElement): void;

	/**
	 * Return null if the HTML should not be touched.
	 * Return the new HTML otherwise.
	 */
	renderLine(lineNumber: number, deltaTop: number, lineHeight: number, viewportData: ViewportData, sb: StringBuilder): boolean;

	/**
	 * Layout the line.
	 */
	layoutLine(lineNumber: number, deltaTop: number, lineHeight: number): void;
}

export interface ILine {
	onContentChanged(): void;
	onTokensChanged(): void;
}

export class RenderedLinesCollection<T extends ILine> {
	private readonly _createLine: () => T;
	private _lines!: T[];
	private _rendLineNumberStart!: number;

	constructor(createLine: () => T) {
		this._createLine = createLine;
		this._set(1, []);
	}

	public flush(): void {
		this._set(1, []);
	}

	_set(rendLineNumberStart: number, lines: T[]): void {
		this._lines = lines;
		this._rendLineNumberStart = rendLineNumberStart;
	}

	_get(): { rendLineNumberStart: number; lines: T[] } {
		return {
			rendLineNumberStart: this._rendLineNumberStart,
			lines: this._lines
		};
	}

	/**
	 * @returns Inclusive line number that is inside this collection
	 */
	public getStartLineNumber(): number {
		return this._rendLineNumberStart;
	}

	/**
	 * @returns Inclusive line number that is inside this collection
	 */
	public getEndLineNumber(): number {
		return this._rendLineNumberStart + this._lines.length - 1;
	}

	public getCount(): number {
		return this._lines.length;
	}

	public getLine(lineNumber: number): T {
		const lineIndex = lineNumber - this._rendLineNumberStart;
		if (lineIndex < 0 || lineIndex >= this._lines.length) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}
		return this._lines[lineIndex];
	}

	/**
	 * @returns Lines that were removed from this collection
	 */
	public onLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number): T[] | null {
		if (this.getCount() === 0) {
			// no lines
			return null;
		}

		const startLineNumber = this.getStartLineNumber();
		const endLineNumber = this.getEndLineNumber();

		if (deleteToLineNumber < startLineNumber) {
			// deleting above the viewport
			const deleteCnt = deleteToLineNumber - deleteFromLineNumber + 1;
			this._rendLineNumberStart -= deleteCnt;
			return null;
		}

		if (deleteFromLineNumber > endLineNumber) {
			// deleted below the viewport
			return null;
		}

		// Record what needs to be deleted
		let deleteStartIndex = 0;
		let deleteCount = 0;
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineIndex = lineNumber - this._rendLineNumberStart;

			if (deleteFromLineNumber <= lineNumber && lineNumber <= deleteToLineNumber) {
				// this is a line to be deleted
				if (deleteCount === 0) {
					// this is the first line to be deleted
					deleteStartIndex = lineIndex;
					deleteCount = 1;
				} else {
					deleteCount++;
				}
			}
		}

		// Adjust this._rendLineNumberStart for lines deleted above
		if (deleteFromLineNumber < startLineNumber) {
			// Something was deleted above
			let deleteAboveCount = 0;

			if (deleteToLineNumber < startLineNumber) {
				// the entire deleted lines are above
				deleteAboveCount = deleteToLineNumber - deleteFromLineNumber + 1;
			} else {
				deleteAboveCount = startLineNumber - deleteFromLineNumber;
			}

			this._rendLineNumberStart -= deleteAboveCount;
		}

		const deleted = this._lines.splice(deleteStartIndex, deleteCount);
		return deleted;
	}

	public onLinesChanged(changeFromLineNumber: number, changeCount: number): boolean {
		const changeToLineNumber = changeFromLineNumber + changeCount - 1;
		if (this.getCount() === 0) {
			// no lines
			return false;
		}

		const startLineNumber = this.getStartLineNumber();
		const endLineNumber = this.getEndLineNumber();

		let someoneNotified = false;

		for (let changedLineNumber = changeFromLineNumber; changedLineNumber <= changeToLineNumber; changedLineNumber++) {
			if (changedLineNumber >= startLineNumber && changedLineNumber <= endLineNumber) {
				// Notify the line
				this._lines[changedLineNumber - this._rendLineNumberStart].onContentChanged();
				someoneNotified = true;
			}
		}

		return someoneNotified;
	}

	public onLinesInserted(insertFromLineNumber: number, insertToLineNumber: number): T[] | null {
		if (this.getCount() === 0) {
			// no lines
			return null;
		}

		const insertCnt = insertToLineNumber - insertFromLineNumber + 1;
		const startLineNumber = this.getStartLineNumber();
		const endLineNumber = this.getEndLineNumber();

		if (insertFromLineNumber <= startLineNumber) {
			// inserting above the viewport
			this._rendLineNumberStart += insertCnt;
			return null;
		}

		if (insertFromLineNumber > endLineNumber) {
			// inserting below the viewport
			return null;
		}

		if (insertCnt + insertFromLineNumber > endLineNumber) {
			// insert inside the viewport in such a way that all remaining lines are pushed outside
			const deleted = this._lines.splice(insertFromLineNumber - this._rendLineNumberStart, endLineNumber - insertFromLineNumber + 1);
			return deleted;
		}

		// insert inside the viewport, push out some lines, but not all remaining lines
		const newLines: T[] = [];
		for (let i = 0; i < insertCnt; i++) {
			newLines[i] = this._createLine();
		}
		const insertIndex = insertFromLineNumber - this._rendLineNumberStart;
		const beforeLines = this._lines.slice(0, insertIndex);
		const afterLines = this._lines.slice(insertIndex, this._lines.length - insertCnt);
		const deletedLines = this._lines.slice(this._lines.length - insertCnt, this._lines.length);

		this._lines = beforeLines.concat(newLines).concat(afterLines);

		return deletedLines;
	}

	public onTokensChanged(ranges: { fromLineNumber: number; toLineNumber: number }[]): boolean {
		if (this.getCount() === 0) {
			// no lines
			return false;
		}

		const startLineNumber = this.getStartLineNumber();
		const endLineNumber = this.getEndLineNumber();

		let notifiedSomeone = false;
		for (let i = 0, len = ranges.length; i < len; i++) {
			const rng = ranges[i];

			if (rng.toLineNumber < startLineNumber || rng.fromLineNumber > endLineNumber) {
				// range outside viewport
				continue;
			}

			const from = Math.max(startLineNumber, rng.fromLineNumber);
			const to = Math.min(endLineNumber, rng.toLineNumber);

			for (let lineNumber = from; lineNumber <= to; lineNumber++) {
				const lineIndex = lineNumber - this._rendLineNumberStart;
				this._lines[lineIndex].onTokensChanged();
				notifiedSomeone = true;
			}
		}

		return notifiedSomeone;
	}
}

export interface IVisibleLinesHost<T extends IVisibleLine> {
	createVisibleLine(): T;
}

export class VisibleLinesCollection<T extends IVisibleLine> {

	private readonly _host: IVisibleLinesHost<T>;
	public readonly domNode: FastDomNode<HTMLElement>;
	private readonly _linesCollection: RenderedLinesCollection<T>;

	private readonly _canvas: HTMLCanvasElement;

	constructor(host: IVisibleLinesHost<T>) {
		this._host = host;
		this.domNode = this._createDomNode();

		this._canvas = document.createElement('canvas');
		this._canvas.style.height = '100%';
		this._canvas.style.width = '100%';
		this.domNode.domNode.appendChild(this._canvas);

		this._linesCollection = new RenderedLinesCollection<T>(() => this._host.createVisibleLine());
	}

	private _createDomNode(): FastDomNode<HTMLElement> {
		const domNode = createFastDomNode(document.createElement('div'));
		domNode.setClassName('view-layer');
		domNode.setPosition('absolute');
		domNode.domNode.setAttribute('role', 'presentation');
		domNode.domNode.setAttribute('aria-hidden', 'true');
		return domNode;
	}

	// ---- begin view event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.hasChanged(EditorOption.layoutInfo)) {
			return true;
		}
		return false;
	}

	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this._linesCollection.flush();
		// No need to clear the dom node because a full .innerHTML will occur in ViewLayerRenderer._render
		return true;
	}

	public onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return this._linesCollection.onLinesChanged(e.fromLineNumber, e.count);
	}

	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		const deleted = this._linesCollection.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
		if (deleted) {
			// Remove from DOM
			for (let i = 0, len = deleted.length; i < len; i++) {
				const lineDomNode = deleted[i].getDomNode();
				if (lineDomNode) {
					this.domNode.domNode.removeChild(lineDomNode);
				}
			}
		}

		return true;
	}

	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		const deleted = this._linesCollection.onLinesInserted(e.fromLineNumber, e.toLineNumber);
		if (deleted) {
			// Remove from DOM
			for (let i = 0, len = deleted.length; i < len; i++) {
				const lineDomNode = deleted[i].getDomNode();
				if (lineDomNode) {
					this.domNode.domNode.removeChild(lineDomNode);
				}
			}
		}

		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollTopChanged;
	}

	public onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		return this._linesCollection.onTokensChanged(e.ranges);
	}

	public onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// ---- end view event handlers

	public getStartLineNumber(): number {
		return this._linesCollection.getStartLineNumber();
	}

	public getEndLineNumber(): number {
		return this._linesCollection.getEndLineNumber();
	}

	public getVisibleLine(lineNumber: number): T {
		return this._linesCollection.getLine(lineNumber);
	}

	private _canvasRenderer: CanvasViewLayerRenderer<T> | undefined;

	public renderLines(viewportData: ViewportData, viewOverlays?: boolean): void {
		const inp = this._linesCollection._get();

		let renderer;
		if (viewOverlays) {
			renderer = new ViewLayerRenderer<T>(this.domNode.domNode, this._host, viewportData);
		} else {
			this._canvas.width = this.domNode.domNode.clientWidth;
			this._canvas.height = this.domNode.domNode.clientHeight;
			if (!this._canvasRenderer) {
				this._canvasRenderer = new CanvasViewLayerRenderer<T>(this._canvas, this._host, viewportData);
			}
			renderer = this._canvasRenderer;
			renderer.update(viewportData);
		}

		const ctx: IRendererContext<T> = {
			rendLineNumberStart: inp.rendLineNumberStart,
			lines: inp.lines,
			linesLength: inp.lines.length
		};

		// Decide if this render will do a single update (single large .innerHTML) or many updates (inserting/removing dom nodes)
		const resCtx = renderer.render(ctx, viewportData.startLineNumber, viewportData.endLineNumber, viewportData.relativeVerticalOffset);

		this._linesCollection._set(resCtx.rendLineNumberStart, resCtx.lines);
	}
}

interface IRendererContext<T extends IVisibleLine> {
	rendLineNumberStart: number;
	lines: T[];
	linesLength: number;
}

class ViewLayerRenderer<T extends IVisibleLine> {

	private static _ttPolicy = createTrustedTypesPolicy('editorViewLayer', { createHTML: value => value });

	readonly domNode: HTMLElement;
	readonly host: IVisibleLinesHost<T>;
	readonly viewportData: ViewportData;

	constructor(domNode: HTMLElement, host: IVisibleLinesHost<T>, viewportData: ViewportData) {
		this.domNode = domNode;
		this.host = host;
		this.viewportData = viewportData;
	}

	public render(inContext: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {

		const ctx: IRendererContext<T> = {
			rendLineNumberStart: inContext.rendLineNumberStart,
			lines: inContext.lines.slice(0),
			linesLength: inContext.linesLength
		};

		if ((ctx.rendLineNumberStart + ctx.linesLength - 1 < startLineNumber) || (stopLineNumber < ctx.rendLineNumberStart)) {
			// There is no overlap whatsoever
			ctx.rendLineNumberStart = startLineNumber;
			ctx.linesLength = stopLineNumber - startLineNumber + 1;
			ctx.lines = [];
			for (let x = startLineNumber; x <= stopLineNumber; x++) {
				ctx.lines[x - startLineNumber] = this.host.createVisibleLine();
			}
			this._finishRendering(ctx, true, deltaTop);
			return ctx;
		}

		// Update lines which will remain untouched
		this._renderUntouchedLines(
			ctx,
			Math.max(startLineNumber - ctx.rendLineNumberStart, 0),
			Math.min(stopLineNumber - ctx.rendLineNumberStart, ctx.linesLength - 1),
			deltaTop,
			startLineNumber
		);

		if (ctx.rendLineNumberStart > startLineNumber) {
			// Insert lines before
			const fromLineNumber = startLineNumber;
			const toLineNumber = Math.min(stopLineNumber, ctx.rendLineNumberStart - 1);
			if (fromLineNumber <= toLineNumber) {
				this._insertLinesBefore(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
				ctx.linesLength += toLineNumber - fromLineNumber + 1;
			}
		} else if (ctx.rendLineNumberStart < startLineNumber) {
			// Remove lines before
			const removeCnt = Math.min(ctx.linesLength, startLineNumber - ctx.rendLineNumberStart);
			if (removeCnt > 0) {
				this._removeLinesBefore(ctx, removeCnt);
				ctx.linesLength -= removeCnt;
			}
		}

		ctx.rendLineNumberStart = startLineNumber;

		if (ctx.rendLineNumberStart + ctx.linesLength - 1 < stopLineNumber) {
			// Insert lines after
			const fromLineNumber = ctx.rendLineNumberStart + ctx.linesLength;
			const toLineNumber = stopLineNumber;

			if (fromLineNumber <= toLineNumber) {
				this._insertLinesAfter(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
				ctx.linesLength += toLineNumber - fromLineNumber + 1;
			}

		} else if (ctx.rendLineNumberStart + ctx.linesLength - 1 > stopLineNumber) {
			// Remove lines after
			const fromLineNumber = Math.max(0, stopLineNumber - ctx.rendLineNumberStart + 1);
			const toLineNumber = ctx.linesLength - 1;
			const removeCnt = toLineNumber - fromLineNumber + 1;

			if (removeCnt > 0) {
				this._removeLinesAfter(ctx, removeCnt);
				ctx.linesLength -= removeCnt;
			}
		}

		this._finishRendering(ctx, false, deltaTop);

		return ctx;
	}

	private _renderUntouchedLines(ctx: IRendererContext<T>, startIndex: number, endIndex: number, deltaTop: number[], deltaLN: number): void {
		const rendLineNumberStart = ctx.rendLineNumberStart;
		const lines = ctx.lines;

		for (let i = startIndex; i <= endIndex; i++) {
			const lineNumber = rendLineNumberStart + i;
			lines[i].layoutLine(lineNumber, deltaTop[lineNumber - deltaLN], this.viewportData.lineHeight);
		}
	}

	private _insertLinesBefore(ctx: IRendererContext<T>, fromLineNumber: number, toLineNumber: number, deltaTop: number[], deltaLN: number): void {
		const newLines: T[] = [];
		let newLinesLen = 0;
		for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			newLines[newLinesLen++] = this.host.createVisibleLine();
		}
		ctx.lines = newLines.concat(ctx.lines);
	}

	private _removeLinesBefore(ctx: IRendererContext<T>, removeCount: number): void {
		for (let i = 0; i < removeCount; i++) {
			const lineDomNode = ctx.lines[i].getDomNode();
			if (lineDomNode) {
				this.domNode.removeChild(lineDomNode);
			}
		}
		ctx.lines.splice(0, removeCount);
	}

	private _insertLinesAfter(ctx: IRendererContext<T>, fromLineNumber: number, toLineNumber: number, deltaTop: number[], deltaLN: number): void {
		const newLines: T[] = [];
		let newLinesLen = 0;
		for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			newLines[newLinesLen++] = this.host.createVisibleLine();
		}
		ctx.lines = ctx.lines.concat(newLines);
	}

	private _removeLinesAfter(ctx: IRendererContext<T>, removeCount: number): void {
		const removeIndex = ctx.linesLength - removeCount;

		for (let i = 0; i < removeCount; i++) {
			const lineDomNode = ctx.lines[removeIndex + i].getDomNode();
			if (lineDomNode) {
				this.domNode.removeChild(lineDomNode);
			}
		}
		ctx.lines.splice(removeIndex, removeCount);
	}

	private _finishRenderingNewLines(ctx: IRendererContext<T>, domNodeIsEmpty: boolean, newLinesHTML: string | TrustedHTML, wasNew: boolean[]): void {
		if (ViewLayerRenderer._ttPolicy) {
			newLinesHTML = ViewLayerRenderer._ttPolicy.createHTML(newLinesHTML as string);
		}
		const lastChild = <HTMLElement>this.domNode.lastChild;
		if (domNodeIsEmpty || !lastChild) {
			this.domNode.innerHTML = newLinesHTML as string; // explains the ugly casts -> https://github.com/microsoft/vscode/issues/106396#issuecomment-692625393;
		} else {
			lastChild.insertAdjacentHTML('afterend', newLinesHTML as string);
		}

		let currChild = <HTMLElement>this.domNode.lastChild;
		for (let i = ctx.linesLength - 1; i >= 0; i--) {
			const line = ctx.lines[i];
			if (wasNew[i]) {
				line.setDomNode(currChild);
				currChild = <HTMLElement>currChild.previousSibling;
			}
		}
	}

	private _finishRenderingInvalidLines(ctx: IRendererContext<T>, invalidLinesHTML: string | TrustedHTML, wasInvalid: boolean[]): void {
		const hugeDomNode = document.createElement('div');

		if (ViewLayerRenderer._ttPolicy) {
			invalidLinesHTML = ViewLayerRenderer._ttPolicy.createHTML(invalidLinesHTML as string);
		}
		hugeDomNode.innerHTML = invalidLinesHTML as string;

		for (let i = 0; i < ctx.linesLength; i++) {
			const line = ctx.lines[i];
			if (wasInvalid[i]) {
				const source = <HTMLElement>hugeDomNode.firstChild;
				const lineDomNode = line.getDomNode()!;
				lineDomNode.parentNode!.replaceChild(source, lineDomNode);
				line.setDomNode(source);
			}
		}
	}

	private static readonly _sb = new StringBuilder(100000);

	private _finishRendering(ctx: IRendererContext<T>, domNodeIsEmpty: boolean, deltaTop: number[]): void {

		const sb = ViewLayerRenderer._sb;
		const linesLength = ctx.linesLength;
		const lines = ctx.lines;
		const rendLineNumberStart = ctx.rendLineNumberStart;

		const wasNew: boolean[] = [];
		{
			sb.reset();
			let hadNewLine = false;

			for (let i = 0; i < linesLength; i++) {
				const line = lines[i];
				wasNew[i] = false;

				const lineDomNode = line.getDomNode();
				if (lineDomNode) {
					// line is not new
					continue;
				}

				const renderResult = line.renderLine(i + rendLineNumberStart, deltaTop[i], this.viewportData.lineHeight, this.viewportData, sb);
				if (!renderResult) {
					// line does not need rendering
					continue;
				}

				wasNew[i] = true;
				hadNewLine = true;
			}

			if (hadNewLine) {
				this._finishRenderingNewLines(ctx, domNodeIsEmpty, sb.build(), wasNew);
			}
		}

		{
			sb.reset();

			let hadInvalidLine = false;
			const wasInvalid: boolean[] = [];

			for (let i = 0; i < linesLength; i++) {
				const line = lines[i];
				wasInvalid[i] = false;

				if (wasNew[i]) {
					// line was new
					continue;
				}

				const renderResult = line.renderLine(i + rendLineNumberStart, deltaTop[i], this.viewportData.lineHeight, this.viewportData, sb);
				if (!renderResult) {
					// line does not need rendering
					continue;
				}

				wasInvalid[i] = true;
				hadInvalidLine = true;
			}

			if (hadInvalidLine) {
				this._finishRenderingInvalidLines(ctx, sb.build(), wasInvalid);
			}
		}
	}
}

const enum Constants {
	IndicesPerCell = 6
}

const enum BindingId {
	SpriteInfo = 0,
	DynamicUnitInfo = 1,
	TextureSampler = 2,
	Texture = 3,
	Uniforms = 4,
	TextureInfoUniform = 5,
}

const wgsl = `
struct Uniforms {
	canvasDimensions: vec2f,
};

struct TextureInfoUniform {
	spriteSheetSize: vec2f,
}

struct SpriteInfo {
	position: vec2f,
	size: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct DynamicUnitInfo {
	position: vec2f,
	dimensions: vec2f,
	unused: f32,
	textureId: f32,
};

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(0) texcoord: vec2f,
};

@group(0) @binding(${BindingId.Uniforms}) var<uniform> uniforms: Uniforms;
@group(0) @binding(${BindingId.TextureInfoUniform}) var<uniform> textureInfoUniform: TextureInfoUniform;

@group(0) @binding(${BindingId.SpriteInfo}) var<storage, read> spriteInfo: array<SpriteInfo>;
@group(0) @binding(${BindingId.DynamicUnitInfo}) var<storage, read> dynamicUnitInfoStructs: array<DynamicUnitInfo>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let dynamicUnitInfo = dynamicUnitInfoStructs[instanceIndex];
	let spriteInfo = spriteInfo[u32(dynamicUnitInfo.textureId)];

	var vsOut: VSOutput;
	vsOut.position = vec4f(
		(((vert.position * 2 - 1) / uniforms.canvasDimensions)) * dynamicUnitInfo.dimensions + dynamicUnitInfo.position,
		0.0,
		1.0
	);

	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vec2f(vert.position.x, 1.0 - vert.position.y);
	vsOut.texcoord = (
		// Sprite offset (0-1)
		(spriteInfo.position / textureInfoUniform.spriteSheetSize) +
		// Sprite coordinate (0-1)
		(vsOut.texcoord * (spriteInfo.size / textureInfoUniform.spriteSheetSize))
	);

	return vsOut;
}

@group(0) @binding(${BindingId.TextureSampler}) var ourSampler: sampler;
@group(0) @binding(${BindingId.Texture}) var ourTexture: texture_2d<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	// var a = textureSample(ourTexture, ourSampler, vsOut.texcoord);
	// return vec4f(1.0, 0.0, 0.0, 1.0);
	return textureSample(ourTexture, ourSampler, vsOut.texcoord);
}
`;

class CanvasViewLayerRenderer<T extends IVisibleLine> {

	readonly domNode: HTMLCanvasElement;
	host: IVisibleLinesHost<T>;
	viewportData: ViewportData;

	private readonly _gpuCtx!: GPUCanvasContext;

	private _adapter!: GPUAdapter;
	private _device!: GPUDevice;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _bindGroup!: GPUBindGroup;
	private _pipeline!: GPURenderPipeline;

	private _dataBindBuffer!: GPUBuffer;
	private _dataValueBuffers!: ArrayBuffer[];
	private _dataValuesBufferActiveIndex: number = 0;

	private _vertexBuffer!: GPUBuffer;
	private _squareVertices!: { vertexData: Float32Array; numVertices: number };

	private _initialized = false;

	constructor(domNode: HTMLCanvasElement, host: IVisibleLinesHost<T>, viewportData: ViewportData) {
		this.domNode = domNode;
		this.host = host;
		this.viewportData = viewportData;

		this._gpuCtx = this.domNode.getContext('webgpu')!;
		this.initWebgpu();
	}

	async initWebgpu() {
		if (!navigator.gpu) {
			throw new Error('this browser does not support WebGPU');
		}

		this._adapter = (await navigator.gpu.requestAdapter())!;
		if (!this._adapter) {
			throw new Error('this browser supports webgpu but it appears disabled');
		}

		this._device = await this._adapter.requestDevice();

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		this._gpuCtx.configure({
			device: this._device,
			format: presentationFormat,
		});

		const module = this._device.createShaderModule({
			label: 'ViewLayer shader module',
			code: wgsl,
		});

		this._pipeline = this._device.createRenderPipeline({
			label: 'ViewLayer render pipeline',
			layout: 'auto',
			vertex: {
				module,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT, // 2 floats, 4 bytes each
						attributes: [
							{ shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
						],
					}
				]
			},
			fragment: {
				module,
				entryPoint: 'fs',
				targets: [
					{
						format: presentationFormat,
						blend: {
							color: {
								srcFactor: 'one',
								dstFactor: 'one-minus-src-alpha'
							},
							alpha: {
								srcFactor: 'one',
								dstFactor: 'one-minus-src-alpha'
							},
						},
					}
				],
			},
		});



		// Write standard uniforms
		const enum UniformBufferInfo {
			Size = 2, // 2x 32 bit floats
			OffsetCanvasWidth = 0,
			OffsetCanvasHeight = 1
		}
		const uniformBuffer = this._device.createBuffer({
			size: UniformBufferInfo.Size * Float32Array.BYTES_PER_ELEMENT,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		{
			const uniformValues = new Float32Array(UniformBufferInfo.Size);
			// TODO: Update on canvas resize
			uniformValues[UniformBufferInfo.OffsetCanvasWidth] = this.domNode.width;
			uniformValues[UniformBufferInfo.OffsetCanvasHeight] = this.domNode.height;
			this._device.queue.writeBuffer(uniformBuffer, 0, uniformValues);
		}


		// Create texture atlas
		const textureAtlas = new TextureAtlas(this.domNode, this._device.limits.maxTextureDimension2D);
		textureAtlas.getGlyph('ABC', 0);



		// Upload texture bitmap from atlas
		const textureAtlasGpuTexture = this._device.createTexture({
			format: 'rgba8unorm',
			size: { width: textureAtlas.source.width, height: textureAtlas.source.height },
			usage: GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_DST |
				GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this._device.queue.copyExternalImageToTexture(
			{ source: textureAtlas.source },
			{ texture: textureAtlasGpuTexture },
			{ width: textureAtlas.source.width, height: textureAtlas.source.height },
		);



		const enum TextureInfoUniformBufferInfo {
			Size = 2,
			SpriteSheetSize = 0,
		}
		const textureInfoUniformBufferSize = TextureInfoUniformBufferInfo.Size * Float32Array.BYTES_PER_ELEMENT;
		const textureInfoUniformBuffer = this._device.createBuffer({
			size: textureInfoUniformBufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		{
			const uniformValues = new Float32Array(TextureInfoUniformBufferInfo.Size);
			// TODO: Update on canvas resize
			uniformValues[TextureInfoUniformBufferInfo.SpriteSheetSize] = textureAtlas.source.width;
			uniformValues[TextureInfoUniformBufferInfo.SpriteSheetSize + 1] = textureAtlas.source.height;
			this._device.queue.writeBuffer(textureInfoUniformBuffer, 0, uniformValues);
		}


		const maxRenderedObjects = 10;

		///////////////////
		// Static buffer //
		///////////////////
		const enum SpriteInfoStorageBufferInfo {
			Size = 2 + 2,
			Offset_TexturePosition = 0,
			Offset_TextureSize = 2,
		}
		const spriteInfoStorageBufferByteSize = SpriteInfoStorageBufferInfo.Size * Float32Array.BYTES_PER_ELEMENT;
		const spriteInfoStorageBuffer = this._device.createBuffer({
			label: 'Entity static info buffer',
			size: spriteInfoStorageBufferByteSize * maxRenderedObjects,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		{
			const sprites: { x: number; y: number; w: number; h: number }[] = [
				{ x: 0, y: 0, w: 7, h: 10 },
				{ x: 0, y: 0, w: 50, h: 50 }
			];
			const bufferSize = spriteInfoStorageBufferByteSize * sprites.length;
			const values = new Float32Array(bufferSize / 4);
			let entryOffset = 0;
			for (const t of sprites) {
				values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TexturePosition] = t.x;
				values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TexturePosition + 1] = t.y;
				values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TextureSize] = t.w;
				values[entryOffset + SpriteInfoStorageBufferInfo.Offset_TextureSize + 1] = t.h;
				entryOffset += SpriteInfoStorageBufferInfo.Size;
			}
			this._device.queue.writeBuffer(spriteInfoStorageBuffer, 0, values);
		}



		const cellCount = 2;
		const bufferSize = cellCount * Constants.IndicesPerCell * Float32Array.BYTES_PER_ELEMENT;
		this._dataBindBuffer = this._device.createBuffer({
			label: 'Entity dynamic info buffer',
			size: bufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._dataValueBuffers = [
			new ArrayBuffer(bufferSize),
			new ArrayBuffer(bufferSize),
		];
		this._updateSquareVertices();



		const sampler = this._device.createSampler({
			magFilter: 'nearest',
			minFilter: 'nearest',
		});
		this._bindGroup = this._device.createBindGroup({
			label: 'ViewLayer bind group',
			layout: this._pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: BindingId.SpriteInfo, resource: { buffer: spriteInfoStorageBuffer } },
				{ binding: BindingId.DynamicUnitInfo, resource: { buffer: this._dataBindBuffer } },
				{ binding: BindingId.TextureSampler, resource: sampler },
				{ binding: BindingId.Texture, resource: textureAtlasGpuTexture.createView() },
				{ binding: BindingId.Uniforms, resource: { buffer: uniformBuffer } },
				{ binding: BindingId.TextureInfoUniform, resource: { buffer: textureInfoUniformBuffer } },
			],
		});

		this._renderPassDescriptor = {
			label: 'ViewLayer render pass',
			colorAttachments: [
				(
					{
						// view: <- to be filled out when we render
						loadValue: [0, 0, 0, 0],
						loadOp: 'load',
						storeOp: 'store',
					} as Omit<GPURenderPassColorAttachment, 'view'>
				) as any as GPURenderPassColorAttachment,
			] as any as Iterable<GPURenderPassColorAttachment>,
		};


		this._initialized = true;
	}

	private _updateSquareVertices() {
		this._squareVertices = {
			vertexData: new Float32Array([
				1, 0,
				1, 1,
				0, 1,
				0, 0,
				0, 1,
				1, 0,
			]),
			numVertices: 6
		};
		const { vertexData } = this._squareVertices;

		this._vertexBuffer = this._device.createBuffer({
			label: 'vertex buffer vertices',
			size: vertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		});
		this._device.queue.writeBuffer(this._vertexBuffer, 0, vertexData);
	}

	update(viewportData: ViewportData) {
		this.viewportData = viewportData;
	}

	public render(inContext: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {
		const ctx: IRendererContext<T> = {
			rendLineNumberStart: inContext.rendLineNumberStart,
			lines: inContext.lines.slice(0),
			linesLength: inContext.linesLength
		};

		if (!this._initialized) {
			return ctx;
		}
		return this._renderWebgpu(ctx, startLineNumber, stopLineNumber, deltaTop);
	}

	private _renderWebgpu(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): IRendererContext<T> {

		const visibleObjectCount = this._updateDataBuffer();

		// Write buffer and swap it out to unblock writes
		const dataBuffer = new Float32Array(this._dataValueBuffers[this._dataValuesBufferActiveIndex]);
		this._device.queue.writeBuffer(this._dataBindBuffer, 0, dataBuffer, 0, visibleObjectCount * Constants.IndicesPerCell);

		this._dataValuesBufferActiveIndex = (this._dataValuesBufferActiveIndex + 1) % 2;

		const encoder = this._device.createCommandEncoder();

		(this._renderPassDescriptor.colorAttachments as any)[0].view = this._gpuCtx.getCurrentTexture().createView();
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._vertexBuffer);

		pass.setBindGroup(0, this._bindGroup);
		// TODO: Draws could be split by chunk, this would help minimize moving data around in arrays
		pass.draw(this._squareVertices.numVertices, visibleObjectCount);

		pass.end();

		const commandBuffer = encoder.finish();

		this._device.queue.submit([commandBuffer]);

		return ctx;
	}

	private _updateDataBuffer() {
		let screenAbsoluteX: number = 0;
		let screenAbsoluteY: number = 0;
		let zeroToOneX: number = 0;
		let zeroToOneY: number = 0;
		let wgslX: number = 0;
		let wgslY: number = 0;

		screenAbsoluteX = 100;
		screenAbsoluteY = 100;

		screenAbsoluteX = Math.round(screenAbsoluteX);
		screenAbsoluteY = Math.round(screenAbsoluteY);
		zeroToOneX = screenAbsoluteX / this.domNode.width;
		zeroToOneY = screenAbsoluteY / this.domNode.height;
		wgslX = zeroToOneX * 2 - 1;
		wgslY = zeroToOneY * 2 - 1;

		const offset = 0;
		const objectCount = 1;
		const data = new Float32Array(objectCount * Constants.IndicesPerCell);
		data[offset] = wgslX; // x
		data[offset + 1] = -wgslY; // y
		data[offset + 2] = 50;// 7; // width
		data[offset + 3] = 50;//10; // height
		data[offset + 4] = 0; // unused
		data[offset + 5] = 1; // textureIndex



		const storageValues = new Float32Array(this._dataValueBuffers[this._dataValuesBufferActiveIndex]);
		storageValues.set(data);
		return objectCount;
	}
}
