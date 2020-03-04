/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRelativePattern } from 'vs/base/common/glob';
import { PieceTreeTextBufferFactory } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export enum CellKind {
	Markdown = 1,
	Code = 2
}

export enum CellOutputKind {
	Text = 1,
	Error = 2,
	Rich = 3
}

export const NOTEBOOK_DISPLAY_ORDER = [
	'application/json',
	'application/javascript',
	'text/html',
	'image/svg+xml',
	'text/markdown',
	'image/svg+xml',
	'image/png',
	'image/jpeg',
	'text/plain'
];

export interface INotebookDisplayOrder {
	defaultOrder: (string | IRelativePattern)[];
	userOrder?: (string | IRelativePattern)[];
}

export interface INotebookMimeTypeSelector {
	type: string;
	subTypes?: string[];
}

export interface INotebookRendererInfo {
	id: ExtensionIdentifier;
	extensionLocation: URI,
	preloads: URI[]
}

export interface INotebookSelectors {
	readonly filenamePattern?: string;
}

export interface IStreamOutput {
	outputKind: CellOutputKind.Text;
	text: string;
}

export interface IErrorOutput {
	outputKind: CellOutputKind.Error;
	/**
	 * Exception Name
	 */
	ename?: string;
	/**
	 * Exception Value
	 */
	evalue?: string;
	/**
	 * Exception call stacks
	 */
	traceback?: string[];
}

export interface IDisplayOutput {
	outputKind: CellOutputKind.Rich;
	/**
	 * { mime_type: value }
	 */
	data: { [key: string]: any; }
}

export enum MimeTypeRendererResolver {
	Core,
	Active,
	Lazy
}

export interface IOrderedMimeType {
	mimeType: string;
	isResolved: boolean;
	rendererId?: number;
	output?: string;
}

export interface ITransformedDisplayOutputDto {
	outputKind: CellOutputKind.Rich;
	data: { [key: string]: any; }

	orderedMimeTypes: IOrderedMimeType[];
	pickedMimeTypeIndex: number;
}

export interface IGenericOutput {
	outputKind: CellOutputKind;
	pickedMimeType?: string;
	pickedRenderer?: number;
	transformedOutput?: { [key: string]: IDisplayOutput };
}

export type IOutput = ITransformedDisplayOutputDto | IStreamOutput | IErrorOutput;

export interface ICell {
	readonly uri: URI;
	handle: number;
	source: string[];
	language: string;
	cellKind: CellKind;
	outputs: IOutput[];
	onDidChangeOutputs?: Event<NotebookCellOutputsSplice[]>;
	isDirty: boolean;
	resolveTextBufferFactory(): PieceTreeTextBufferFactory;
}

export interface LanguageInfo {
	file_extension: string;
}

export interface IMetadata {
	language_info: LanguageInfo;
}

export interface INotebook {
	handle: number;
	viewType: string;
	// metadata: IMetadata;
	readonly uri: URI;
	languages: string[];
	cells: ICell[];
	renderers: Set<number>;
	onDidChangeCells?: Event<NotebookCellsSplice[]>;
	onDidChangeDirtyState: Event<boolean>;
	onWillDispose(listener: () => void): IDisposable;
	save(): Promise<boolean>;
}

export interface IRenderOutput {
	shadowContent?: string;
	hasDynamicHeight: boolean;
}

export const CELL_MARGIN = 24;

export const EDITOR_TOP_PADDING = 8;
export const EDITOR_BOTTOM_PADDING = 8;


export type NotebookCellsSplice = [
	number /* start */,
	number /* delete count */,
	ICell[]
];

export type NotebookCellOutputsSplice = [
	number /* start */,
	number /* delete count */,
	IOutput[]
];

export function parseCellUri(resource: URI): { viewType: string, notebook: URI } | undefined {
	//vscode-notebook://<viewType>/cell_<cellHandle>.ext
	if (resource.scheme !== 'vscode-notebook') {
		return undefined;
	}
	// @todo Jo,Peng: `authority` will be transformed to lower case in `URI.toString()`, so we won't retrive the same viewType later on.
	const viewType = resource.authority;
	const notebook = URI.parse(resource.query);
	return { viewType, notebook };
}

export function generateCellPath(cellKind: CellKind, cellHandle: number): string {
	return `/cell_${cellHandle}${cellKind === CellKind.Markdown ? '.md' : ''}`;
}

export function parseCellHandle(path: string): number | undefined {
	const regex = new RegExp(/cell_(\d*)(\.)?/g);
	let matches = regex.exec(path);

	if (matches && matches.length > 1) {
		return Number(matches[1]);
	}

	return;
}

export function mimeTypeSupportedByCore(mimeType: string) {
	if ([
		'application/json',
		'application/javascript',
		'text/html',
		'image/svg+xml',
		'text/markdown',
		'image/png',
		'image/jpeg',
		'text/plain',
		'text/x-javascript'
	].indexOf(mimeType) > -1) {
		return true;
	}

	return false;
}


