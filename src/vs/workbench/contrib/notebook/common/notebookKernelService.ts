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
	readonly extension: ExtensionIdentifier;

	readonly onDidChange: Event<INotebookKernel2ChangeEvent>;

	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	supportedLanguages: string[];
	implementsExecutionOrder: boolean;
	implementsInterrupt: boolean;

	localResourceRoot: URI;
	preloadUris: URI[];
	preloadProvides: string[];

	executeNotebookCellsRequest(uri: URI, ranges: ICellRange[]): void;
	cancelNotebookCellExecution(uri: URI, ranges: ICellRange[]): void
}

export interface INotebookKernelBindEvent {
	notebook: URI;
	oldKernel: INotebookKernel2 | undefined;
	newKernel: INotebookKernel2 | undefined;
}

export const INotebookKernelService = createDecorator<INotebookKernelService>('INotebookKernelService');

export interface INotebookKernelService {
	_serviceBrand: undefined;

	readonly onDidAddKernel: Event<INotebookKernel2>;
	readonly onDidRemoveKernel: Event<INotebookKernel2>;
	readonly onDidChangeNotebookKernelBinding: Event<INotebookKernelBindEvent>;

	registerKernel(kernel: INotebookKernel2): IDisposable;
	getKernels(notebook: INotebookTextModel): INotebookKernel2[];

	/**
	 * Bind a notebook document to a kernel. A notebook is only bound to one kernel
	 * but a kernel can be bound to many notebooks (depending on its configuration)
	 */
	updateNotebookKernelBinding(notebook: INotebookTextModel, kernel: INotebookKernel2 | undefined): void;
}
