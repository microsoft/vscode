/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	COMPUTER_USE_SETUP_META_KEY,
	computerUseActions,
	computerUsePermissionActions,
	computerUsePermissions,
	computerUsePermissionStates,
	computerUseSetupStates,
	type IComputerUseErrorV1,
	type IComputerUseHelperAppV1,
	type IComputerUseOperationV1,
	type IComputerUsePermissionStatusV1,
	type IComputerUseSetupActionV1,
	type IComputerUseSetupV1,
	type IComputerUseStatusV1,
} from '../../computerUse.js';
import type { ChatInputRequest } from '../../state/protocol/channels-chat/state.js';

/*
 * Validating readers for the VS Code Computer Use extension values: every field is checked, unknown keys are ignored,
 * malformed optional parts and entries without identity are dropped, and lists are bounded.
 */

const MAX_ID_LENGTH = 256;
const MAX_URI_LENGTH = 4096;
const MAX_PATH_LENGTH = 4096;
const MAX_ICON_LENGTH = 512 * 1024;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_CODE_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_SETUPS = 32;
const MAX_ACTIONS = 8;

type Bag = Readonly<Record<string, unknown>>;

function asBag(value: unknown): Bag | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Bag : undefined;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
	return values.find(candidate => candidate === value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
	return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined;
}

function count(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function readAction(value: unknown): IComputerUseSetupActionV1 | undefined {
	const bag = asBag(value);
	const action = oneOf(computerUseActions, bag?.action);
	if (!bag || !action) {
		return undefined;
	}
	const permission = oneOf(computerUsePermissions, bag.permission);
	if (computerUsePermissionActions.includes(action) !== (permission !== undefined)) {
		return undefined;
	}
	return permission ? { action, permission } : { action };
}

function readError(value: unknown): IComputerUseErrorV1 | undefined {
	const bag = asBag(value);
	const code = boundedString(bag?.code, MAX_CODE_LENGTH);
	const message = boundedString(bag?.message, MAX_MESSAGE_LENGTH);
	return code && message ? { code, message } : undefined;
}

function readOperation(value: unknown): IComputerUseOperationV1 | undefined {
	const bag = asBag(value);
	const setupId = boundedString(bag?.setupId, MAX_ID_LENGTH);
	const action = readAction(bag);
	return setupId && action ? { setupId, ...action } : undefined;
}

function readSetup(value: unknown): IComputerUseSetupV1 | undefined {
	const bag = asBag(value);
	const id = boundedString(bag?.id, MAX_ID_LENGTH);
	const chat = boundedString(bag?.chat, MAX_URI_LENGTH);
	const state = oneOf(computerUseSetupStates, bag?.state);
	const round = count(bag?.round);
	if (!bag || !id || !chat || !state || round === undefined) {
		return undefined;
	}
	const actions = state === 'needsPermissions' && Array.isArray(bag.actions)
		? bag.actions.slice(0, MAX_ACTIONS).map(readAction).filter(action => action !== undefined)
		: [];
	const error = readError(bag.error);
	return { id, chat, state, round, actions, ...(error ? { error } : {}) };
}

/** Only an absolute path to a macOS app bundle, and a PNG data URL for its icon. */
function readHelperApp(value: unknown): IComputerUseHelperAppV1 | undefined {
	const bag = asBag(value);
	const path = boundedString(bag?.path, MAX_PATH_LENGTH);
	if (!path?.startsWith('/') || !path.endsWith('.app')) {
		return undefined;
	}
	const icon = boundedString(bag?.icon, MAX_ICON_LENGTH);
	return icon?.startsWith(PNG_DATA_URL_PREFIX) && /^[A-Za-z0-9+/]+={0,2}$/.test(icon.slice(PNG_DATA_URL_PREFIX.length)) ? { path, icon } : { path };
}

function readPermissions(value: unknown): readonly IComputerUsePermissionStatusV1[] {
	const entries = Array.isArray(value) ? value.map(asBag) : [];
	return computerUsePermissions.map(permission => {
		const entry = entries.find(candidate => candidate?.permission === permission);
		return { permission, state: oneOf(computerUsePermissionStates, entry?.state) ?? 'unknown' };
	});
}

/** Reads a published {@link IComputerUseStatusV1}; `undefined` when absent or not schema version 1. */
export function readComputerUseStatus(value: unknown): IComputerUseStatusV1 | undefined {
	const bag = asBag(value);
	if (!bag || bag.schemaVersion !== 1) {
		return undefined;
	}
	const setups: IComputerUseSetupV1[] = [];
	for (const entry of Array.isArray(bag.setups) ? bag.setups.slice(-MAX_SETUPS) : []) {
		const setup = readSetup(entry);
		if (setup && !setups.some(existing => existing.id === setup.id)) {
			setups.push(setup);
		}
	}
	const verifiedAt = typeof bag.verifiedAt === 'number' && Number.isFinite(bag.verifiedAt) && bag.verifiedAt >= 0 ? bag.verifiedAt : undefined;
	const operation = readOperation(bag.operation);
	const helperApp = readHelperApp(bag.helperApp);
	return {
		schemaVersion: 1,
		permissions: readPermissions(bag.permissions),
		...(verifiedAt !== undefined ? { verifiedAt } : {}),
		...(operation ? { operation } : {}),
		setups,
		...(helperApp ? { helperApp } : {}),
	};
}

/** The setup a chat input request stands for. */
export interface IComputerUseSetupCard {
	readonly setupId: string;
}

/**
 * {@link ChatInputRequest} has no declared `_meta` field. The request is carried verbatim through the protocol as
 * JSON, so an extra bag survives the round-trip.
 */
type ChatInputRequestWithMeta = ChatInputRequest & { _meta?: Record<string, unknown> };

/** Reads the setup a chat input request stands for, if it carries a valid {@link COMPUTER_USE_SETUP_META_KEY}. */
export function readComputerUseSetupCard(request: ChatInputRequest): IComputerUseSetupCard | undefined {
	const meta = asBag((request as ChatInputRequestWithMeta)._meta);
	const setupId = boundedString(asBag(meta?.[COMPUTER_USE_SETUP_META_KEY])?.setupId, MAX_ID_LENGTH);
	return setupId ? { setupId } : undefined;
}

/** Returns a copy of `request` that stands for setup `setupId`, preserving other metadata. */
export function withComputerUseSetupCard<T extends ChatInputRequest>(request: T, setupId: string): T {
	const meta = (request as ChatInputRequestWithMeta)._meta;
	return {
		...request,
		_meta: { ...meta, [COMPUTER_USE_SETUP_META_KEY]: { setupId } satisfies IComputerUseSetupCard },
	};
}
