/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import { isUUID } from '../../../base/common/uuid.js';

export interface IOriginatingTrigger {
	readonly id: string;
	readonly kind: 'user' | 'automation' | 'system' | 'api';
}

export interface IOriginatingTriggerContext {
	readonly triggers: readonly IOriginatingTrigger[];
	readonly incomplete: boolean;
	readonly involvesSteering: boolean;
}

/** Validates the runtime's bounded, content-free origin snapshot. */
export function parseOriginatingTrigger(value: unknown): IOriginatingTriggerContext | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const candidate = value as Record<string, unknown>;
	if (!Array.isArray(candidate.triggers) || candidate.triggers.length > 16
		|| typeof candidate.incomplete !== 'boolean' || typeof candidate.involvesSteering !== 'boolean') {
		return undefined;
	}
	const triggers: IOriginatingTrigger[] = [];
	for (const item of candidate.triggers) {
		if (!isObject(item)) {
			return undefined;
		}
		const trigger = item as Record<string, unknown>;
		if (typeof trigger.id !== 'string' || !isUUID(trigger.id)
			|| trigger.id !== trigger.id.toLowerCase() || triggers.some(previous => previous.id === trigger.id)
			|| (trigger.kind !== 'user' && trigger.kind !== 'automation' && trigger.kind !== 'system' && trigger.kind !== 'api')) {
			return undefined;
		}
		triggers.push({ id: trigger.id, kind: trigger.kind });
	}
	return { triggers, incomplete: candidate.incomplete, involvesSteering: candidate.involvesSteering };
}

/** Reads the optional snapshot on an SDK event or invocation without depending on its SDK version. */
export function readOriginatingTrigger(value: object): IOriginatingTriggerContext | undefined {
	return parseOriginatingTrigger((value as Record<string, unknown>).originatingTrigger);
}

export function supportsOriginatingTrigger(value: object): boolean {
	return (value as Record<string, unknown>).originatingTrigger === true;
}

export function mergeOriginatingTriggers(previous: IOriginatingTriggerContext | undefined, next: IOriginatingTriggerContext): IOriginatingTriggerContext {
	if (!previous) {
		return next;
	}
	const triggers = [...previous.triggers];
	let incomplete = previous.incomplete || next.incomplete;
	for (const trigger of next.triggers) {
		const existing = triggers.find(candidate => candidate.id === trigger.id);
		if (existing) {
			incomplete ||= existing.kind !== trigger.kind;
		} else if (triggers.length < 16) {
			triggers.push(trigger);
		} else {
			incomplete = true;
		}
	}
	return { triggers, incomplete, involvesSteering: previous.involvesSteering || next.involvesSteering };
}

export interface IOriginatingTriggerTelemetry {
	originatingTriggerId?: string;
	originatingTriggerKind?: string;
	originatingTriggerAttribution?: 'known' | 'multiple' | 'partial' | 'unknown';
	originatingTriggers?: string;
	involvesSteering?: boolean;
}

export type OriginatingTriggerClassification = {
	originatingTriggerId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque runtime-issued initiating trigger occurrence ID.' };
	originatingTriggerKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'User, automation, system, or API origin category.' };
	originatingTriggerAttribution?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the origin is known, multiple, partial, or unknown.' };
	originatingTriggers?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded JSON array of runtime UUIDs and origin categories for shared or partial attribution.' };
	involvesSteering?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether steering was observed in the execution input chain.' };
};

export function originatingTriggerTelemetry(context: IOriginatingTriggerContext | undefined): IOriginatingTriggerTelemetry {
	if (!context) {
		return {};
	}
	const attribution = context.triggers.length === 0 ? 'unknown' : context.incomplete ? 'partial' : context.triggers.length === 1 ? 'known' : 'multiple';
	return {
		originatingTriggerAttribution: attribution,
		involvesSteering: context.involvesSteering,
		...(attribution === 'known'
			? { originatingTriggerId: context.triggers[0].id, originatingTriggerKind: context.triggers[0].kind }
			: context.triggers.length ? { originatingTriggers: JSON.stringify(context.triggers) } : {}),
	};
}
