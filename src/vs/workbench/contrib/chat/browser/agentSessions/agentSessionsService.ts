/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSessionsModel, IAgentSession, IAgentSessionsModel } from './agentSessionsModel.js';

export interface IAgentSessionsService {

	readonly _serviceBrand: undefined;

	readonly model: IAgentSessionsModel;

	getSession(resource: URI): IAgentSession | undefined;

	/**
	 * Migrates session state (archived, read status) from old URIs to new URIs.
	 * Used when an extension needs to change the URI format of its sessions.
	 *
	 * @param providerType The provider type/scheme to filter URIs to migrate
	 * @param migrations Array of old-to-new URI mappings
	 */
	migrateSessionUris(providerType: string, migrations: ReadonlyArray<{ from: URI; to: URI }>): void;

	/**
	 * Gets all stored session URIs for a given provider type.
	 * Used during provider registration to collect URIs that may need migration.
	 */
	getStoredSessionUris(providerType: string): URI[];
}

export class AgentSessionsService extends Disposable implements IAgentSessionsService {

	declare readonly _serviceBrand: undefined;

	private _model: IAgentSessionsModel | undefined;
	get model(): IAgentSessionsModel {
		if (!this._model) {
			this._model = this._register(this.instantiationService.createInstance(AgentSessionsModel));
			this._model.resolve(undefined /* all providers */);
		}

		return this._model;
	}

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}

	getSession(resource: URI): IAgentSession | undefined {
		return this.model.getSession(resource);
	}

	migrateSessionUris(providerType: string, migrations: ReadonlyArray<{ from: URI; to: URI }>): void {
		return this.model.migrateSessionUris(providerType, migrations);
	}

	getStoredSessionUris(providerType: string): URI[] {
		return this.model.getStoredSessionUris(providerType);
	}
}

export const IAgentSessionsService = createDecorator<IAgentSessionsService>('agentSessions');
