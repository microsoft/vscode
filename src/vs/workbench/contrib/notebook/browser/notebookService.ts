/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotebook, ICell } from 'vs/editor/common/modes';
import { URI } from 'vs/base/common/uri';
import { notebookExtensionPoint } from 'vs/workbench/contrib/notebook/browser/extensionPoint';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { NotebookExtensionDescription } from 'vs/workbench/api/common/extHost.protocol';
import { Emitter, Event } from 'vs/base/common/event';

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
	destoryNotebookDocument(notebook: INotebook): void;
}

export interface INotebookService {
	_serviceBrand: undefined;
	onDidChangeActiveEditor: Event<{ viewType: string, uri: URI }>;
	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController): void;
	unregisterNotebookProvider(viewType: string): void;
	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	executeNotebookActiveCell(viewType: string, uri: URI): Promise<void>;
	getContributedNotebook(resource: URI): readonly NotebookProviderInfo[];
	getNotebookProviderResourceRoots(): URI[];
	updateNotebookActiveCell(viewType: string, resource: URI, cellHandle: number): void;
	createNotebookCell(viewType: string, resource: URI, index: number, language: string, type: 'markdown' | 'code'): Promise<ICell | undefined>;
	deleteNotebookCell(viewType: string, resource: URI, index: number): Promise<boolean>;
	destoryNotebookDocument(viewType: string, notebook: INotebook): void;
	updateActiveNotebookDocument(viewType: string, resource: URI): void;
}

export class NotebookInfoStore {
	private readonly contributedEditors = new Map<string, NotebookProviderInfo>();

	public clear() {
		this.contributedEditors.clear();
	}

	public get(viewType: string): NotebookProviderInfo | undefined {
		return this.contributedEditors.get(viewType);
	}

	public add(info: NotebookProviderInfo): void {
		if (this.contributedEditors.has(info.id)) {
			console.log(`Custom editor with id '${info.id}' already registered`);
			return;
		}
		this.contributedEditors.set(info.id, info);
	}

	public getContributedNotebook(resource: URI): readonly NotebookProviderInfo[] {
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

	public dispose(): void {
		this._modelEventListeners.dispose();
	}
}


export class NotebookService extends Disposable implements INotebookService {
	_serviceBrand: undefined;
	private readonly _notebookProviders = new Map<string, { controller: IMainNotebookController, extensionData: NotebookExtensionDescription }>();
	public notebookProviderInfoStore: NotebookInfoStore = new NotebookInfoStore();
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

	async resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			let notebookModel = await provider.controller.resolveNotebook(viewType, uri);

			if (notebookModel) {
				// new notebook model created
				const modelId = MODEL_ID(uri);

				const modelData = new ModelData(
					notebookModel,
					(model) => this._onWillDispose(model),
				);
				this._models[modelId] = modelData;
				return modelData.model;
			}
		}

		return;
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

	deleteNotebookCell(viewType: string, resource: URI, index: number): Promise<boolean> {
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

	public getContributedNotebook(resource: URI): readonly NotebookProviderInfo[] {
		return this.notebookProviderInfoStore.getContributedNotebook(resource);
	}

	public getNotebookProviderResourceRoots(): URI[] {
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
		modelData.dispose();

		// this._onModelRemoved.fire(model);
	}
}
