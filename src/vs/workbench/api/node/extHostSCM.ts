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
		return undefined;
	} else if (typeof decorations.iconPath === 'string') {
		return URI.file(decorations.iconPath).toString();
	} else if (decorations.iconPath) {
		return `${decorations.iconPath}`;
	}
	return undefined;
}

export interface Cache {
	[providerId: string]: {
		[resourceUri: string]: vscode.SCMResource;
	};
}

class ExtHostSCMInputBox {

	private _value: string = '';

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		this._proxy.$setInputBoxValue(value);
		this.updateValue(value);
	}

	private _onDidChange = new Emitter<string>();

	get onDidChange(): Event<string> {
		return this._onDidChange.event;
	}

	constructor(private _proxy: MainThreadSCMShape) {
		// noop
	}

	$onInputBoxValueChange(value: string): void {
		this.updateValue(value);
	}

	private updateValue(value: string): void {
		this._value = value;
		this._onDidChange.fire(value);
	}
}

export class ExtHostSCM {

	private _proxy: MainThreadSCMShape;
	private _providers: { [id: string]: vscode.SCMProvider; } = Object.create(null);

	private _onDidChangeActiveProvider = new Emitter<vscode.SCMProvider>();
	get onDidChangeActiveProvider(): Event<vscode.SCMProvider> { return this._onDidChangeActiveProvider.event; }

	private _activeProvider: vscode.SCMProvider;
	get activeProvider(): vscode.SCMProvider | undefined { return this._activeProvider; }

	private _inputBox: ExtHostSCMInputBox;
	get inputBox(): vscode.SCMInputBox { return this._inputBox; }

	private cache: Cache = Object.create(null);

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
		this._inputBox = new ExtHostSCMInputBox(this._proxy);
	}

	registerSCMProvider(provider: vscode.SCMProvider): Disposable {
		const providerId = provider.id;

		if (this._providers[providerId]) {
			throw new Error(`Provider ${providerId} already registered`);
		}

		// TODO@joao: should pluck all the things out of the provider
		this._providers[providerId] = provider;

		this._proxy.$register(providerId, {
			label: provider.label,
			supportsOpen: !!provider.open,
			supportsAcceptChanges: !!provider.acceptChanges,
			supportsOriginalResource: !!provider.getOriginalResource
		});

		const onDidChange = debounceEvent(provider.onDidChange, (l, e) => e, 100);
		const onDidChangeListener = onDidChange(resourceGroups => {
			this.cache[providerId] = Object.create(null);

			const rawResourceGroups = resourceGroups.map(g => {
				const rawResources = g.resources.map(r => {
					const uri = r.uri.toString();
					this.cache[providerId][uri] = r;

					const sourceUri = r.sourceUri.toString();
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

					return [uri, sourceUri, icons, strikeThrough] as SCMRawResource;
				});

				return [g.uri.toString(), g.id, g.label, rawResources] as SCMRawResourceGroup;
			});

			this._proxy.$onChange(providerId, rawResourceGroups, provider.count, provider.state);
		});

		return new Disposable(() => {
			onDidChangeListener.dispose();
			delete this._providers[providerId];
			this._proxy.$unregister(providerId);
		});
	}

	$open(providerId: string, uri: string): TPromise<void> {
		const provider = this._providers[providerId];

		if (!provider) {
			return TPromise.as(null);
		}

		const resource = this.cache[providerId][uri];

		if (!resource) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.open(resource, token));
	}

	$acceptChanges(providerId: string): TPromise<void> {
		const provider = this._providers[providerId];

		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.acceptChanges(token));
	}

	$getOriginalResource(id: string, uri: URI): TPromise<URI> {
		const provider = this._providers[id];

		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.getOriginalResource(uri, token));
	}

	$onInputBoxValueChange(value: string): TPromise<void> {
		this._inputBox.$onInputBoxValueChange(value);
		return TPromise.as(null);
	}
}
