/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, debounceEvent } from 'vs/base/common/event';
import { asWinJsPromise } from 'vs/base/common/async';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { MainContext, MainThreadSCMShape, SCMRawResource, SCMRawResourceGroup } from './extHost.protocol';
import * as vscode from 'vscode';

function getIconPath(decorations: vscode.SCMResourceThemableDecorations) {
	if (!decorations) {
		return void 0;
	} else if (typeof decorations.iconPath === 'string') {
		return URI.file(decorations.iconPath).toString();
	} else if (decorations.iconPath) {
		return `${decorations.iconPath}`;
	}
}

export class ExtHostSCM {

	private _proxy: MainThreadSCMShape;
	private _providers: { [id: string]: vscode.SCMProvider; } = Object.create(null);

	private _onDidChangeActiveProvider = new Emitter<vscode.SCMProvider>();
	get onDidChangeActiveProvider(): Event<vscode.SCMProvider> { return this._onDidChangeActiveProvider.event; }

	private _activeProvider: vscode.SCMProvider;
	get activeProvider(): vscode.SCMProvider | undefined { return this._activeProvider; }

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
	}

	registerSCMProvider(id: string, provider: vscode.SCMProvider): Disposable {
		if (this._providers[id]) {
			throw new Error(`Provider ${id} already registered`);
		}

		// TODO@joao: should pluck all the things out of the provider
		this._providers[id] = provider;

		this._proxy.$register(id, {
			label: provider.label,
			commitCommand: provider.commitCommand,
			clickCommand: provider.clickCommand,
			dragCommand: provider.dragCommand,
			supportsOriginalResource: !!provider.getOriginalResource
		});

		const onDidChange = debounceEvent(provider.onDidChange, (l, e) => e, 200);
		const onDidChangeListener = onDidChange(resourceGroups => {
			const rawResourceGroups = resourceGroups.map(g => {
				const rawResources = g.resources.map(r => {
					const uri = r.uri.toString();
					const iconPath = getIconPath(r.decorations);
					const lightIconPath = r.decorations && getIconPath(r.decorations.light) || iconPath;
					const darkIconPath = r.decorations && getIconPath(r.decorations.dark) || iconPath;
					const icons: string[] = [];

					if (lightIconPath || darkIconPath) {
						icons.push(lightIconPath);
					}

					if (darkIconPath !== lightIconPath) {
						icons.push(darkIconPath);
					}

					const strikeThrough = r.decorations && !!r.decorations.strikeThrough;

					return [uri, icons, strikeThrough] as SCMRawResource;
				});
				return [g.id, g.label, rawResources] as SCMRawResourceGroup;
			});

			this._proxy.$onChange(id, rawResourceGroups);
		});

		return new Disposable(() => {
			onDidChangeListener.dispose();
			delete this._providers[id];
			this._proxy.$unregister(id);
		});
	}

	$getOriginalResource(id: string, uri: URI): TPromise<URI> {
		const provider = this._providers[id];

		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.getOriginalResource(uri, token));
	}
}
