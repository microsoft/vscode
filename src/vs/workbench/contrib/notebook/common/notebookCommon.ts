/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRelativePattern } from 'vs/base/common/glob';

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

/**
 * @internal
 */

export interface INotebookSelectors {
	readonly filenamePattern?: string;
}

/**
 * @internal
 */
export interface IStreamOutput {
	output_type: 'stream';
	text: string;
}

/**
 * @internal
 */
export interface IErrorOutput {
	output_type: 'error';
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

/**
 * @internal
 */
export interface IDisplayOutput {
	output_type: 'display_data' | 'execute_result';
	/**
	 * { mime_type: value }
	 */
	data: { [key: string]: any; }
}

/**
 * @internal
 */
export interface IGenericOutput {
	output_type: string;
	pickedMimeType?: string;
	pickedRenderer?: number;
	transformedOutput?: { [key: string]: IDisplayOutput };
}

/**
 * @internal
 */
export type IOutput = IGenericOutput;

/**
 * @internal
 */
export interface ICell {
	readonly uri: URI;
	handle: number;
	source: string[];
	language: string;
	cell_type: 'markdown' | 'code';
	outputs: IOutput[];
	onDidChangeOutputs?: Event<NotebookCellOutputsSplice[]>;
	isDirty: boolean;
}

/**
 * @internal
 */
export interface LanguageInfo {
	file_extension: string;
}

/**
 * @internal
 */
export interface IMetadata {
	language_info: LanguageInfo;
}

/**
 * @internal
 */
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

export interface IOutputTransformContribution {
	/**
	 * Dispose this contribution.
	 */
	dispose(): void;

	render(output: IOutput, container: HTMLElement, preferredMimeType: string | undefined): IRenderOutput;
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

export function generateCellPath(cell_type: string, cellHandle: number): string {
	return `/cell_${cellHandle}${cell_type === 'markdown' ? '.md' : ''}`;
}

export function parseCellHandle(path: string): number | undefined {
	const regex = new RegExp(/cell_(\d*)(\.)?/g);
	let matches = regex.exec(path);

	if (matches && matches.length > 1) {
		return Number(matches[1]);
	}

	return;
}
