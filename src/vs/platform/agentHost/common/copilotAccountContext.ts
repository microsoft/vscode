/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import type { RootState } from './state/sessionState.js';

export const copilotAccountContextKey = 'copilot.accountContext';

export interface ICopilotServiceChoice {
	readonly service: 'github' | 'm365';
	readonly resource: string;
	readonly selectionId: string;
	readonly host: string;
	/** Provider-authenticated login/coordinate, independent of the label and Entra account ID. */
	readonly accountName: string;
	readonly displayName: string;
}

export type CopilotAccountContext =
	| { readonly kind: 'signedOut' }
	| { readonly kind: 'discovering'; readonly entraAccountId: string }
	| { readonly kind: 'choiceRequired'; readonly entraAccountId: string; readonly discoveryId: string; readonly choices: readonly ICopilotServiceChoice[] }
	| { readonly kind: 'activating'; readonly entraAccountId: string; readonly discoveryId: string; readonly choice: ICopilotServiceChoice }
	| { readonly kind: 'ready'; readonly entraAccountId: string; readonly discoveryId: string; readonly choice: ICopilotServiceChoice; readonly derivedFrom: string }
	| { readonly kind: 'incomplete'; readonly entraAccountId: string }
	| { readonly kind: 'error'; readonly entraAccountId: string; readonly stage: 'discovery' | 'activation' };

/** Reads host-owned transient state, never the requested rollout setting or a cached preference. */
export function readCopilotAccountContext(root: RootState | undefined): CopilotAccountContext | undefined {
	const raw = root?.config?.values[copilotAccountContextKey];
	if (!isObject(raw)) {
		return undefined;
	}
	const value = raw as Record<string, unknown>;
	if (value.kind === 'signedOut') {
		return { kind: 'signedOut' };
	}
	if (typeof value.entraAccountId !== 'string' || !value.entraAccountId) {
		return undefined;
	}
	const entraAccountId = value.entraAccountId;
	switch (value.kind) {
		case 'discovering':
		case 'incomplete':
			return { kind: value.kind, entraAccountId };
		case 'error':
			return value.stage === 'discovery' || value.stage === 'activation' ? { kind: 'error', entraAccountId, stage: value.stage } : undefined;
		case 'choiceRequired':
			return readChoices(value, entraAccountId);
		case 'activating':
		case 'ready':
			return readSelectedContext(value, entraAccountId, value.kind);
		default:
			return undefined;
	}
}

function readChoices(value: Record<string, unknown>, entraAccountId: string): CopilotAccountContext | undefined {
	if (typeof value.discoveryId !== 'string' || !value.discoveryId || !Array.isArray(value.choices)) {
		return undefined;
	}
	const choices = value.choices.map(readChoice);
	return choices.length === 2 && choices.every(choice => choice !== undefined) && new Set(choices.map(choice => choice.service)).size === 2
		&& new Set(choices.map(choice => choice.selectionId)).size === 2
		? { kind: 'choiceRequired', entraAccountId, discoveryId: value.discoveryId, choices }
		: undefined;
}

function readSelectedContext(value: Record<string, unknown>, entraAccountId: string, kind: 'activating' | 'ready'): CopilotAccountContext | undefined {
	const choice = readChoice(value.choice);
	if (!choice || typeof value.discoveryId !== 'string' || !value.discoveryId) {
		return undefined;
	}
	if (kind === 'activating') {
		return { kind, entraAccountId, discoveryId: value.discoveryId, choice };
	}
	return typeof value.derivedFrom === 'string' && value.derivedFrom
		? { kind, entraAccountId, discoveryId: value.discoveryId, choice, derivedFrom: value.derivedFrom }
		: undefined;
}

function readChoice(raw: unknown): ICopilotServiceChoice | undefined {
	if (!isObject(raw)) {
		return undefined;
	}
	const value = raw as Record<string, unknown>;
	if ((value.service !== 'github' && value.service !== 'm365')
		|| !isHttpsResource(value.resource)
		|| typeof value.selectionId !== 'string' || !value.selectionId
		|| typeof value.host !== 'string' || !value.host
		|| typeof value.accountName !== 'string' || !value.accountName
		|| typeof value.displayName !== 'string' || !value.displayName) {
		return undefined;
	}
	return { service: value.service, resource: value.resource, selectionId: value.selectionId, host: value.host, accountName: value.accountName, displayName: value.displayName };
}

function isHttpsResource(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith('https://') && value.length > 'https://'.length && !value.includes('#');
}
