/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import { IOnboardingPresentationRef } from './onboardingScenario.js';
import { IOnboardingSequenceStep } from './onboardingSequence.js';

export interface ICommandTryoutPayload {
	readonly commandId: string;
	readonly arguments?: readonly unknown[];
	/** Uses the command's `{ targetScope }` result to bind subsequent guided steps to one UI instance. */
	readonly captureTargetScope?: boolean;
}

export interface IViewTryoutPayload {
	readonly id: string;
	readonly target: 'view' | 'container';
	readonly focus?: boolean;
}

export type EditorSampleTryoutPayload = {
	readonly type: 'text';
	readonly title: string;
	readonly text: string;
	readonly languageId?: string;
} | {
	readonly type: 'diff';
	readonly title: string;
	readonly original: string;
	readonly modified: string;
	readonly languageId?: string;
};

export interface IGuidedTryoutPayload {
	readonly launch: IOnboardingPresentationRef;
	readonly steps: readonly IOnboardingSequenceStep[];
	readonly unavailableMessage?: string;
}

export function isCommandTryoutPayload(value: unknown): value is ICommandTryoutPayload {
	return typeof value === 'object' && value !== null
		&& 'commandId' in value && typeof value.commandId === 'string' && value.commandId.length > 0
		&& (!('arguments' in value) || value.arguments === undefined || Array.isArray(value.arguments))
		&& (!('captureTargetScope' in value) || value.captureTargetScope === undefined || typeof value.captureTargetScope === 'boolean');
}

export function isViewTryoutPayload(value: unknown): value is IViewTryoutPayload {
	return typeof value === 'object' && value !== null
		&& 'id' in value && typeof value.id === 'string' && value.id.length > 0
		&& 'target' in value && (value.target === 'view' || value.target === 'container')
		&& (!('focus' in value) || value.focus === undefined || typeof value.focus === 'boolean');
}

export function isEditorSampleTryoutPayload(value: unknown): value is EditorSampleTryoutPayload {
	if (typeof value !== 'object' || value === null
		|| !('type' in value) || !('title' in value) || typeof value.title !== 'string'
		|| ('languageId' in value && value.languageId !== undefined && typeof value.languageId !== 'string')) {
		return false;
	}
	return value.type === 'text'
		? 'text' in value && typeof value.text === 'string'
		: value.type === 'diff' && 'original' in value && typeof value.original === 'string' && 'modified' in value && typeof value.modified === 'string';
}

export function isGuidedTryoutPayload(value: unknown): value is IGuidedTryoutPayload {
	if (!isObject(value)) {
		return false;
	}
	const candidate = value as Partial<IGuidedTryoutPayload>;
	if (!isObject(candidate.launch) || typeof candidate.launch.kind !== 'string' || !Array.isArray(candidate.steps)
		|| (candidate.unavailableMessage !== undefined && typeof candidate.unavailableMessage !== 'string')) {
		return false;
	}
	return candidate.steps.every(value => {
		if (!isObject(value)) {
			return false;
		}
		const step = value as Partial<IOnboardingSequenceStep>;
		return typeof step.id === 'string' && typeof step.kind === 'string' && Object.hasOwn(value, 'payload');
	});
}
