/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTokenProvider } from '@github/copilot-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { getRemainingTimeInSeconds } from '../../../../base/common/date.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

const COPILOT_GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS = 60 * 60;

/**
 * Supplies expiry-aware session credentials and coalesces concurrent SDK refresh requests.
 */
export class CopilotGitHubTokenProvider extends Disposable {
	private _token: string | undefined;
	private _expiresAt: number | undefined;
	private _pendingRefresh: DeferredPromise<void> | undefined;
	private _isShutdown = false;

	constructor(private readonly _now = Date.now) {
		super();
	}

	private readonly _onDidRequestRefresh = this._register(new Emitter<void>());
	readonly onDidRequestRefresh: Event<void> = this._onDidRequestRefresh.event;

	get token(): string | undefined {
		return this._token;
	}

	readonly provideToken: GitHubTokenProvider = async ({ reason }) => {
		let expiresIn = getRemainingTimeInSeconds(this._expiresAt, this._now());
		if (!this._isShutdown && (reason === 'refresh' || expiresIn === undefined || expiresIn <= COPILOT_GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS)) {
			await this._requestRefresh();
			expiresIn = getRemainingTimeInSeconds(this._expiresAt, this._now());
		}
		if (this._isShutdown || !this._token || expiresIn === undefined || expiresIn <= COPILOT_GITHUB_TOKEN_REFRESH_THRESHOLD_SECONDS) {
			return { kind: 'cancelled' };
		}
		return { kind: 'token', accessToken: this._token, expiresIn };
	};

	isCurrentToken(token: string): boolean {
		return this._token === token;
	}

	updateToken(token: string, expiresIn: number): void {
		this._token = token;
		this._expiresAt = this._now() + expiresIn * 1000;
		this._completePendingRefresh();
	}

	clear(): void {
		this._token = undefined;
		this._expiresAt = undefined;
		this._completePendingRefresh();
	}

	shutdown(): void {
		this._isShutdown = true;
		this.clear();
	}

	private _requestRefresh(): Promise<void> {
		let pending = this._pendingRefresh;
		if (!pending) {
			pending = new DeferredPromise<void>();
			this._pendingRefresh = pending;
			this._onDidRequestRefresh.fire();
		}
		return pending.p;
	}

	private _completePendingRefresh(): void {
		const pending = this._pendingRefresh;
		this._pendingRefresh = undefined;
		pending?.complete();
	}

	override dispose(): void {
		this.shutdown();
		super.dispose();
	}
}
