/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDecorationsService, IDecorationsProvider, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMProvider, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';

class SCMDecorationsProvider implements IDecorationsProvider {

	private readonly _disposable: IDisposable;
	private readonly _onDidChange = new Emitter<URI[]>();
	private _data = new Map<string, ISCMResource>();

	readonly label: string;
	readonly onDidChange: Event<URI[]> = this._onDidChange.event;

	constructor(
		private readonly _provider: ISCMProvider,
		private readonly _config: ISCMConfiguration
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
				newData.set(resource.sourceUri.toString(), resource);

				if (!this._data.has(resource.sourceUri.toString())) {
					uris.push(resource.sourceUri); // added
				}
			}
		}

		this._data.forEach((value, key) => {
			if (!newData.has(key)) {
				uris.push(value.sourceUri); // removed
			}
		});

		this._data = newData;
		this._onDidChange.fire(uris);
	}

	provideDecorations(uri: URI): IDecorationData {
		const resource = this._data.get(uri.toString());
		if (!resource || !resource.decorations.color || !resource.decorations.tooltip) {
			return undefined;
		}
		return {
			weight: 100 - resource.decorations.tooltip.charAt(0).toLowerCase().charCodeAt(0),
			title: localize('tooltip', "{0}, {1}", resource.decorations.tooltip, this._provider.label),
			color: resource.decorations.color,
			letter: resource.decorations.tooltip.charAt(0)
		};
	}
}

interface ISCMConfiguration {
	fileDecorations: {
		enabled: boolean;
	};
}

export class FileDecorations implements IWorkbenchContribution {

	private _providers = new Map<ISCMRepository, IDisposable>();
	private _configListener: IDisposable;
	private _repoListeners: IDisposable[];

	constructor(
		@IDecorationsService private _decorationsService: IDecorationsService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@ISCMService private _scmService: ISCMService,
	) {
		this._configListener = this._configurationService.onDidUpdateConfiguration(e => e.affectsConfiguration('scm.fileDecorations.enabled') && this._update());
		this._update();
	}

	getId(): string {
		throw new Error('smc.SCMFileDecorations');
	}

	dispose(): void {
		this._providers.forEach(value => dispose(value));
		dispose(this._repoListeners);
		dispose(this._configListener, this._configListener);
	}

	private _update(): void {
		const config = this._configurationService.getConfiguration<ISCMConfiguration>('scm');
		if (config.fileDecorations.enabled) {
			this._scmService.repositories.forEach(this._onDidAddRepository, this);
			this._repoListeners = [
				this._scmService.onDidAddRepository(this._onDidAddRepository, this),
				this._scmService.onDidRemoveRepository(this._onDidRemoveRepository, this)
			];
		} else {
			this._repoListeners = dispose(this._repoListeners);
			this._providers.forEach(value => dispose(value));
			this._providers.clear();
		}
	}

	private _onDidAddRepository(repo: ISCMRepository): void {
		const provider = new SCMDecorationsProvider(repo.provider, this._configurationService.getConfiguration<ISCMConfiguration>('scm'));
		const registration = this._decorationsService.registerDecorationsProvider(provider);
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
