/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import type { ICustomizationPluginInstallResult, ICustomizationPluginMarketplaceProvider, ICustomizationPluginMarketplaceSnapshot } from '../../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';

export class AgentHostPluginMarketplaceProvider extends Disposable implements ICustomizationPluginMarketplaceProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private _snapshot: { session: URI; expiresAt: number; promise: Promise<ICustomizationPluginMarketplaceSnapshot | undefined> } | undefined;
	private _snapshotGeneration = 0;

	constructor(
		@IAgentHostCustomizationService private readonly _customizationService: IAgentHostCustomizationService,
	) {
		super();
	}

	getSnapshot(sessionResource: URI, token: CancellationToken): Promise<ICustomizationPluginMarketplaceSnapshot | undefined> {
		if (token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		const cached = this._snapshot;
		const promise = cached && isEqual(cached.session, sessionResource) && cached.expiresAt > Date.now()
			? cached.promise
			: this._requestSnapshot(sessionResource, () => this._customizationService.getPluginMarketplaceSnapshot(sessionResource, CancellationToken.None));
		return raceCancellationError(promise, token);
	}

	private _requestSnapshot(session: URI, operation: () => Promise<ICustomizationPluginMarketplaceSnapshot | undefined>): Promise<ICustomizationPluginMarketplaceSnapshot | undefined> {
		const generation = ++this._snapshotGeneration;
		const promise = this._resolveSnapshot(generation, operation);
		this._snapshot = { session, promise, expiresAt: Number.POSITIVE_INFINITY };
		return promise;
	}

	private async _resolveSnapshot(generation: number, operation: () => Promise<ICustomizationPluginMarketplaceSnapshot | undefined>): Promise<ICustomizationPluginMarketplaceSnapshot | undefined> {
		try {
			const result = await Promise.resolve().then(operation);
			if (this._snapshot && generation === this._snapshotGeneration) {
				if (result) {
					this._snapshot.expiresAt = Date.now() + 60_000;
				} else {
					this._snapshot = undefined;
				}
			}
			return result;
		} catch (error) {
			if (generation === this._snapshotGeneration) {
				this._snapshot = undefined;
			}
			throw error;
		}
	}

	async refresh(sessionResource: URI, token: CancellationToken): Promise<ICustomizationPluginMarketplaceSnapshot | undefined> {
		const result = await this._requestSnapshot(sessionResource, () => this._customizationService.refreshPluginMarketplaces(sessionResource, token));
		if (result) {
			this._onDidChange.fire();
		}
		return result;
	}

	async install(sessionResource: URI, source: string): Promise<ICustomizationPluginInstallResult> {
		const result = await this._customizationService.installPlugin(sessionResource, source);
		if (this._snapshot && isEqual(this._snapshot.session, sessionResource)) {
			this._snapshot = undefined;
			this._snapshotGeneration++;
		}
		this._onDidChange.fire();
		return result;
	}

	override dispose(): void {
		this._snapshot = undefined;
		this._snapshotGeneration++;
		super.dispose();
	}
}
