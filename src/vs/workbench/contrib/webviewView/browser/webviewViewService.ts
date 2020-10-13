/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';

export const IWebviewViewService = createDecorator<IWebviewViewService>('webviewViewService');

export interface WebviewView {
	title?: string;
	description?: string;

	readonly webview: WebviewOverlay;

	readonly onDidChangeVisibility: Event<boolean>;
	readonly onDispose: Event<void>;

	show(preserveFocus: boolean): void;
}

export interface IWebviewViewResolver {
	resolve(webviewView: WebviewView, cancellation: CancellationToken): Promise<void>;
}

export interface IWebviewViewService {

	readonly _serviceBrand: undefined;

	register(type: string, resolver: IWebviewViewResolver): IDisposable;

	resolve(viewType: string, webview: WebviewView, cancellation: CancellationToken): Promise<void>;
}

export class WebviewViewService extends Disposable implements IWebviewViewService {

	readonly _serviceBrand: undefined;

	private readonly _views = new Map<string, IWebviewViewResolver>();

	private readonly _awaitingRevival = new Map<string, { webview: WebviewView, resolve: () => void }>();

	register(viewType: string, resolver: IWebviewViewResolver): IDisposable {
		if (this._views.has(viewType)) {
			throw new Error(`View resolver already registered for ${viewType}`);
		}

		this._views.set(viewType, resolver);

		const pending = this._awaitingRevival.get(viewType);
		if (pending) {
			resolver.resolve(pending.webview, CancellationToken.None).then(() => {
				this._awaitingRevival.delete(viewType);
				pending.resolve();
			});
		}

		return toDisposable(() => {
			this._views.delete(viewType);
		});
	}

	resolve(viewType: string, webview: WebviewView, cancellation: CancellationToken): Promise<void> {
		const resolver = this._views.get(viewType);
		if (!resolver) {
			if (this._awaitingRevival.has(viewType)) {
				throw new Error('View already awaiting revival');
			}

			let resolve: () => void;
			const p = new Promise<void>(r => resolve = r);
			this._awaitingRevival.set(viewType, { webview, resolve: resolve! });
			return p;
		}

		return resolver.resolve(webview, cancellation);
	}
}

