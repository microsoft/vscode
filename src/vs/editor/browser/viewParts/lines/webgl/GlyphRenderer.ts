/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { createProgram, PROJECTION_MATRIX, throwIfFalsy } from './WebglUtils';
import { WebglCharAtlas } from './atlas/WebglCharAtlas';
import { IWebGL2RenderingContext, IWebGLVertexArrayObject, IRenderModel, IRasterizedGlyph } from './Types';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { fill } from 'vs/editor/browser/viewParts/lines/webgl/base/TypedArrayUtils2';
import { IRenderDimensions } from 'vs/editor/browser/viewParts/lines/webgl/base/Types';
import { NULL_CELL_CODE } from 'vs/editor/browser/viewParts/lines/webgl/base/Constants';

interface IVertices {
	attributes: Float32Array;
	/**
	 * These buffers are the ones used to bind to WebGL, the reason there are
	 * multiple is to allow double buffering to work as you cannot modify the
	 * buffer while it's being used by the GPU. Having multiple lets us start
	 * working on the next frame.
	 */
	attributesBuffers: Float32Array[];
	count: number;
}

const enum VertexAttribLocations {
	UNIT_QUAD = 0,
	CELL_POSITION = 1,
	OFFSET = 2,
	SIZE = 3,
	TEXCOORD = 4,
	TEXSIZE = 5
}

const vertexShaderSource = `#version 300 es
layout (location = ${VertexAttribLocations.UNIT_QUAD}) in vec2 a_unitquad;
layout (location = ${VertexAttribLocations.CELL_POSITION}) in vec2 a_cellpos;
layout (location = ${VertexAttribLocations.OFFSET}) in vec2 a_offset;
layout (location = ${VertexAttribLocations.SIZE}) in vec2 a_size;
layout (location = ${VertexAttribLocations.TEXCOORD}) in vec2 a_texcoord;
layout (location = ${VertexAttribLocations.TEXSIZE}) in vec2 a_texsize;

uniform mat4 u_projection;
uniform vec2 u_resolution;

out vec2 v_texcoord;

void main() {
  vec2 zeroToOne = (a_offset / u_resolution) + a_cellpos + (a_unitquad * a_size);
  gl_Position = u_projection * vec4(zeroToOne, 0.0, 1.0);
  v_texcoord = a_texcoord + a_unitquad * a_texsize;
}`;

const fragmentShaderSource = `#version 300 es
precision lowp float;

in vec2 v_texcoord;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texcoord);
}`;

const INDICES_PER_CELL = 10;
const BYTES_PER_CELL = INDICES_PER_CELL * Float32Array.BYTES_PER_ELEMENT;
const CELL_POSITION_INDICES = 2;

/** Work variables to avoid garbage collection. */
const w: { i: number; glyph: IRasterizedGlyph | undefined; leftCellPadding: number; clippedPixels: number } = {
	i: 0,
	glyph: undefined,
	leftCellPadding: 0,
	clippedPixels: 0
};

export class GlyphRenderer extends Disposable {
	private _atlas: WebglCharAtlas | undefined;

	private _program: WebGLProgram;
	private _vertexArrayObject: IWebGLVertexArrayObject;
	private _projectionLocation: WebGLUniformLocation;
	private _resolutionLocation: WebGLUniformLocation;
	private _textureLocation: WebGLUniformLocation;
	private _atlasTexture: WebGLTexture;
	private _attributesBuffer: WebGLBuffer;
	private _activeBuffer: number = 0;

	private _vertices: IVertices = {
		count: 0,
		attributes: new Float32Array(0),
		attributesBuffers: [
			new Float32Array(0),
			new Float32Array(0)
		]
	};

	constructor(
		private _viewportDims: { cols: number; rows: number },
		private _gl: IWebGL2RenderingContext,
		private _dimensions: IRenderDimensions
	) {
		super();

		const gl = this._gl;
		this._program = throwIfFalsy(createProgram(gl, vertexShaderSource, fragmentShaderSource));
		this._register(toDisposable(() => gl.deleteProgram(this._program)));

		// Uniform locations
		this._projectionLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_projection'));
		this._resolutionLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_resolution'));
		this._textureLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_texture'));

		// Create and set the vertex array object
		this._vertexArrayObject = gl.createVertexArray();
		gl.bindVertexArray(this._vertexArrayObject);

		// Setup a_unitquad, this defines the 4 vertices of a rectangle
		const unitQuadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
		const unitQuadVerticesBuffer = gl.createBuffer();
		this._register(toDisposable(() => gl.deleteBuffer(unitQuadVerticesBuffer)));
		gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVerticesBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, unitQuadVertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(VertexAttribLocations.UNIT_QUAD);
		gl.vertexAttribPointer(VertexAttribLocations.UNIT_QUAD, 2, this._gl.FLOAT, false, 0, 0);

		// Setup the unit quad element array buffer, this points to indices in
		// unitQuadVertices to allow is to draw 2 triangles from the vertices
		const unitQuadElementIndices = new Uint8Array([0, 1, 3, 0, 2, 3]);
		const elementIndicesBuffer = gl.createBuffer();
		this._register(toDisposable(() => gl.deleteBuffer(elementIndicesBuffer)));
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementIndicesBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, unitQuadElementIndices, gl.STATIC_DRAW);

		// Setup attributes
		this._attributesBuffer = throwIfFalsy(gl.createBuffer());
		this._register(toDisposable(() => gl.deleteBuffer(this._attributesBuffer)));
		gl.bindBuffer(gl.ARRAY_BUFFER, this._attributesBuffer);
		gl.enableVertexAttribArray(VertexAttribLocations.OFFSET);
		gl.vertexAttribPointer(VertexAttribLocations.OFFSET, 2, gl.FLOAT, false, BYTES_PER_CELL, 0);
		gl.vertexAttribDivisor(VertexAttribLocations.OFFSET, 1);
		gl.enableVertexAttribArray(VertexAttribLocations.SIZE);
		gl.vertexAttribPointer(VertexAttribLocations.SIZE, 2, gl.FLOAT, false, BYTES_PER_CELL, 2 * Float32Array.BYTES_PER_ELEMENT);
		gl.vertexAttribDivisor(VertexAttribLocations.SIZE, 1);
		gl.enableVertexAttribArray(VertexAttribLocations.TEXCOORD);
		gl.vertexAttribPointer(VertexAttribLocations.TEXCOORD, 2, gl.FLOAT, false, BYTES_PER_CELL, 4 * Float32Array.BYTES_PER_ELEMENT);
		gl.vertexAttribDivisor(VertexAttribLocations.TEXCOORD, 1);
		gl.enableVertexAttribArray(VertexAttribLocations.TEXSIZE);
		gl.vertexAttribPointer(VertexAttribLocations.TEXSIZE, 2, gl.FLOAT, false, BYTES_PER_CELL, 6 * Float32Array.BYTES_PER_ELEMENT);
		gl.vertexAttribDivisor(VertexAttribLocations.TEXSIZE, 1);
		gl.enableVertexAttribArray(VertexAttribLocations.CELL_POSITION);
		gl.vertexAttribPointer(VertexAttribLocations.CELL_POSITION, 2, gl.FLOAT, false, BYTES_PER_CELL, 8 * Float32Array.BYTES_PER_ELEMENT);
		gl.vertexAttribDivisor(VertexAttribLocations.CELL_POSITION, 1);

		// Setup empty texture atlas
		this._atlasTexture = throwIfFalsy(gl.createTexture());
		this._register(toDisposable(() => gl.deleteTexture(this._atlasTexture)));
		gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		// Allow drawing of transparent texture
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		// Set viewport
		this.onResize();
	}

	public beginFrame(): boolean {
		return this._atlas ? this._atlas.beginFrame() : true;
	}

	public updateCell(x: number, y: number, code: number, bg: number, fg: number, ext: number, chars: string, lastBg: number): void {
		// Since this function is called for every cell (`rows*cols`), it must be very optimized. It
		// should not instantiate any variables unless a new glyph is drawn to the cache where the
		// slight slowdown is acceptable for the developer ergonomics provided as it's a once of for
		// each glyph.
		this._updateCell(this._vertices.attributes, x, y, code, bg, fg, ext, chars, lastBg);
	}

	private _updateCell(array: Float32Array, x: number, y: number, code: number | undefined, bg: number, fg: number, ext: number, chars: string, lastBg: number): void {
		w.i = (y * this._viewportDims.cols + x) * INDICES_PER_CELL;

		// Exit early if this is a null character, allow space character to continue as it may have
		// underline/strikethrough styles
		if (code === NULL_CELL_CODE || code === undefined/* This is used for the right side of wide chars */) {
			fill(array, 0, w.i, w.i + INDICES_PER_CELL - 1 - CELL_POSITION_INDICES);
			return;
		}

		if (!this._atlas) {
			return;
		}

		// Get the glyph
		if (chars && chars.length > 1) {
			w.glyph = this._atlas.getRasterizedGlyphCombinedChar(chars, bg, fg, ext);
		} else {
			w.glyph = this._atlas.getRasterizedGlyph(code, bg, fg, ext);
		}

		w.leftCellPadding = Math.floor((this._dimensions.scaledCellWidth - this._dimensions.scaledCharWidth) / 2);
		if (bg !== lastBg && w.glyph.offset.x > w.leftCellPadding) {
			w.clippedPixels = w.glyph.offset.x - w.leftCellPadding;
			// a_origin
			array[w.i] = -(w.glyph.offset.x - w.clippedPixels) + this._dimensions.scaledCharLeft;
			array[w.i + 1] = -w.glyph.offset.y + this._dimensions.scaledCharTop;
			// a_size
			array[w.i + 2] = (w.glyph.size.x - w.clippedPixels) / this._dimensions.scaledCanvasWidth;
			array[w.i + 3] = w.glyph.size.y / this._dimensions.scaledCanvasHeight;
			// a_texcoord
			array[w.i + 4] = w.glyph.texturePositionClipSpace.x + w.clippedPixels / this._atlas.cacheCanvas.width;
			array[w.i + 5] = w.glyph.texturePositionClipSpace.y;
			// a_texsize
			array[w.i + 6] = w.glyph.sizeClipSpace.x - w.clippedPixels / this._atlas.cacheCanvas.width;
			array[w.i + 7] = w.glyph.sizeClipSpace.y;
		} else {
			// a_origin
			array[w.i] = -w.glyph.offset.x + this._dimensions.scaledCharLeft;
			array[w.i + 1] = -w.glyph.offset.y + this._dimensions.scaledCharTop;
			// a_size
			array[w.i + 2] = w.glyph.size.x / this._dimensions.scaledCanvasWidth;
			array[w.i + 3] = w.glyph.size.y / this._dimensions.scaledCanvasHeight;
			// a_texcoord
			array[w.i + 4] = w.glyph.texturePositionClipSpace.x;
			array[w.i + 5] = w.glyph.texturePositionClipSpace.y;
			// a_texsize
			array[w.i + 6] = w.glyph.sizeClipSpace.x;
			array[w.i + 7] = w.glyph.sizeClipSpace.y;
		}
		// a_cellpos only changes on resize
	}

	public clear(): void {
		const terminal = this._viewportDims;
		const newCount = terminal.cols * terminal.rows * INDICES_PER_CELL;

		// Clear vertices
		if (this._vertices.count !== newCount) {
			this._vertices.attributes = new Float32Array(newCount);
		} else {
			this._vertices.attributes.fill(0);
		}
		for (let i = 0; i < this._vertices.attributesBuffers.length; i++) {
			if (this._vertices.count !== newCount) {
				this._vertices.attributesBuffers[i] = new Float32Array(newCount);
			} else {
				this._vertices.attributesBuffers[i].fill(0);
			}
		}
		this._vertices.count = newCount;
		let i = 0;
		for (let y = 0; y < terminal.rows; y++) {
			for (let x = 0; x < terminal.cols; x++) {
				this._vertices.attributes[i + 8] = x / terminal.cols;
				this._vertices.attributes[i + 9] = y / terminal.rows;
				i += INDICES_PER_CELL;
			}
		}
	}

	public onResize(): void {
		const gl = this._gl;
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		this.clear();
	}

	public render(renderModel: IRenderModel): void {
		if (!this._atlas) {
			return;
		}

		const gl = this._gl;

		gl.useProgram(this._program);
		gl.bindVertexArray(this._vertexArrayObject);

		// Alternate buffers each frame as the active buffer gets locked while it's in use by the GPU
		this._activeBuffer = (this._activeBuffer + 1) % 2;
		const activeBuffer = this._vertices.attributesBuffers[this._activeBuffer];

		// Copy data for each cell of each line up to its line length (the last non-whitespace cell)
		// from the attributes buffer into activeBuffer, which is the one that gets bound to the GPU.
		// The reasons for this are as follows:
		// - So the active buffer can be alternated so we don't get blocked on rendering finishing
		// - To copy either the normal attributes buffer or the selection attributes buffer when there
		//   is a selection
		// - So we don't send vertices for all the line-ending whitespace to the GPU
		let bufferLength = 0;
		for (let y = 0; y < renderModel.lineLengths.length; y++) {
			const si = y * this._viewportDims.cols * INDICES_PER_CELL;
			const sub = this._vertices.attributes.subarray(si, si + renderModel.lineLengths[y] * INDICES_PER_CELL);
			activeBuffer.set(sub, bufferLength);
			bufferLength += sub.length;
		}

		// Bind the attributes buffer
		gl.bindBuffer(gl.ARRAY_BUFFER, this._attributesBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, activeBuffer.subarray(0, bufferLength), gl.STREAM_DRAW);

		// Bind the texture atlas if it's changed
		if (this._atlas.hasCanvasChanged) {
			this._atlas.hasCanvasChanged = false;
			gl.uniform1i(this._textureLocation, 0);
			gl.activeTexture(gl.TEXTURE0 + 0);
			gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._atlas.cacheCanvas);
			gl.generateMipmap(gl.TEXTURE_2D);
		}

		// Set uniforms
		gl.uniformMatrix4fv(this._projectionLocation, false, PROJECTION_MATRIX);
		gl.uniform2f(this._resolutionLocation, gl.canvas.width, gl.canvas.height);

		// Draw the viewport
		gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, bufferLength / INDICES_PER_CELL);
	}

	public setAtlas(atlas: WebglCharAtlas): void {
		const gl = this._gl;
		this._atlas = atlas;

		gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.cacheCanvas);
		gl.generateMipmap(gl.TEXTURE_2D);
	}

	public setDimensions(dimensions: IRenderDimensions): void {
		this._dimensions = dimensions;
	}
}
