/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotebook } from 'vs/editor/common/modes';
import { URI } from 'vs/base/common/uri';
import { notebookExtensionPoint } from 'vs/workbench/contrib/notebook/browser/extensionPoint';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { NotebookExtensionDescription } from 'vs/workbench/api/common/extHost.protocol';

export const INotebookService = createDecorator<INotebookService>('notebookService');

export interface IMainNotebookController {
	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	updateNotebook(uri: URI, notebook: INotebook): void;
}

export interface INotebookService {
	_serviceBrand: undefined;
	registerNotebookController(viewType: string, extensionData: NotebookExtensionDescription, controller: IMainNotebookController): void;
	unregisterNotebookProvider(viewType: string): void;
	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined>;
	executeNotebook(viewType: string, uri: URI): Promise<void>;
	getContributedNotebook(resource: URI): readonly NotebookProviderInfo[];
	getNotebookProviderResourceRoots(): URI[];
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


export class NotebookService extends Disposable implements INotebookService {
	_serviceBrand: undefined;
	private readonly _notebookProviders = new Map<string, { controller: IMainNotebookController, extensionData: NotebookExtensionDescription }>();
	public notebookProviderInfoStore: NotebookInfoStore = new NotebookInfoStore();

	constructor() {
		super();

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

	resolveNotebook(viewType: string, uri: URI): Promise<INotebook | undefined> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.resolveNotebook(viewType, uri);
		}

		return Promise.resolve(undefined);
	}

	async executeNotebook(viewType: string, uri: URI): Promise<void> {
		let provider = this._notebookProviders.get(viewType);

		if (provider) {
			return provider.controller.executeNotebook(viewType, uri);
		}

		return;
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
}
