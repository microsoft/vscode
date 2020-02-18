/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { notebookExtensionPoint } from 'vs/workbench/contrib/notebook/browser/extensionPoint';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { NotebookExtensionDescription } from 'vs/workbench/api/common/extHost.protocol';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebook, ICell, INotebookMimeTypeSelector } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { basename, extname } from 'vs/base/common/path';

export function createCellUri(viewType: string, notebook: INotebook, cell: ICell): URI {
	//vscode-notebook://<viewType>/cell_<cellHandle>.ext
	// @todo Jo,Peng: `authority` will be transformed to lower case in `URI.toString()`, so we won't retrive the same viewType later on.
	return URI.from({
		scheme: 'vscode-notebook',
		authority: viewType,
		path: `/cell_${cell.handle}.${cell.cell_type === 'markdown' ? 'md' : 'py'}`,
		query: notebook.uri.toString()
	});
}

export function parseCellUri(resource: URI): { viewType: string, notebook: URI, cellHandle: number } | undefined {
	//vscode-notebook://<viewType>/cell_<cellHandle>.ext
	const match = /cell_(\d+)/.exec(basename(resource.path, extname(resource.path)));
	if (!match) {
		return undefined;
	}
	const viewType = resource.authority;
	const notebook = URI.parse(resource.query);
	return { viewType, notebook, cellHandle: parseInt(match[1]) };
}

function MODEL_ID(resource: URI): string {
	return resource.toString();
}

export const INotebookService = createDecorator<INotebookService>('notebookService');

export interface IMainNotebookController {
	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	updateNotebook(uri: URI, notebook: INotebook): void;
	updateNotebookActiveCell(uri: URI, cellHandle: number): void;
	createRawCell(uri: URI, index: number, language: string, type: 'markdown' | 'code'): Promise<ICell | undefined>;
	deleteCell(uri: URI, index: number): Promise<boolean>
	executeNotebookActiveCell(uri: URI): void;
	destoryNotebookDocument(notebook: INotebook): Promise<void>;
}

export interface INotebookService {
	_serviceBrand: undefined;
	onDidChangeActiveEditor: Event<{ viewType: string, uri: URI }>;
	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController): void;
	unregisterNotebookProvider(viewType: string): void;
	registerNotebookRenderer(handle: number, extensionData: NotebookExtensionDescription, selectors: INotebookMimeTypeSelector, preloads: URI[]): void;
	unregisterNotebookRenderer(handle: number): void;
	getRendererPreloads(handle: number): URI[];
	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	executeNotebookActiveCell(viewType: string, uri: URI): Promise<void>;
	getContributedNotebookProviders(resource: URI): readonly NotebookProviderInfo[];
	getNotebookProviderResourceRoots(): URI[];
	updateNotebookActiveCell(viewType: string, resource: URI, cellHandle: number): void;
	createNotebookCell(viewType: string, resource: URI, index: number, language: string, type: 'markdown' | 'code'): Promise<ICell | undefined>;
	deleteNotebookCell(viewType: string, resource: URI, index: number): Promise<boolean>;
	destoryNotebookDocument(viewType: string, notebook: INotebook): void;
	updateActiveNotebookDocument(viewType: string, resource: URI): void;
}

export class NotebookInfoStore {
	private readonly contributedEditors = new Map<string, NotebookProviderInfo>();

	clear() {
		this.contributedEditors.clear();
	}

	get(viewType: string): NotebookProviderInfo | undefined {
		return this.contributedEditors.get(viewType);
	}

	add(info: NotebookProviderInfo): void {
		if (this.contributedEditors.has(info.id)) {
			console.log(`Custom editor with id '${info.id}' already registered`);
			return;
		}
		this.contributedEditors.set(info.id, info);
	}

	getContributedNotebook(resource: URI): readonly NotebookProviderInfo[] {
		return Array.from(this.contributedEditors.values()).filter(customEditor =>
			customEditor.matches(resource));
	}
}

class ModelData implements IDisposable {
	private readonly _modelEventListeners = new DisposableStore();

	constructor(
		public model: INotebook,
		onWillDispose: (model: INotebook) => void
	) {
		this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
	}

	dispose(): void {
		this._modelEventListeners.dispose();
	}
}


export class NotebookService extends Disposable implements INotebookService {
	_serviceBrand: undefined;
	private readonly _notebookProviders = new Map<string, { controller: IMainNotebookController, extensionData: NotebookExtensionDescription }>();
	private readonly _notebookRenderers = new Map<number, { extensionData: NotebookExtensionDescription, selectors: INotebookMimeTypeSelector, preloads: URI[] }>();
	notebookProviderInfoStore: NotebookInfoStore = new NotebookInfoStore();
	private readonly _models: { [modelId: string]: ModelData; };
	private _onDidChangeActiveEditor = new Emitter<{ viewType: string, uri: URI }>();
	onDidChangeActiveEditor: Event<{ viewType: string, uri: URI }> = this._onDidChangeActiveEditor.event;

	constructor() {
		super();

		this._models = {};
		notebookExtensionPoint.setHandler((extensions) => {
			this.notebookProviderInfoStore.clear();

			for (const extension of extensions) {
				for (const notebookContribution of extension.value) {
					this.notebookProviderInfoStore.add(new NotebookProviderInfo({
						id: notebookContribution.viewType,
						displayName: notebookContribution.displayName,
						selector: notebookContribution.selector || [],
					}));
				}
			}
			// console.log(this._notebookProviderInfoStore);
		});

	}

	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController) {
		this._notebookProviders.set(viewType, { extensionData, controller });
	}

	unregisterNotebookProvider(viewType: string): void {
		this._notebookProviders.delete(viewType);
	}

	registerNotebookRenderer(handle: number, extensionData: NotebookExtensionDescription, selectors: INotebookMimeTypeSelector, preloads: URI[]) {
		this._notebookRenderers.set(handle, { extensionData, selectors, preloads });
	}

	unregisterNotebookRenderer(handle: number) {
		this._notebookRenderers.delete(handle);
	}

	getRendererPreloads(handle: number): URI[] {
		return this._notebookRenderers.get(handle)?.preloads || [];
	}

	async resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		const provider = this._notebookProviders.get(viewType);
		if (!provider) {
			return undefined;
		}

		const notebookModel = await provider.controller.resolveNotebook(viewType, uri);
		if (!notebookModel) {
			return undefined;
		}

		// new notebook model created
		const modelId = MODEL_ID(uri);
		const modelData = new ModelData(
			notebookModel,
			(model) => this._onWillDispose(model),
		);
		this._models[modelId] = modelData;
		return modelData.model;
	}

	updateNotebookActiveCell(viewType: string, resource: URI, cellHandle: number): void {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			provider.controller.updateNotebookActiveCell(resource, cellHandle);
		}
	}

	async createNotebookCell(viewType: string, resource: URI, index: number, language: string, type: 'markdown' | 'code'): Promise<ICell | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.createRawCell(resource, index, language, type);
		}

		return;
	}

	async deleteNotebookCell(viewType: string, resource: URI, index: number): Promise<boolean> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.deleteCell(resource, index);
		}

		return false;
	}

	async executeNotebook(viewType: string, uri: URI): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.executeNotebook(viewType, uri);
		}

		return;
	}

	async executeNotebookActiveCell(viewType: string, uri: URI): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			await provider.controller.executeNotebookActiveCell(uri);
		}
	}

	getContributedNotebookProviders(resource: URI): readonly NotebookProviderInfo[] {
		return this.notebookProviderInfoStore.getContributedNotebook(resource);
	}

	getNotebookProviderResourceRoots(): URI[] {
		let ret: URI[] = [];
		this._notebookProviders.forEach(val => {
			ret.push(URI.revive(val.extensionData.location));
		});

		return ret;
	}

	destoryNotebookDocument(viewType: string, notebook: INotebook): void {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			provider.controller.destoryNotebookDocument(notebook);
		}
	}

	updateActiveNotebookDocument(viewType: string, resource: URI): void {
		this._onDidChangeActiveEditor.fire({ viewType, uri: resource });
	}

	private _onWillDispose(model: INotebook): void {
		let modelId = MODEL_ID(model.uri);
		let modelData = this._models[modelId];

		delete this._models[modelId];
		modelData?.dispose();

		// this._onModelRemoved.fire(model);
	}
}
