/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatContributionService, IChatParticipantContribution, IChatProviderContribution } from 'vs/workbench/contrib/chat/common/chatContributionService';

export class MockChatContributionService implements IChatContributionService {
	_serviceBrand: undefined;

	constructor(
	) { }

	registeredProviders: IChatProviderContribution[] = [];
	registerChatParticipant(participant: IChatParticipantContribution): void {
		throw new Error('Method not implemented.');
	}
	deregisterChatParticipant(participant: IChatParticipantContribution): void {
		throw new Error('Method not implemented.');
	}

	registerChatProvider(provider: IChatProviderContribution): void {
		throw new Error('Method not implemented.');
	}
	deregisterChatProvider(providerId: string): void {
		throw new Error('Method not implemented.');
	}
	getViewIdForProvider(providerId: string): string {
		throw new Error('Method not implemented.');
	}
}
