/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IVisibleLine } from 'vs/editor/browser/view/viewLayer';

export const enum BindingId {
	GlyphInfo0,
	GlyphInfo1,
	Cells,
	TextureSampler,
	Texture,
	CanvasDimensionsUniform,
	AtlasDimensionsUniform,
	ScrollOffset,
}

export interface IRendererContext<T extends IVisibleLine> {
	rendLineNumberStart: number;
	lines: T[];
	linesLength: number;
}

export interface IRenderStrategy<T extends IVisibleLine> {
	readonly wgsl: string;
	readonly bindGroupEntries: GPUBindGroupEntry[];

	update(ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): number;
	draw?(pass: GPURenderPassEncoder, ctx: IRendererContext<T>, startLineNumber: number, stopLineNumber: number, deltaTop: number[]): void;
}
