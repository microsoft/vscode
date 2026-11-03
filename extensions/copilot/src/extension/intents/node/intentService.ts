/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { createServiceIdentifier } from '../../../util/common/services';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { IntentRegistry } from '../../prompt/node/intentRegistry';
import { IIntent } from '../../prompt/node/intents';


export const IIntentService = createServiceIdentifier<IIntentService>('IIntentService');

export interface IIntentService {
	readonly _serviceBrand: undefined;

	readonly unknownIntent: IIntent;
	getIntents(location: ChatLocation): IIntent[];
	getIntent(id: string, location: ChatLocation): IIntent | undefined;
}

export class IntentService implements IIntentService {
	_serviceBrand: undefined;

	private _intents: IIntent[] | null = null;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) { }

	private _getOrCreateIntents(): IIntent[] {
		if (!this._intents) {
			this._intents = IntentRegistry.getIntents().map(d => this._instantiationService.createInstance(d));
		}
		return this._intents;
	}

	public get unknownIntent(): IIntent {
		const intents = this._getOrCreateIntents();
		const result = intents.find(i => i.id === Intent.Unknown);
		if (!result) {
			throw new Error(`Unknown intent not found`);
		}
		return result;
	}

	public getIntents(location: ChatLocation): IIntent[] {
		const intents = this._getOrCreateIntents();
		return intents.filter(i => i.locations.includes(location));
	}

	public getIntent(id: string, location: ChatLocation): IIntent | undefined {
		return this.getIntents(location).find(i => i.id === id);
	}
}
