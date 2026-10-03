/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import type { Implementation } from '../state/protocol/common/commands.js';

export const SESSION_INITIATOR_METADATA_KEY = 'vscode.session.initiator';

/** The creating application, independent of which client later opens or adopts the session. */
export function readSessionInitiator(source: { readonly _meta?: Record<string, unknown> } | undefined): Implementation | undefined {
	const value = source?._meta?.[SESSION_INITIATOR_METADATA_KEY];
	if (!isObject(value)) {
		return undefined;
	}
	const { name, title, version } = value as Record<string, unknown>;
	if (typeof name !== 'string' || !name.trim()
		|| (title !== undefined && typeof title !== 'string') || (version !== undefined && typeof version !== 'string')) {
		return undefined;
	}
	return {
		name,
		...(title !== undefined ? { title } : {}),
		...(version !== undefined ? { version } : {}),
	};
}

export function withSessionInitiator(meta: Record<string, unknown> | undefined, initiator: Implementation): Record<string, unknown> {
	return { ...meta, [SESSION_INITIATOR_METADATA_KEY]: initiator };
}

export function parseSessionInitiator(value: string): Implementation {
	const initiator = readSessionInitiator({ _meta: { [SESSION_INITIATOR_METADATA_KEY]: JSON.parse(value) } });
	if (!initiator) {
		throw new Error('Invalid persisted session initiator.');
	}
	return initiator;
}

export function getLegacySessionInitiator(provider: string, external: boolean): Implementation {
	return { name: !external ? 'vscode' : provider === 'copilotcli' || provider === 'copilot' ? 'github/autopilot' : provider };
}
