/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { NotebookExtensionDescription } from 'vs/workbench/api/common/extHost.protocol';
import { Event } from 'vs/base/common/event';
import { INotebookTextModel, INotebookRendererInfo, NotebookDocumentMetadata, ICellDto2, INotebookKernelInfo, INotebookKernelInfoDto, INotebookTextModelBackup, IEditor, ICellEditOperation, NotebookCellOutputsSplice, IOrderedMimeType, IProcessedOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookEditorModelManager } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';

export const INotebookService = createDecorator<INotebookService>('notebookService');

export interface IMainNotebookController {
	kernel: INotebookKernelInfoDto | undefined;
	createNotebook(viewType: string, uri: URI, backup: INotebookTextModelBackup | undefined, forceReload: boolean, editorId?: string): Promise<NotebookTextModel | undefined>;
	executeNotebook(viewType: string, uri: URI, useAttachedKernel: boolean, token: CancellationToken): Promise<void>;
	onDidReceiveMessage(editorId: string, message: any): void;
	executeNotebookCell(uri: URI, handle: number, useAttachedKernel: boolean, token: CancellationToken): Promise<void>;
	removeNotebookDocument(notebook: INotebookTextModel): Promise<void>;
	save(uri: URI, token: CancellationToken): Promise<boolean>;
	saveAs(uri: URI, target: URI, token: CancellationToken): Promise<boolean>;
}

export interface INotebookService {
	_serviceBrand: undefined;
	modelManager: INotebookEditorModelManager;
	canResolve(viewType: string): Promise<boolean>;
	onDidChangeActiveEditor: Event<string | null>;
	onDidChangeVisibleEditors: Event<string[]>;
	onNotebookEditorAdd: Event<IEditor>;
	onNotebookEditorRemove: Event<IEditor>;
	onDidChangeKernels: Event<void>;
	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController): void;
	unregisterNotebookProvider(viewType: string): void;
	registerNotebookRenderer(id: string, renderer: INotebookRendererInfo): void;
	unregisterNotebookRenderer(id: string): void;
	transformEditsOutputs(textModel: NotebookTextModel, edits: ICellEditOperation[]): Promise<void>;
	transformSpliceOutputs(textModel: NotebookTextModel, splices: NotebookCellOutputsSplice[]): Promise<void>;
	transformSingleOutput(textModel: NotebookTextModel, output: IProcessedOutput, rendererId: string, mimeType: string): Promise<IOrderedMimeType | undefined>;
	registerNotebookKernel(kernel: INotebookKernelInfo): void;
	unregisterNotebookKernel(id: string): void;
	getContributedNotebookKernels(viewType: string, resource: URI): readonly INotebookKernelInfo[];
	getRendererInfo(id: string): INotebookRendererInfo | undefined;
	resolveNotebook(viewType: string, uri: URI, forceReload: boolean, editorId?: string): Promise<NotebookTextModel | undefined>;
	createNotebookFromBackup(viewType: string, uri: URI, metadata: NotebookDocumentMetadata, languages: string[], cells: ICellDto2[], editorId?: string): Promise<NotebookTextModel | undefined>;
	executeNotebook(viewType: string, uri: URI, useAttachedKernel: boolean, token: CancellationToken): Promise<void>;
	executeNotebookCell(viewType: string, uri: URI, handle: number, useAttachedKernel: boolean, token: CancellationToken): Promise<void>;
	executeNotebook2(viewType: string, uri: URI, kernelId: string, token: CancellationToken): Promise<void>;
	executeNotebookCell2(viewType: string, uri: URI, handle: number, kernelId: string, token: CancellationToken): Promise<void>;
	getContributedNotebookProviders(resource: URI): readonly NotebookProviderInfo[];
	getContributedNotebookProvider(viewType: string): NotebookProviderInfo | undefined;
	getNotebookProviderResourceRoots(): URI[];
	destoryNotebookDocument(viewType: string, notebook: INotebookTextModel): void;
	updateActiveNotebookEditor(editor: IEditor | null): void;
	updateVisibleNotebookEditor(editors: string[]): void;
	save(viewType: string, resource: URI, token: CancellationToken): Promise<boolean>;
	saveAs(viewType: string, resource: URI, target: URI, token: CancellationToken): Promise<boolean>;
	onDidReceiveMessage(viewType: string, editorId: string, message: any): void;
	setToCopy(items: NotebookCellTextModel[]): void;
	getToCopy(): NotebookCellTextModel[] | undefined;

	// editor events
	addNotebookEditor(editor: IEditor): void;
	removeNotebookEditor(editor: IEditor): void;
	listNotebookEditors(): readonly IEditor[];
	listNotebookDocuments(): readonly NotebookTextModel[];

}
