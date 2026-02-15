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
}

export const IAgentSessionsService = createDecorator<IAgentSessionsService>('agentSessions');
