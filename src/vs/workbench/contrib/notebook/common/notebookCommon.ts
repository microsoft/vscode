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
	output_type: 'display_data';
	/**
	 * { mime_type: value }
	 */
	data: { string: string };
}

/**
 * @internal
 */
export interface IGenericOutput {
	output_type: string;
	pickedMimeType?: string;
	// transformedOutput?: IGenericOutput;
}

/**
 * @internal
 */
export type IOutput = IGenericOutput;

/**
 * @internal
 */
export interface ICell {
	handle: number;
	source: string[];
	language: string;
	cell_type: 'markdown' | 'code';
	outputs: IOutput[];
	onDidChangeOutputs?: Event<void>;
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
	// metadata: IMetadata;
	readonly uri: URI;
	languages: string[];
	cells: ICell[];
	renderers: Set<number>;
	onDidChangeCells?: Event<void>;
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

	render(output: IOutput, container: HTMLElement): IRenderOutput;
}


export const CELL_MARGIN = 24;

