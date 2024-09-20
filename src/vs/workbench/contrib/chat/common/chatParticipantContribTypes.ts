/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IRawChatCommandContribution {
	name: string;
	description: string;
	sampleRequest?: string;
	isSticky?: boolean;
	when?: string;
	defaultImplicitVariables?: string[];
	disambiguation?: { category: string; categoryName?: string /** Deprecated */; description: string; examples: string[] }[];
}

export type RawChatParticipantLocation = 'panel' | 'terminal' | 'notebook';

export interface IRawChatParticipantContribution {
	id: string;
	name: string;
	fullName: string;
	when?: string;
	description?: string;
	supportsModelPicker?: boolean;
	isDefault?: boolean;
	isSticky?: boolean;
	sampleRequest?: string;
	commands?: IRawChatCommandContribution[];
	defaultImplicitVariables?: string[];
	locations?: RawChatParticipantLocation[];
	disambiguation?: { category: string; categoryName?: string /** Deprecated */; description: string; examples: string[] }[];
	supportsToolReferences?: boolean;
}

/**
 * Hardcoding the previous id of the Copilot Chat provider to avoid breaking view locations, persisted data, etc.
 * DON'T use this for any new data, only for old persisted data.
 * @deprecated
 */
export const CHAT_PROVIDER_ID = 'copilot';
