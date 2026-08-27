/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISessionSummaryHoverData, SessionSummaryHoverWidget } from './sessionSummaryHover.js';

export const ISessionSummaryHoverService = createDecorator<ISessionSummaryHoverService>('sessionSummaryHoverService');

/**
 * Resolves the hover data for a session link resource
 * (`agent-host-session://<provider>/<id>`) from whatever the window knows about
 * sessions. Each window contributes one: the Agents window resolves an
 * `ISession`, the editor window an `IChatSessionItem`.
 */
export interface ISessionSummaryHoverProvider {
	/**
	 * Hover data for {@link resource}, or `undefined` when this window cannot
	 * resolve it — the caller then falls back to a plain tooltip.
	 */
	provideSessionSummaryHoverData(resource: URI, token: CancellationToken): Promise<ISessionSummaryHoverData | undefined>;
}

/**
 * Lets any surface that renders a session link — today the
 * `agent-host-session://` pills in chat output — show the same rich hover the
 * Agents window sessions list uses, without knowing which window it runs in or
 * where session data comes from.
 */
export interface ISessionSummaryHoverService {
	readonly _serviceBrand: undefined;

	/** Registers this window's data source. Later registrations take precedence. */
	registerProvider(provider: ISessionSummaryHoverProvider): IDisposable;

	/**
	 * Builds the hover element for {@link resource}, or `undefined` when no
	 * provider can resolve it.
	 */
	createHoverElement(resource: URI, token: CancellationToken): Promise<HTMLElement | undefined>;
}

export class SessionSummaryHoverService implements ISessionSummaryHoverService {

	declare readonly _serviceBrand: undefined;

	private readonly _providers: ISessionSummaryHoverProvider[] = [];

	registerProvider(provider: ISessionSummaryHoverProvider): IDisposable {
		this._providers.unshift(provider);
		return toDisposable(() => {
			const index = this._providers.indexOf(provider);
			if (index !== -1) {
				this._providers.splice(index, 1);
			}
		});
	}

	async createHoverElement(resource: URI, token: CancellationToken): Promise<HTMLElement | undefined> {
		for (const provider of this._providers) {
			const data = await provider.provideSessionSummaryHoverData(resource, token);
			if (token.isCancellationRequested) {
				return undefined;
			}
			if (data) {
				return new SessionSummaryHoverWidget(data).domNode;
			}
		}
		return undefined;
	}
}
