/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import type { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isWellKnownModeSchema, SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../../common/chatSessionsService.js';

// export { isWellKnownModeSchema };

/**
 * Codicon for a known mode value, or `undefined` for values the picker doesn't
 * have an icon for. Used keyed by enum value, never by hardcoded position.
 */
export function getModeIcon(value: string): ThemeIcon | undefined {
	switch (value) {
		case 'interactive': return Codicon.comment;
		case 'plan': return Codicon.checklist;
		case 'autopilot': return Codicon.rocket;
		default: return undefined;
	}
}

/**
 * Maps a session-config `mode` schema to an {@link IChatSessionProviderOptionGroup}
 * suitable for `IChatSessionsService.setOptionGroupsForSessionType`.
 *
 * Returns `undefined` when:
 *  - the schema is not a {@link isWellKnownModeSchema well-known} string enum,
 *  - the schema is dynamic (`enumDynamic === true`),
 *  - or the property is not user-editable (`sessionMutable !== true` or `readOnly === true`).
 *
 * Items are derived strictly from `schema.enum` — agents may not advertise
 * every well-known value (e.g. `autopilot` may be missing).
 */
export function buildModeOptionGroup(schema: SessionConfigPropertySchema): IChatSessionProviderOptionGroup | undefined {
	if (!isWellKnownModeSchema(schema)) {
		return undefined;
	}
	if (schema.enumDynamic) {
		return undefined;
	}
	if (schema.sessionMutable !== true || schema.readOnly === true) {
		return undefined;
	}
	const enumValues = schema.enum ?? [];
	if (enumValues.length === 0) {
		return undefined;
	}
	const items: IChatSessionProviderOptionItem[] = enumValues.map((value, index) => ({
		id: value,
		name: schema.enumLabels?.[index] ?? value,
		description: schema.enumDescriptions?.[index],
		icon: getModeIcon(value),
	}));
	return {
		id: SessionConfigKey.Mode,
		name: schema.title || 'Mode',
		description: schema.description,
		items,
	};
}

/**
 * Resolve the option-group item that represents `currentValue` (falling back
 * to schema default and then the first enum value). Returns `undefined` when
 * no item can be resolved.
 */
export function getSelectedModeOptionItem(
	group: IChatSessionProviderOptionGroup,
	currentValue: unknown,
	schema: SessionConfigPropertySchema,
): IChatSessionProviderOptionItem | undefined {
	const candidates = [currentValue, schema.default, schema.enum?.[0]];
	for (const candidate of candidates) {
		if (typeof candidate !== 'string') {
			continue;
		}
		const item = group.items.find(i => i.id === candidate);
		if (item) {
			return item;
		}
	}
	return undefined;
}

/**
 * Stable serialization of the schema fields that affect picker rendering.
 * Used by the publisher to skip redundant `setOptionGroupsForSessionType`
 * calls when the schema hasn't changed.
 */
export function getModeSchemaFingerprint(schema: SessionConfigPropertySchema): string {
	return JSON.stringify({
		title: schema.title,
		description: schema.description,
		enum: schema.enum ?? [],
		enumLabels: schema.enumLabels ?? [],
		enumDescriptions: schema.enumDescriptions ?? [],
		default: schema.default,
		sessionMutable: schema.sessionMutable === true,
		readOnly: schema.readOnly === true,
		enumDynamic: schema.enumDynamic === true,
	});
}
