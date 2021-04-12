/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICellRange, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookSelector } from 'vs/workbench/contrib/notebook/common/notebookSelector';

export interface INotebookKernel2ChangeEvent {
	label?: true;
	description?: true;
	detail?: true;
	isPreferred?: true;
	supportedLanguages?: true;
	hasExecutionOrder?: true;
}

export interface INotebookKernel2 {

	readonly id: string;
	readonly selector: NotebookSelector
	readonly extensionId: ExtensionIdentifier;

	readonly onDidChange: Event<INotebookKernel2ChangeEvent>;

	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	supportedLanguages: string[];
	implementsExecutionOrder: boolean;
	implementsInterrupt: boolean;

	localResourceRoot: URI;
	preloads?: URI[];

	setSelected(value: boolean): void;
	executeCells(uri: URI, ranges: ICellRange[]): void;
	cancelCells(uri: URI, ranges: ICellRange[]): void
}

export const INotebookKernelService = createDecorator<INotebookKernelService>('INotebookKernelService');

export interface INotebookKernelService {
	_serviceBrand: undefined;

	onDidAddKernel: Event<INotebookKernel2>;
	onDidRemoveKernel: Event<INotebookKernel2>;

	addKernel(kernel: INotebookKernel2): IDisposable;

	selectKernels(notebook: INotebookTextModel): INotebookKernel2[];
}
