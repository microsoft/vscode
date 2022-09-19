/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { createProgram, expandFloat32Array, PROJECTION_MATRIX, throwIfFalsy } from './WebglUtils';
import { IRenderModel, IWebGLVertexArrayObject, IWebGL2RenderingContext } from './Types';
import { Attributes, BgFlags, FgFlags } from 'common/buffer/Constants';
import { Terminal } from 'xterm';
import { IColor } from 'common/Types';
import { IColorSet } from 'browser/Types';
import { IRenderDimensions } from 'browser/renderer/Types';
import { RENDER_MODEL_BG_OFFSET, RENDER_MODEL_FG_OFFSET, RENDER_MODEL_INDICIES_PER_CELL } from './RenderModel';
import { Disposable, toDisposable } from 'common/Lifecycle';
import { DIM_OPACITY } from 'browser/renderer/Constants';

const enum VertexAttribLocations {
	POSITION = 0,
	SIZE = 1,
	COLOR = 2,
	UNIT_QUAD = 3
}

const vertexShaderSource = `#version 300 es
layout (location = ${VertexAttribLocations.POSITION}) in vec2 a_position;
layout (location = ${VertexAttribLocations.SIZE}) in vec2 a_size;
layout (location = ${VertexAttribLocations.COLOR}) in vec4 a_color;
layout (location = ${VertexAttribLocations.UNIT_QUAD}) in vec2 a_unitquad;

uniform mat4 u_projection;

out vec4 v_color;

void main() {
  vec2 zeroToOne = a_position + (a_unitquad * a_size);
  gl_Position = u_projection * vec4(zeroToOne, 0.0, 1.0);
  v_color = a_color;
}`;

const fragmentShaderSource = `#version 300 es
precision lowp float;

in vec4 v_color;

out vec4 outColor;

void main() {
  outColor = v_color;
}`;

interface IVertices {
	attributes: Float32Array;
	count: number;
}

const INDICES_PER_RECTANGLE = 8;
const BYTES_PER_RECTANGLE = INDICES_PER_RECTANGLE * Float32Array.BYTES_PER_ELEMENT;

const INITIAL_BUFFER_RECTANGLE_CAPACITY = 20 * INDICES_PER_RECTANGLE;

/** Work variables to avoid garbage collection. */
const w: { rgba: number, isDefault: boolean, x1: number, y1: number, r: number, g: number, b: number, a: number } = {
	rgba: 0,
	isDefault: false,
	x1: 0,
	y1: 0,
	r: 0,
	g: 0,
	b: 0,
	a: 0
};

export class RectangleRenderer extends Disposable {

	private _program: WebGLProgram;
	private _vertexArrayObject: IWebGLVertexArrayObject;
	private _attributesBuffer: WebGLBuffer;
	private _projectionLocation: WebGLUniformLocation;
	private _bgFloat!: Float32Array;

	private _vertices: IVertices = {
		count: 0,
		attributes: new Float32Array(INITIAL_BUFFER_RECTANGLE_CAPACITY)
	};

	constructor(
		private _terminal: Terminal,
		private _colors: IColorSet,
		private _gl: IWebGL2RenderingContext,
		private _dimensions: IRenderDimensions
	) {
		super();

		const gl = this._gl;

		this._program = throwIfFalsy(createProgram(gl, vertexShaderSource, fragmentShaderSource));
		this.register(toDisposable(() => gl.deleteProgram(this._program)));

		// Uniform locations
		this._projectionLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_projection'));

		// Create and set the vertex array object
		this._vertexArrayObject = gl.createVertexArray();
		gl.bindVertexArray(this._vertexArrayObject);

		// Setup a_unitquad, this defines the 4 vertices of a rectangle
		const unitQuadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
		const unitQuadVerticesBuffer = gl.createBuffer();
		this.register(toDisposable(() => gl.deleteBuffer(unitQuadVerticesBuffer)));
		gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVerticesBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, unitQuadVertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(VertexAttribLocations.UNIT_QUAD);
		gl.vertexAttribPointer(VertexAttribLocations.UNIT_QUAD, 2, this._gl.FLOAT, false, 0, 0);

		// Setup the unit quad element array buffer, this points to indices in
		// unitQuadVertices to allow is to draw 2 triangles from the vertices
		const unitQuadElementIndices = new Uint8Array([0, 1, 3, 0, 2, 3]);
		const elementIndicesBuffer = gl.createBuffer();
		this.register(toDisposable(() => gl.deleteBuffer(elementIndicesBuffer)));
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementIndicesBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, unitQuadElementIndices, gl.STATIC_DRAW);

		// Setup attributes
		this._attributesBuffer = throwIfFalsy(gl.createBuffer());
		this.register(toDisposable(() => gl.deleteBuffer(this._attributesBuffer)));
		gl.bindBuffer(gl.ARRAY_BUFFER, this._attributesBuffer);
		gl.enableVertexAttribArray(VertexAttribLocations.POSITION);
		gl.vertexAttribPointer(VertexAttribLocations.POSITION, 2, gl.FLOAT, false, BYTES_PER_RECTANGLE, 0);
		gl.vertexAttribDivisor(VertexAttribLocations.POSITION, 1);
		gl.enableVertexAttribArray(VertexAttribLocations.SIZE);
		gl.vertexAttribPointer(VertexAttribLocations.SIZE, 2, gl.FLOAT, false, BYTES_PER_RECTANGLE, 2 * Float32Array.BYTES_PER_ELEMENT);
		gl.vertexAttribDivisor(VertexAttribLocations.SIZE, 1);
		gl.enableVertexAttribArray(VertexAttribLocations.COLOR);
		gl.vertexAttribPointer(VertexAttribLocations.COLOR, 4, gl.FLOAT, false, BYTES_PER_RECTANGLE, 4 * Float32Array.BYTES_PER_ELEMENT);
		gl.vertexAttribDivisor(VertexAttribLocations.COLOR, 1);

		this._updateCachedColors();
	}

	public render(): void {
		const gl = this._gl;

		gl.useProgram(this._program);

		gl.bindVertexArray(this._vertexArrayObject);

		gl.uniformMatrix4fv(this._projectionLocation, false, PROJECTION_MATRIX);

		// Bind attributes buffer and draw
		gl.bindBuffer(gl.ARRAY_BUFFER, this._attributesBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this._vertices.attributes, gl.DYNAMIC_DRAW);
		gl.drawElementsInstanced(this._gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, this._vertices.count);
	}

	public onResize(): void {
		this._updateViewportRectangle();
	}

	public setColors(): void {
		this._updateCachedColors();
		this._updateViewportRectangle();
	}

	public setDimensions(dimensions: IRenderDimensions): void {
		this._dimensions = dimensions;
	}

	private _updateCachedColors(): void {
		this._bgFloat = this._colorToFloat32Array(this._colors.background);
	}

	private _updateViewportRectangle(): void {
		// Set first rectangle that clears the screen
		this._addRectangleFloat(
			this._vertices.attributes,
			0,
			0,
			0,
			this._terminal.cols * this._dimensions.scaledCellWidth,
			this._terminal.rows * this._dimensions.scaledCellHeight,
			this._bgFloat
		);
	}

	public updateBackgrounds(model: IRenderModel): void {
		const terminal = this._terminal;
		const vertices = this._vertices;

		// Declare variable ahead of time to avoid garbage collection
		let rectangleCount = 1;
		let y: number;
		let x: number;
		let currentStartX: number;
		let currentBg: number;
		let currentFg: number;
		let currentInverse: boolean;
		let modelIndex: number;
		let bg: number;
		let fg: number;
		let inverse: boolean;
		let offset: number;

		for (y = 0; y < terminal.rows; y++) {
			currentStartX = -1;
			currentBg = 0;
			currentFg = 0;
			currentInverse = false;
			for (x = 0; x < terminal.cols; x++) {
				modelIndex = ((y * terminal.cols) + x) * RENDER_MODEL_INDICIES_PER_CELL;
				bg = model.cells[modelIndex + RENDER_MODEL_BG_OFFSET];
				fg = model.cells[modelIndex + RENDER_MODEL_FG_OFFSET];
				inverse = !!(fg & FgFlags.INVERSE);
				if (bg !== currentBg || (fg !== currentFg && (currentInverse || inverse))) {
					// A rectangle needs to be drawn if going from non-default to another color
					if (currentBg !== 0 || (currentInverse && currentFg !== 0)) {
						offset = rectangleCount++ * INDICES_PER_RECTANGLE;
						this._updateRectangle(vertices, offset, currentFg, currentBg, currentStartX, x, y);
					}
					currentStartX = x;
					currentBg = bg;
					currentFg = fg;
					currentInverse = inverse;
				}
			}
			// Finish rectangle if it's still going
			if (currentBg !== 0 || (currentInverse && currentFg !== 0)) {
				offset = rectangleCount++ * INDICES_PER_RECTANGLE;
				this._updateRectangle(vertices, offset, currentFg, currentBg, currentStartX, terminal.cols, y);
			}
		}
		vertices.count = rectangleCount;
	}

	private _updateRectangle(vertices: IVertices, offset: number, fg: number, bg: number, startX: number, endX: number, y: number): void {
		w.isDefault = false;
		if (fg & FgFlags.INVERSE) {
			switch (fg & Attributes.CM_MASK) {
				case Attributes.CM_P16:
				case Attributes.CM_P256:
					w.rgba = this._colors.ansi[fg & Attributes.PCOLOR_MASK].rgba;
					break;
				case Attributes.CM_RGB:
					w.rgba = (fg & Attributes.RGB_MASK) << 8;
					break;
				case Attributes.CM_DEFAULT:
				default:
					w.rgba = this._colors.foreground.rgba;
			}
		} else {
			switch (bg & Attributes.CM_MASK) {
				case Attributes.CM_P16:
				case Attributes.CM_P256:
					w.rgba = this._colors.ansi[bg & Attributes.PCOLOR_MASK].rgba;
					break;
				case Attributes.CM_RGB:
					w.rgba = (bg & Attributes.RGB_MASK) << 8;
					break;
				case Attributes.CM_DEFAULT:
				default:
					w.rgba = this._colors.background.rgba;
					w.isDefault = true;
			}
		}

		if (vertices.attributes.length < offset + 4) {
			vertices.attributes = expandFloat32Array(vertices.attributes, this._terminal.rows * this._terminal.cols * INDICES_PER_RECTANGLE);
		}
		w.x1 = startX * this._dimensions.scaledCellWidth;
		w.y1 = y * this._dimensions.scaledCellHeight;
		w.r = ((w.rgba >> 24) & 0xFF) / 255;
		w.g = ((w.rgba >> 16) & 0xFF) / 255;
		w.b = ((w.rgba >> 8) & 0xFF) / 255;
		w.a = (!w.isDefault && bg & BgFlags.DIM) ? DIM_OPACITY : 1;

		this._addRectangle(vertices.attributes, offset, w.x1, w.y1, (endX - startX) * this._dimensions.scaledCellWidth, this._dimensions.scaledCellHeight, w.r, w.g, w.b, w.a);
	}

	private _addRectangle(array: Float32Array, offset: number, x1: number, y1: number, width: number, height: number, r: number, g: number, b: number, a: number): void {
		array[offset] = x1 / this._dimensions.scaledCanvasWidth;
		array[offset + 1] = y1 / this._dimensions.scaledCanvasHeight;
		array[offset + 2] = width / this._dimensions.scaledCanvasWidth;
		array[offset + 3] = height / this._dimensions.scaledCanvasHeight;
		array[offset + 4] = r;
		array[offset + 5] = g;
		array[offset + 6] = b;
		array[offset + 7] = a;
	}

	private _addRectangleFloat(array: Float32Array, offset: number, x1: number, y1: number, width: number, height: number, color: Float32Array): void {
		array[offset] = x1 / this._dimensions.scaledCanvasWidth;
		array[offset + 1] = y1 / this._dimensions.scaledCanvasHeight;
		array[offset + 2] = width / this._dimensions.scaledCanvasWidth;
		array[offset + 3] = height / this._dimensions.scaledCanvasHeight;
		array[offset + 4] = color[0];
		array[offset + 5] = color[1];
		array[offset + 6] = color[2];
		array[offset + 7] = color[3];
	}

	private _colorToFloat32Array(color: IColor): Float32Array {
		return new Float32Array([
			((color.rgba >> 24) & 0xFF) / 255,
			((color.rgba >> 16) & 0xFF) / 255,
			((color.rgba >> 8) & 0xFF) / 255,
			((color.rgba) & 0xFF) / 255
		]);
	}
}
