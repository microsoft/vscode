/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { notebookProviderExtensionPoint, notebookRendererExtensionPoint } from 'vs/workbench/contrib/notebook/browser/extensionPoint';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { NotebookExtensionDescription } from 'vs/workbench/api/common/extHost.protocol';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookTextModel, ICell, INotebookMimeTypeSelector, INotebookRendererInfo, CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { NotebookOutputRendererInfo } from 'vs/workbench/contrib/notebook/common/notebookOutputRenderer';
import { Iterable } from 'vs/base/common/iterator';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';

function MODEL_ID(resource: URI): string {
	return resource.toString();
}

export const INotebookService = createDecorator<INotebookService>('notebookService');

export interface IMainNotebookController {
	resolveNotebook(viewType: string, uri: URI): Promise<NotebookTextModel | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	createRawCell(uri: URI, index: number, language: string, type: CellKind): Promise<NotebookCellTextModel | undefined>;
	deleteCell(uri: URI, index: number): Promise<boolean>
	onDidReceiveMessage(uri: URI, message: any): void;
	executeNotebookCell(uri: URI, handle: number): Promise<void>;
	destoryNotebookDocument(notebook: INotebookTextModel): Promise<void>;
	save(uri: URI): Promise<boolean>;
}

export interface INotebookService {
	_serviceBrand: undefined;
	canResolve(viewType: string): Promise<void>;
	onDidChangeActiveEditor: Event<{ viewType: string, uri: URI }>;
	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController): void;
	unregisterNotebookProvider(viewType: string): void;
	registerNotebookRenderer(handle: number, extensionData: NotebookExtensionDescription, type: string, selectors: INotebookMimeTypeSelector, preloads: URI[]): void;
	unregisterNotebookRenderer(handle: number): void;
	getRendererInfo(handle: number): INotebookRendererInfo | undefined;
	resolveNotebook(viewType: string, uri: URI): Promise<NotebookTextModel | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	executeNotebookCell(viewType: string, uri: URI, handle: number): Promise<void>;

	getContributedNotebookProviders(resource: URI): readonly NotebookProviderInfo[];
	getNotebookProviderResourceRoots(): URI[];
	createNotebookCell(viewType: string, resource: URI, index: number, language: string, type: CellKind): Promise<ICell | undefined>;
	deleteNotebookCell(viewType: string, resource: URI, index: number): Promise<boolean>;
	destoryNotebookDocument(viewType: string, notebook: INotebookTextModel): void;
	updateActiveNotebookDocument(viewType: string, resource: URI): void;
	save(viewType: string, resource: URI): Promise<boolean>;
	onDidReceiveMessage(viewType: string, uri: URI, message: any): void;
}

export class NotebookProviderInfoStore {
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
		return [...Iterable.filter(this.contributedEditors.values(), customEditor => customEditor.matches(resource))];
	}
}

export class NotebookOutputRendererInfoStore {
	private readonly contributedRenderers = new Map<string, NotebookOutputRendererInfo>();

	clear() {
		this.contributedRenderers.clear();
	}

	get(viewType: string): NotebookOutputRendererInfo | undefined {
		return this.contributedRenderers.get(viewType);
	}

	add(info: NotebookOutputRendererInfo): void {
		if (this.contributedRenderers.has(info.id)) {
			console.log(`Custom notebook output renderer with id '${info.id}' already registered`);
			return;
		}
		this.contributedRenderers.set(info.id, info);
	}

	getContributedRenderer(mimeType: string): readonly NotebookOutputRendererInfo[] {
		return Array.from(this.contributedRenderers.values()).filter(customEditor =>
			customEditor.matches(mimeType));
	}
}

class ModelData implements IDisposable {
	private readonly _modelEventListeners = new DisposableStore();

	constructor(
		public model: NotebookTextModel,
		onWillDispose: (model: INotebookTextModel) => void
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
	private readonly _notebookRenderers = new Map<number, { extensionData: NotebookExtensionDescription, type: string, selectors: INotebookMimeTypeSelector, preloads: URI[] }>();
	notebookProviderInfoStore: NotebookProviderInfoStore = new NotebookProviderInfoStore();
	notebookRenderersInfoStore: NotebookOutputRendererInfoStore = new NotebookOutputRendererInfoStore();
	private readonly _models: { [modelId: string]: ModelData; };
	private _onDidChangeActiveEditor = new Emitter<{ viewType: string, uri: URI }>();
	onDidChangeActiveEditor: Event<{ viewType: string, uri: URI }> = this._onDidChangeActiveEditor.event;
	private _resolvePool = new Map<string, () => void>();

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		this._models = {};
		notebookProviderExtensionPoint.setHandler((extensions) => {
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

		notebookRendererExtensionPoint.setHandler((renderers) => {
			this.notebookRenderersInfoStore.clear();

			for (const extension of renderers) {
				for (const notebookContribution of extension.value) {
					this.notebookRenderersInfoStore.add(new NotebookOutputRendererInfo({
						id: notebookContribution.viewType,
						displayName: notebookContribution.displayName,
						mimeTypes: notebookContribution.mimeTypes || []
					}));
				}
			}

			// console.log(this.notebookRenderersInfoStore);
		});
	}

	async canResolve(viewType: string): Promise<void> {
		if (this._notebookProviders.has(viewType)) {
			return;
		}

		this.extensionService.activateByEvent(`onNotebookEditor:${viewType}`);

		let resolve: () => void;
		const promise = new Promise<void>(r => { resolve = r; });
		this._resolvePool.set(viewType, resolve!);
		return promise;
	}

	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController) {
		this._notebookProviders.set(viewType, { extensionData, controller });

		let resolve = this._resolvePool.get(viewType);
		if (resolve) {
			resolve();
			this._resolvePool.delete(viewType);
		}
	}

	unregisterNotebookProvider(viewType: string): void {
		this._notebookProviders.delete(viewType);
	}

	registerNotebookRenderer(handle: number, extensionData: NotebookExtensionDescription, type: string, selectors: INotebookMimeTypeSelector, preloads: URI[]) {
		this._notebookRenderers.set(handle, { extensionData, type, selectors, preloads });
	}

	unregisterNotebookRenderer(handle: number) {
		this._notebookRenderers.delete(handle);
	}

	getRendererInfo(handle: number): INotebookRendererInfo | undefined {
		const renderer = this._notebookRenderers.get(handle);

		if (renderer) {
			return {
				id: renderer.extensionData.id,
				extensionLocation: URI.revive(renderer.extensionData.location),
				preloads: renderer.preloads
			};
		}

		return;
	}

	async resolveNotebook(viewType: string, uri: URI): Promise<NotebookTextModel | undefined> {
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

	async createNotebookCell(viewType: string, resource: URI, index: number, language: string, type: CellKind): Promise<NotebookCellTextModel | undefined> {
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

	async executeNotebookCell(viewType: string, uri: URI, handle: number): Promise<void> {
		const provider = this._notebookProviders.get(viewType);
		if (provider) {
			await provider.controller.executeNotebookCell(uri, handle);
		}
	}

	getContributedNotebookProviders(resource: URI): readonly NotebookProviderInfo[] {
		return this.notebookProviderInfoStore.getContributedNotebook(resource);
	}

	getContributedNotebookOutputRenderers(mimeType: string): readonly NotebookOutputRendererInfo[] {
		return this.notebookRenderersInfoStore.getContributedRenderer(mimeType);
	}

	getNotebookProviderResourceRoots(): URI[] {
		let ret: URI[] = [];
		this._notebookProviders.forEach(val => {
			ret.push(URI.revive(val.extensionData.location));
		});

		return ret;
	}

	destoryNotebookDocument(viewType: string, notebook: INotebookTextModel): void {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			provider.controller.destoryNotebookDocument(notebook);
		}
	}

	updateActiveNotebookDocument(viewType: string, resource: URI): void {
		this._onDidChangeActiveEditor.fire({ viewType, uri: resource });
	}

	async save(viewType: string, resource: URI): Promise<boolean> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.save(resource);
		}

		return false;
	}

	onDidReceiveMessage(viewType: string, uri: URI, message: any): void {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.onDidReceiveMessage(uri, message);
		}
	}

	private _onWillDispose(model: INotebookTextModel): void {
		let modelId = MODEL_ID(model.uri);
		let modelData = this._models[modelId];

		delete this._models[modelId];
		modelData?.dispose();

		// this._onModelRemoved.fire(model);
	}
}
