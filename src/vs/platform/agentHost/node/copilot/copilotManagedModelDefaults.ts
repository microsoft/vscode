/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAutoModeTier, normalizeAutoModeTier, type AutoModeTier } from '../../common/autoModeTiers.js';
import type { ConfigPropertySchema } from '../../common/state/protocol/state.js';

/**
 * One enterprise-managed default the Copilot runtime overlays on a `models.list` entry
 * (github/copilot-agent-runtime#22675).
 *
 * Declared locally until the bundled `@github/copilot-sdk` publishes these fields. Runtimes
 * that predate the overlay omit them, and every reader falls back to today's behavior.
 */
export interface ICopilotManagedModelDefault {
	/** Effective value a new session applies when the caller does not choose one. */
	readonly value: string;
	/** `false` when policy locks the value. */
	readonly overridable: boolean;
	/** Managed-settings channel that supplied the value (`device`, `server`, or `policyHelper`). */
	readonly source: string;
	/** Policy value before the runtime resolved or adjusted it, present only when different. */
	readonly requested?: string;
}

/** Enterprise-managed defaults for one listed model. */
export interface ICopilotManagedModelDefaults {
	readonly model?: ICopilotManagedModelDefault;
	readonly reasoningEffort?: ICopilotManagedModelDefault;
	readonly contextTier?: ICopilotManagedModelDefault;
	readonly autoTier?: ICopilotManagedModelDefault;
}

/** The overlay fields a runtime may add to a `models.list` entry. */
export interface ICopilotManagedModelFields {
	/** The model a new session uses when the caller does not choose one. */
	readonly isDefault?: boolean;
	readonly managed?: ICopilotManagedModelDefaults;
}

/** Reads the overlay fields from an SDK `models.list` entry, ignoring malformed values. */
export function readCopilotManagedModelFields(model: object): ICopilotManagedModelFields {
	const { isDefault, managed } = model as { readonly isDefault?: unknown; readonly managed?: unknown };
	const defaults = managed && typeof managed === 'object' ? managed as Record<string, unknown> : undefined;
	const read = (key: keyof ICopilotManagedModelDefaults) => readManagedDefault(defaults?.[key]);
	const entries: ICopilotManagedModelDefaults = {
		model: read('model'),
		reasoningEffort: read('reasoningEffort'),
		contextTier: read('contextTier'),
		autoTier: read('autoTier'),
	};
	const hasManaged = Object.values(entries).some(entry => entry !== undefined);
	return {
		...(isDefault === true ? { isDefault: true } : {}),
		...(hasManaged ? { managed: entries } : {}),
	};
}

function readManagedDefault(candidate: unknown): ICopilotManagedModelDefault | undefined {
	if (!candidate || typeof candidate !== 'object') {
		return undefined;
	}
	const { value, overridable, source, requested } = candidate as Record<string, unknown>;
	if (typeof value !== 'string' || typeof overridable !== 'boolean') {
		return undefined;
	}
	return {
		value,
		overridable,
		source: typeof source === 'string' ? source : 'unknown',
		...(typeof requested === 'string' ? { requested } : {}),
	};
}

/** Marks a synthesized picker property read-only when policy locks its managed default. */
export function applyManagedLock(property: ConfigPropertySchema, managed: ICopilotManagedModelDefault | undefined): ConfigPropertySchema {
	return managed && !managed.overridable ? { ...property, readOnly: true } : property;
}

/**
 * Sets the context-size picker's default from a managed context tier: `long_context` selects the
 * largest offered window and `default` the smallest. Unknown tiers leave the property unchanged.
 */
export function applyManagedContextTier(property: ConfigPropertySchema | undefined, managed: ICopilotManagedModelDefault | undefined): ConfigPropertySchema | undefined {
	if (!property || !managed) {
		return property;
	}
	const sizes = property.enum?.filter((size): size is number => typeof size === 'number');
	if (!sizes?.length) {
		return property;
	}
	const size = managed.value === 'long_context' ? Math.max(...sizes)
		: managed.value === 'default' ? Math.min(...sizes)
			: undefined;
	return size === undefined ? property : applyManagedLock({ ...property, default: size }, managed);
}

/** The picker profile for a managed Auto tier, or `undefined` when the picker does not offer it. */
export function managedAutoModeTier(managed: ICopilotManagedModelDefault | undefined): AutoModeTier | undefined {
	const tier = normalizeAutoModeTier(managed?.value);
	return isAutoModeTier(tier) ? tier : undefined;
}
