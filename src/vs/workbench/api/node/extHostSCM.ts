/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, debounceEvent, createEmptyEvent } from 'vs/base/common/event';
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

export class ExtHostSCMInputBox {

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

	private _onDidAccept = new Emitter<string>();

	get onDidAccept(): Event<string> {
		return this._onDidAccept.event;
	}

	constructor(private _proxy: MainThreadSCMShape) {
		// noop
	}

	$onInputBoxValueChange(value: string): void {
		this.updateValue(value);
	}

	$onInputBoxAcceptChanges(): void {
		this._onDidAccept.fire(this._value);
	}

	private updateValue(value: string): void {
		this._value = value;
		this._onDidChange.fire(value);
	}
}

type ProviderHandle = number;

export class ExtHostSCM {

	private static _handlePool: number = 0;

	private _proxy: MainThreadSCMShape;
	private _providers: Map<ProviderHandle, vscode.SCMProvider> = new Map<ProviderHandle, vscode.SCMProvider>();
	private _cache: Map<ProviderHandle, Map<string, vscode.SCMResource>> = new Map<ProviderHandle, Map<string, vscode.SCMResource>>();

	private _onDidChangeActiveProvider = new Emitter<vscode.SCMProvider>();
	get onDidChangeActiveProvider(): Event<vscode.SCMProvider> { return this._onDidChangeActiveProvider.event; }

	private _activeProvider: vscode.SCMProvider;
	get activeProvider(): vscode.SCMProvider | undefined { return this._activeProvider; }

	private _inputBox: ExtHostSCMInputBox;
	get inputBox(): ExtHostSCMInputBox { return this._inputBox; }

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadSCM);
		this._inputBox = new ExtHostSCMInputBox(this._proxy);
	}

	registerSCMProvider(provider: vscode.SCMProvider): Disposable {
		const handle = ExtHostSCM._handlePool++;

		this._providers.set(handle, provider);

		this._proxy.$register(handle, {
			label: provider.label,
			contextKey: provider.contextKey,
			supportsOpen: !!provider.open,
			supportsOriginalResource: !!provider.provideOriginalResource
		});

		const onDidChange = debounceEvent(provider.onDidChange || createEmptyEvent<vscode.SCMProvider>(), (l, e) => e, 100);
		const onDidChangeListener = onDidChange(scmProvider => {
			const cache = new Map<string, vscode.SCMResource>();
			this._cache.set(handle, cache);

			const rawResourceGroups = scmProvider.resources.map(g => {
				const rawResources = g.resources.map(r => {
					const uri = r.uri.toString();
					cache.set(uri, r);

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

				return [g.uri.toString(), g.contextKey, g.label, rawResources] as SCMRawResourceGroup;
			});

			this._proxy.$onChange(handle, rawResourceGroups, provider.count, provider.stateContextKey);
		});

		return new Disposable(() => {
			onDidChangeListener.dispose();
			this._providers.delete(handle);
			this._proxy.$unregister(handle);
		});
	}

	$open(handle: number, uri: string): TPromise<void> {
		const provider = this._providers.get(handle);

		if (!provider) {
			return TPromise.as(null);
		}

		const cache = this._cache.get(handle);

		if (!cache) {
			return TPromise.as(null);
		}

		const resource = cache.get(uri);

		if (!resource) {
			return TPromise.as(null);
		}

		provider.open(resource);
		return TPromise.as(null);
	}

	$getOriginalResource(handle: number, uri: URI): TPromise<URI> {
		const provider = this._providers.get(handle);

		if (!provider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => provider.provideOriginalResource(uri, token));
	}

	$onInputBoxValueChange(value: string): TPromise<void> {
		this._inputBox.$onInputBoxValueChange(value);
		return TPromise.as(null);
	}

	$onInputBoxAcceptChanges(): TPromise<void> {
		this._inputBox.$onInputBoxAcceptChanges();
		return TPromise.as(null);
	}
}
