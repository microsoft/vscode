/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { createServiceIdentifier } from '../../../util/common/services';
import { IIntentService } from '../../intents/node/intentService';
import { CommandDetails } from '../../prompt/node/intentRegistry';

export const ICommandService = createServiceIdentifier<ICommandService>('ICommandService');

export interface ICommandService {
	readonly _serviceBrand: undefined;
	getCommands(location: ChatLocation): CommandDetails[];
	getCommand(commandId: string, location: ChatLocation): CommandDetails | undefined;
}

export class CommandServiceImpl implements ICommandService {

	declare _serviceBrand: undefined;


	constructor(
		@IIntentService private readonly intentService: IIntentService
	) { }

	public getCommands(location: ChatLocation): CommandDetails[] {
		return this.intentService.getIntents(location)
			.filter(candidate => !candidate.commandInfo || !candidate.commandInfo.hiddenFromUser)
			.map(intent => ({ commandId: intent.id, intent, details: intent.description, locations: intent.locations, toolEquivalent: intent.commandInfo?.toolEquivalent } satisfies CommandDetails));
	}

	public getCommand(id: string, location: ChatLocation): CommandDetails | undefined {
		return this.getCommands(location).find(c => c.commandId === id);
	}
}
