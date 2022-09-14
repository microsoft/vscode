/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { Event } from 'vs/base/common/event';
import { INotebookRendererInfo, NotebookData, TransientOptions, IOrderedMimeType, IOutputDto, INotebookContributionData, NotebookExtensionDescription } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { IDisposable } from 'vs/base/common/lifecycle';
import { VSBuffer } from 'vs/base/common/buffer';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';


export const INotebookService = createDecorator<INotebookService>('notebookService');

export interface INotebookContentProvider {
	options: TransientOptions;

	open(uri: URI, backupId: string | VSBuffer | undefined, untitledDocumentData: VSBuffer | undefined, token: CancellationToken): Promise<{ data: NotebookData; transientOptions: TransientOptions }>;
	backup(uri: URI, token: CancellationToken): Promise<string | VSBuffer>;
}

export interface INotebookSerializer {
	options: TransientOptions;
	dataToNotebook(data: VSBuffer): Promise<NotebookData>;
	notebookToData(data: NotebookData): Promise<VSBuffer>;
}

export interface INotebookRawData {
	data: NotebookData;
	transientOptions: TransientOptions;
}

export class ComplexNotebookProviderInfo {
	constructor(
		readonly viewType: string,
		readonly controller: INotebookContentProvider,
		readonly extensionData: NotebookExtensionDescription
	) { }
}

export class SimpleNotebookProviderInfo {
	constructor(
		readonly viewType: string,
		readonly serializer: INotebookSerializer,
		readonly extensionData: NotebookExtensionDescription
	) { }
}

export interface INotebookService {
	readonly _serviceBrand: undefined;
	canResolve(viewType: string): Promise<boolean>;

	readonly onWillRemoveViewType: Event<string>;
	readonly onDidChangeOutputRenderers: Event<void>;
	readonly onWillAddNotebookDocument: Event<NotebookTextModel>;
	readonly onDidAddNotebookDocument: Event<NotebookTextModel>;

	readonly onWillRemoveNotebookDocument: Event<NotebookTextModel>;
	readonly onDidRemoveNotebookDocument: Event<NotebookTextModel>;

	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: INotebookContentProvider): IDisposable;
	registerNotebookSerializer(viewType: string, extensionData: NotebookExtensionDescription, serializer: INotebookSerializer): IDisposable;
	withNotebookDataProvider(viewType: string): Promise<ComplexNotebookProviderInfo | SimpleNotebookProviderInfo>;

	getOutputMimeTypeInfo(textModel: NotebookTextModel, kernelProvides: readonly string[] | undefined, output: IOutputDto): readonly IOrderedMimeType[];

	getRendererInfo(id: string): INotebookRendererInfo | undefined;
	getRenderers(): INotebookRendererInfo[];

	/** Updates the preferred renderer for the given mimetype in the workspace. */
	updateMimePreferredRenderer(viewType: string, mimeType: string, rendererId: string, otherMimetypes: readonly string[]): void;
	saveMimeDisplayOrder(target: ConfigurationTarget): void;

	createNotebookTextModel(viewType: string, uri: URI, data: NotebookData, transientOptions: TransientOptions): NotebookTextModel;
	getNotebookTextModel(uri: URI): NotebookTextModel | undefined;
	getNotebookTextModels(): Iterable<NotebookTextModel>;
	listNotebookDocuments(): readonly NotebookTextModel[];

	registerContributedNotebookType(viewType: string, data: INotebookContributionData): IDisposable;
	getContributedNotebookType(viewType: string): NotebookProviderInfo | undefined;
	getContributedNotebookTypes(resource?: URI): readonly NotebookProviderInfo[];
	getNotebookProviderResourceRoots(): URI[];

	setToCopy(items: NotebookCellTextModel[], isCopy: boolean): void;
	getToCopy(): { items: NotebookCellTextModel[]; isCopy: boolean } | undefined;
	clearEditorCache(): void;
}
