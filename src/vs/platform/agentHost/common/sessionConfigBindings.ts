/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KNOWN_AUTO_APPROVE_VALUES, KNOWN_MODE_VALUES, SessionConfigKey } from './sessionConfigKeys.js';
import type { SessionConfigPropertySchema, SessionConfigSchema } from './state/protocol/commands.js';

export type SessionApprovalLevel = 'default' | 'assisted' | 'autoApprove';
export type SessionWorkspaceTarget = 'folder' | 'worktree';

export interface ISessionConfigEnumBinding<T extends string> {
	readonly key: string;
	readonly schema: SessionConfigPropertySchema;
	readonly choices: readonly { readonly value: T; readonly configValue: string }[];
}

export interface ISessionWorkspaceBinding {
	readonly isolation: ISessionConfigEnumBinding<SessionWorkspaceTarget> | undefined;
	readonly baseBranch: { readonly key: string; readonly schema: SessionConfigPropertySchema } | undefined;
	readonly isolationKey: string;
	readonly baseBranchKey: string;
}

function bindEnum<T extends string>(schema: SessionConfigSchema, key: string, mapping: Readonly<Record<string, T>>, required: string, tolerated?: ReadonlySet<string>): ISessionConfigEnumBinding<T> | undefined {
	const property = schema.properties[key];
	if (!property || property.type !== 'string' || property.enumDynamic || !Array.isArray(property.enum)
		|| !property.enum.includes(required) || !property.enum.every(value => typeof value === 'string' && (Object.hasOwn(mapping, value) || tolerated?.has(value)))) {
		return undefined;
	}
	return {
		key, schema: property,
		choices: property.enum.flatMap(configValue => typeof configValue === 'string' && Object.hasOwn(mapping, configValue) ? [{ configValue, value: mapping[configValue] }] : []),
	};
}

/** Key presence chooses the entire convention, even when that property's shape is invalid. */
export function getSessionApprovalBinding(schema: SessionConfigSchema | undefined): ISessionConfigEnumBinding<SessionApprovalLevel> | undefined {
	if (!schema) {
		return undefined;
	}
	return Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove)
		? bindEnum(schema, SessionConfigKey.AutoApprove, { default: 'default', assisted: 'assisted', autoApprove: 'autoApprove' }, 'default', KNOWN_AUTO_APPROVE_VALUES)
		: bindEnum(schema, 'approvalMode', { manual: 'default', assisted: 'assisted', 'allow-all': 'autoApprove' }, 'manual');
}

export function getSessionModeBinding(schema: SessionConfigSchema | undefined): ISessionConfigEnumBinding<string> | undefined {
	return schema ? bindEnum(schema, SessionConfigKey.Mode, { interactive: 'interactive', plan: 'plan', autopilot: 'autopilot' }, 'interactive', KNOWN_MODE_VALUES) : undefined;
}

export function getSessionWorkspaceBinding(schema: SessionConfigSchema): ISessionWorkspaceBinding {
	const vscode = Object.hasOwn(schema.properties, SessionConfigKey.Isolation)
		|| (!Object.hasOwn(schema.properties, 'target') && !Object.hasOwn(schema.properties, 'baseBranch'));
	const isolationKey = vscode ? SessionConfigKey.Isolation : 'target';
	const baseBranchKey = vscode ? SessionConfigKey.Branch : 'baseBranch';
	const property = schema.properties[baseBranchKey];
	return {
		isolationKey,
		baseBranchKey,
		isolation: vscode
			? bindEnum(schema, isolationKey, { folder: 'folder', worktree: 'worktree' }, 'folder')
			: bindEnum(schema, isolationKey, { workspace: 'folder', worktree: 'worktree' }, 'workspace'),
		baseBranch: property?.type === 'string' && (property.enumDynamic || property.enum?.every(value => typeof value === 'string'))
			? { key: baseBranchKey, schema: property }
			: undefined,
	};
}

/** Presentation roles do not change the keys sent back to the host. */
export function getSessionConfigPresentationKey(key: string, schema: SessionConfigSchema): string {
	const workspace = getSessionWorkspaceBinding(schema);
	return key === workspace.isolation?.key ? SessionConfigKey.Isolation
		: key === workspace.baseBranch?.key ? SessionConfigKey.Branch
			: key === SessionConfigKey.Branch && workspace.isolationKey === 'target' ? 'newBranch'
				: key;
}

export function readSessionConfigBinding<T extends string>(binding: ISessionConfigEnumBinding<T> | undefined, value: unknown): T | undefined {
	return binding?.choices.find(choice => choice.configValue === value)?.value;
}

export function writeSessionConfigBinding<T extends string>(binding: ISessionConfigEnumBinding<T> | undefined, value: string): string | undefined {
	return binding?.choices.find(choice => choice.value === value)?.configValue;
}

export function getAvailableSessionApprovalChoices(binding: ISessionConfigEnumBinding<SessionApprovalLevel>, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): ISessionConfigEnumBinding<SessionApprovalLevel>['choices'] {
	const available = values.availableApprovalModes;
	return binding.key === 'approvalMode' && schema.properties.availableApprovalModes?.type === 'array' && schema.properties.availableApprovalModes?.readOnly === true && Array.isArray(available)
		? binding.choices.filter(choice => available.includes(choice.configValue))
		: binding.choices;
}

export function getEffectiveSessionApprovalValue(binding: ISessionConfigEnumBinding<SessionApprovalLevel>, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): unknown {
	return binding.key === 'approvalMode' && schema.properties.effectiveApprovalMode?.type === 'string' && schema.properties.effectiveApprovalMode?.readOnly === true && typeof values.effectiveApprovalMode === 'string'
		? values.effectiveApprovalMode
		: values[binding.key] ?? binding.schema.default;
}

export function validateSessionConfigWrite(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown, isNewSession: boolean): void {
	const property = schema.properties[key];
	const workspace = getSessionWorkspaceBinding(schema);
	if (!property || !isSessionConfigWritable(property, isNewSession)
		|| (key === 'approvalMode' && Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove))
		|| ((key === 'target' || key === 'baseBranch') && workspace.isolationKey === SessionConfigKey.Isolation)) {
		throw new Error(`Session configuration '${key}' is not writable.`);
	}
	const approval = getSessionApprovalBinding(schema);
	if (approval?.key === key && !getAvailableSessionApprovalChoices(approval, schema, values).some(choice => choice.configValue === value)) {
		throw new Error(`Session configuration '${key}' does not offer '${String(value)}'.`);
	}
	if (value !== undefined && property.enum?.length && !property.enumDynamic && !property.enum.some(candidate => candidate === value)) {
		throw new Error(`Session configuration '${key}' does not offer '${String(value)}'.`);
	}
}

export function isSessionConfigWritable(schema: SessionConfigPropertySchema | undefined, isNewSession: boolean): boolean {
	return !!schema && !schema.readOnly && (isNewSession || schema.sessionMutable === true);
}

/** Retains only advertised writable properties; host-owned reports never become client requests. */
export function filterSessionConfigValues(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>> | undefined, isNewSession = true): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const approval = getSessionApprovalBinding(schema);
	const workspace = getSessionWorkspaceBinding(schema);
	for (const [key, value] of Object.entries(values ?? {})) {
		const property = schema.properties[key];
		if (!isSessionConfigWritable(property, isNewSession) || value === undefined
			|| (key === 'approvalMode' && Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove))
			|| (key === 'target' || key === 'baseBranch') && workspace.isolationKey === SessionConfigKey.Isolation
			|| property.enum?.length && !property.enumDynamic && !property.enum.some(candidate => candidate === value)) {
			continue;
		}
		if (approval?.key === key && !getAvailableSessionApprovalChoices(approval, schema, values ?? {}).some(choice => choice.configValue === value)) {
			continue;
		}
		result[key] = value;
	}
	return result;
}
