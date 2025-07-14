/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AiSessionInfo, AiTask, IAiCodingAgentInformationProvider, IAiCodingAgentInformationService } from './aiCodingAgentInformation.js';

export class AiCodingAgentInformationService extends Disposable implements IAiCodingAgentInformationService {
	private _providers: IAiCodingAgentInformationProvider[] = [];

	private _onProviderRegistered: Emitter<void> = this._register(new Emitter<void>());
	readonly onProviderRegistered: Event<void> = this._onProviderRegistered.event;

	isEnabled(): boolean {
		return this._providers.length > 0;
	}

	registerCodingAgentProvider(provider: IAiCodingAgentInformationProvider): IDisposable {
		this._providers.push(provider);
		this._onProviderRegistered.fire();
		return {
			dispose: () => {
				const index = this._providers.indexOf(provider);
				if (index !== -1) {
					this._providers.splice(index, 1);
				}
			}
		};
	}

	getAllSessionFromProviders(token: CancellationToken): Promise<AiTask[]> {
		if (!this.isEnabled()) {
			throw new Error('No coding agent information providers registered');
		}

		return Promise.all(this._providers.map(provider => provider.getAllSessions(token)))
			.then(results => results.flat());
	}

	getSessionDetailsFromProviders(id: string, token: CancellationToken): Promise<AiSessionInfo[]> {
		if (!this.isEnabled()) {
			throw new Error('No coding agent information providers registered');
		}

		return Promise.all(this._providers.map(provider => provider.getSessionDetails(id, token)))
			.then(results => results.filter(result => result !== undefined) as AiSessionInfo[]);
	}
}

registerSingleton(IAiCodingAgentInformationService, AiCodingAgentInformationService, InstantiationType.Delayed);
