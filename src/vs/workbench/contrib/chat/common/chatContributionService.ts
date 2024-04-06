/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IChatProviderContribution {
	id: string;
	when?: string;
}

export const IChatContributionService = createDecorator<IChatContributionService>('IChatContributionService');
export interface IChatContributionService {
	_serviceBrand: undefined;

	registeredProviders: IChatProviderContribution[];
	registerChatProvider(provider: IChatProviderContribution): void;
	deregisterChatProvider(providerId: string): void;
	getViewIdForProvider(providerId: string): string;
}

export interface IRawChatProviderContribution {
	id: string;
	label: string;
	icon?: string;
	when?: string;
}

export interface IRawChatCommandContribution {
	name: string;
	description: string;
	sampleRequest?: string;
	isSticky?: boolean;
	when?: string;
	defaultImplicitVariables?: string[];
}

export type RawChatParticipantLocation = 'panel' | 'terminal' | 'notebook';

export interface IRawChatParticipantContribution {
	id: string;
	name: string;
	description?: string;
	isDefault?: boolean;
	isSticky?: boolean;
	commands?: IRawChatCommandContribution[];
	defaultImplicitVariables?: string[];
	locations?: RawChatParticipantLocation[];
}

export interface IChatParticipantContribution extends IRawChatParticipantContribution {
	// Participant id is extensionId + name
	extensionId: ExtensionIdentifier;
}
