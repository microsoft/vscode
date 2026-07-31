/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promiseWithResolvers } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewBadge } from '../../../common/views.js';
import { IOverlayWebview } from '../../webview/browser/webview.js';

/**
 * A webview shown in a view pane.
 */
export interface WebviewView {
	/**
	 * The text displayed in the view's title.
	 */
	title?: string;

	/**
	 * Additional text shown for this view.
	 */
	description?: string;

	/**
	 * The badge shown for this view.
	 */
	badge?: IViewBadge;

	/**
	 * The webview associated with this webview view.
	 */
	readonly webview: IOverlayWebview;

	/**
	 * Fired when the visibility of the webview view changes.
	 *
	 * This can happen when the view itself is hidden, when the view is collapsed, or when the user switches away from
	 * the view.
	 */
	readonly onDidChangeVisibility: Event<boolean>;

	/**
	 * Fired when the webview view has been disposed of.
	 */
	readonly onDispose: Event<void>;

	/**
	 * Dispose of the webview view and clean up any associated resources.
	 */
	dispose(): void;

	/**
	 * Force the webview view to show.
	 */
	show(preserveFocus: boolean): void;
}

/**
 * Fill in the contents of a newly created webview view.
 */
interface IWebviewViewResolver {
	/**
	 * Fill in the contents of a webview view.
	 */
	resolve(webviewView: WebviewView, cancellation: CancellationToken): Promise<void>;
}

export const IWebviewViewService = createDecorator<IWebviewViewService>('webviewViewService');

export interface IWebviewViewService {

	readonly _serviceBrand: undefined;

	/**
	 * Fired when a resolver has been registered
	 */
	readonly onNewResolverRegistered: Event<{ readonly viewType: string }>;

	/**
	 * Register a new {@link IWebviewViewResolver webview view resolver}.
	 */
	register(viewType: string, resolver: IWebviewViewResolver): IDisposable;

	/**
	 * Try to resolve a webview view. The promise will not resolve until a resolver for the webview has been registered
	 * and run
	 */
	resolve(viewType: string, webview: WebviewView, cancellation: CancellationToken): Promise<void>;
}

export class WebviewViewService extends Disposable implements IWebviewViewService {

	readonly _serviceBrand: undefined;

	private readonly _resolvers = new Map<string, IWebviewViewResolver>();

	private readonly _awaitingRevival = new Map<string, { readonly webview: WebviewView; readonly resolve: () => void; readonly subscription: IDisposable }>();

	private readonly _onNewResolverRegistered = this._register(new Emitter<{ readonly viewType: string }>());
	public readonly onNewResolverRegistered = this._onNewResolverRegistered.event;

	register(viewType: string, resolver: IWebviewViewResolver): IDisposable {
		if (this._resolvers.has(viewType)) {
			throw new Error(`View resolver already registered for ${viewType}`);
		}

		this._resolvers.set(viewType, resolver);
		this._onNewResolverRegistered.fire({ viewType: viewType });

		const pending = this._awaitingRevival.get(viewType);
		if (pending) {
			resolver.resolve(pending.webview, CancellationToken.None).then(() => {
				this._awaitingRevival.delete(viewType);
				pending.subscription.dispose();
				pending.resolve();
			});
		}

		return toDisposable(() => {
			this._resolvers.delete(viewType);
		});
	}

	resolve(viewType: string, webview: WebviewView, cancellation: CancellationToken): Promise<void> {
		const resolver = this._resolvers.get(viewType);
		if (!resolver) {
			if (this._awaitingRevival.has(viewType)) {
				throw new Error('View already awaiting revival');
			}

			// Already cancelled: don't record a pending entry at all, otherwise it would
			// never be cleaned up (the cancellation listener fires synchronously before
			// the entry is registered).
			if (cancellation.isCancellationRequested) {
				return Promise.resolve();
			}

			const { promise, resolve } = promiseWithResolvers<void>();

			// If the caller is cancelled (e.g. the view pane is torn down or re-activated)
			// at any point before the pending entry is revived by a resolver, drop the
			// pending entry so a later resolve for the same view type does not throw
			// "View already awaiting revival". The subscription is disposed on both settle
			// paths (cancellation here, or revival in `register`) so the listener does not
			// retain the closure or accumulate on the token.
			const subscription = cancellation.onCancellationRequested(() => {
				if (this._awaitingRevival.get(viewType)?.resolve === resolve) {
					this._awaitingRevival.delete(viewType);
					subscription.dispose();
					resolve();
				}
			});

			this._awaitingRevival.set(viewType, { webview, resolve, subscription });

			return promise;
		}

		return resolver.resolve(webview, cancellation);
	}
}
