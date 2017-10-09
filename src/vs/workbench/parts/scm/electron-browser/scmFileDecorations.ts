/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IResourceDecorationsService, IDecorationsProvider, IResourceDecoration } from 'vs/workbench/services/decorations/browser/decorations';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMProvider, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import Event, { Emitter } from 'vs/base/common/event';

class SCMDecorationsProvider implements IDecorationsProvider {

	private readonly _disposable: IDisposable;
	private readonly _onDidChange = new Emitter<URI[]>();
	private _data = new Map<string, ISCMResource>();

	readonly label: string;
	readonly onDidChange: Event<URI[]> = this._onDidChange.event;

	constructor(
		private readonly _provider: ISCMProvider
	) {
		this.label = this._provider.label;
		this._disposable = this._provider.onDidChangeResources(this._updateGroups, this);
		this._updateGroups();
	}

	dispose(): void {
		this._disposable.dispose();
	}

	private _updateGroups(): void {
		const uris: URI[] = [];
		const newData = new Map<string, ISCMResource>();
		for (const group of this._provider.resources) {
			for (const resource of group.resourceCollection.resources) {
				const { sourceUri } = resource;
				if (this._data.get(sourceUri.toString()) !== resource) {
					newData.set(sourceUri.toString(), resource);
					uris.push(sourceUri);
					this._data.delete(sourceUri.toString());
				}
			}
		}
		this._data.forEach(value => uris.push(value.sourceUri));
		this._data = newData;
		this._onDidChange.fire(uris);
	}

	provideDecorations(uri: URI): IResourceDecoration {
		const resource = this._data.get(uri.toString());
		if (!resource) {
			return undefined;
		}
		return {
			severity: Severity.Info,
			color: resource.decorations.color,
			icon: { light: resource.decorations.icon, dark: resource.decorations.iconDark }
		};
	}
}

export class FileDecorations implements IWorkbenchContribution {

	private readonly _disposables: IDisposable[];
	private readonly _providers = new Map<ISCMRepository, IDisposable>();

	constructor(
		@IResourceDecorationsService private _decorationsService: IResourceDecorationsService,
		@ISCMService private _scmService: ISCMService,
	) {
		this._scmService.repositories.forEach(this._onDidAddRepository, this);
		this._disposables = [
			this._scmService.onDidAddRepository(this._onDidAddRepository, this),
			this._scmService.onDidRemoveRepository(this._onDidRemoveRepository, this),
		];
	}

	getId(): string {
		throw new Error('smc.SCMFileDecorations');
	}

	dispose(): void {
		dispose(this._disposables);
	}

	private _onDidAddRepository(repo: ISCMRepository): void {
		const provider = new SCMDecorationsProvider(repo.provider);
		const registration = this._decorationsService.registerDecortionsProvider(provider);
		this._providers.set(repo, combinedDisposable([registration, provider]));
	}

	private _onDidRemoveRepository(repo: ISCMRepository): void {
		let listener = this._providers.get(repo);
		if (listener) {
			this._providers.delete(repo);
			listener.dispose();
		}
	}
}
