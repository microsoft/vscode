/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

/**
 * Represents a rasterized glyph within a texture atlas. Some numbers are
 * tracked in CSS pixels as well in order to reduce calculations during the
 * render loop.
 */
export interface IRasterizedGlyph {
	/**
	 * The x and y offset between the glyph's top/left and the top/left of a cell
	 * in pixels.
	 */
	offset: IVector;
	/**
	 * the x and y position of the glyph in the texture in pixels.
	 */
	texturePosition: IVector;
	/**
	 * the x and y position of the glyph in the texture in clip space coordinates.
	 */
	texturePositionClipSpace: IVector;
	/**
	 * The width and height of the glyph in the texture in pixels.
	 */
	size: IVector;
	/**
	 * The width and height of the glyph in the texture in clip space coordinates.
	 */
	sizeClipSpace: IVector;
}

export interface IVector {
	x: number;
	y: number;
}

export interface IBoundingBox {
	top: number;
	left: number;
	right: number;
	bottom: number;
}

export interface IRenderModel {
	cells: Uint32Array;
	lineLengths: Uint32Array;
	selection: ISelectionRenderModel;
}

export interface ISelectionRenderModel {
	hasSelection: boolean;
	columnSelectMode: boolean;
	viewportStartRow: number;
	viewportEndRow: number;
	viewportCappedStartRow: number;
	viewportCappedEndRow: number;
	startCol: number;
	endCol: number;
}

export interface IWebGL2RenderingContext extends WebGLRenderingContext {
	vertexAttribDivisor(index: number, divisor: number): void;
	createVertexArray(): IWebGLVertexArrayObject;
	bindVertexArray(vao: IWebGLVertexArrayObject): void;
	drawElementsInstanced(mode: number, count: number, type: number, offset: number, instanceCount: number): void;
}

export interface IWebGLVertexArrayObject {
}
