/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from '../../../base/common/types.js';
import { KNOWN_AUTO_APPROVE_VALUES, KNOWN_MODE_VALUES, SessionConfigKey } from './sessionConfigKeys.js';
import type { SessionConfigPropertySchema, SessionConfigSchema } from './state/protocol/commands.js';

export type SessionApprovalLevel = 'default' | 'assisted' | 'autoApprove';
export type SessionWorkspaceTarget = 'folder' | 'worktree';

export interface ISessionConfigProperty {
	readonly key: string;
	readonly schema: SessionConfigPropertySchema;
}

const copilotApprovalValues = new Set(['manual', 'assisted', 'allow-all']);
const vscodeIsolationValues = new Set(['folder', 'worktree']);
const copilotIsolationValues = new Set(['workspace', 'worktree']);

function getEnumProperty(schema: SessionConfigSchema | undefined, key: string, values: ReadonlySet<string>, required: string): ISessionConfigProperty | undefined {
	const property = schema?.properties[key];
	return property?.type === 'string' && !property.enumDynamic && Array.isArray(property.enum) && property.enum.includes(required)
		&& property.enum.every(value => isString(value) && values.has(value))
		? { key, schema: property } : undefined;
}

/** A published VS Code key wins even if its shape requires the generic picker. */
export function getSessionApprovalProperty(schema: SessionConfigSchema | undefined): ISessionConfigProperty | undefined {
	return schema && Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove)
		? getEnumProperty(schema, SessionConfigKey.AutoApprove, KNOWN_AUTO_APPROVE_VALUES, 'default')
		: getEnumProperty(schema, 'approvalMode', copilotApprovalValues, 'manual');
}

export function getSessionModeProperty(schema: SessionConfigSchema | undefined): ISessionConfigProperty | undefined {
	return getEnumProperty(schema, SessionConfigKey.Mode, KNOWN_MODE_VALUES, 'interactive');
}

function usesVSCodeWorkspaceProperties(schema: SessionConfigSchema): boolean {
	return Object.hasOwn(schema.properties, SessionConfigKey.Isolation)
		|| (!Object.hasOwn(schema.properties, 'target') && !Object.hasOwn(schema.properties, 'baseBranch'));
}

export function getSessionIsolationProperty(schema: SessionConfigSchema): ISessionConfigProperty | undefined {
	return usesVSCodeWorkspaceProperties(schema)
		? getEnumProperty(schema, SessionConfigKey.Isolation, vscodeIsolationValues, 'folder')
		: getEnumProperty(schema, 'target', copilotIsolationValues, 'workspace');
}

export function getSessionBaseBranchProperty(schema: SessionConfigSchema): ISessionConfigProperty | undefined {
	const key = usesVSCodeWorkspaceProperties(schema) ? SessionConfigKey.Branch : 'baseBranch';
	const property = schema.properties[key];
	return property?.type === 'string' && (property.enumDynamic || property.enum?.every(isString)) ? { key, schema: property } : undefined;
}

export function getSessionWorkspaceProperties(schema: SessionConfigSchema) {
	const vscode = usesVSCodeWorkspaceProperties(schema);
	return {
		isolationKey: vscode ? SessionConfigKey.Isolation : 'target',
		baseBranchKey: vscode ? SessionConfigKey.Branch : 'baseBranch',
		isolation: getSessionIsolationProperty(schema),
		baseBranch: getSessionBaseBranchProperty(schema),
	};
}

/** Reuses existing controls without renaming the host's properties or confusing its two branch fields. */
export function getSessionConfigPresentationKey(key: string, schema: SessionConfigSchema): string {
	const workspace = getSessionWorkspaceProperties(schema);
	return key === workspace.isolation?.key ? SessionConfigKey.Isolation
		: key === workspace.baseBranch?.key ? SessionConfigKey.Branch
			: key === SessionConfigKey.Branch && !usesVSCodeWorkspaceProperties(schema) ? 'newBranch' : key;
}

export function readSessionApprovalLevel(property: ISessionConfigProperty | undefined, value: unknown): SessionApprovalLevel | undefined {
	const level = property?.key === 'approvalMode' ? value === 'manual' ? 'default' : value === 'allow-all' ? 'autoApprove' : value : value;
	return isString(value) && property?.schema.enum?.includes(value) && (level === 'default' || level === 'assisted' || level === 'autoApprove') ? level : undefined;
}

export function writeSessionApprovalLevel(property: ISessionConfigProperty | undefined, level: string): string | undefined {
	const value = property?.key === 'approvalMode' ? level === 'default' ? 'manual' : level === 'autoApprove' ? 'allow-all' : level : level;
	return readSessionApprovalLevel(property, value) === level ? value : undefined;
}

export function readSessionIsolation(property: ISessionConfigProperty | undefined, value: unknown): SessionWorkspaceTarget | undefined {
	const isolation = property?.key === 'target' && value === 'workspace' ? 'folder' : value;
	return isString(value) && property?.schema.enum?.includes(value) && (isolation === 'folder' || isolation === 'worktree') ? isolation : undefined;
}

export function writeSessionIsolation(property: ISessionConfigProperty | undefined, isolation: string): string | undefined {
	const value = property?.key === 'target' && isolation === 'folder' ? 'workspace' : isolation;
	return readSessionIsolation(property, value) === isolation ? value : undefined;
}

export function getAvailableSessionApprovalValues(property: ISessionConfigProperty, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): readonly string[] {
	const offered = (property.schema.enum ?? []).filter((value): value is string => isString(value) && readSessionApprovalLevel(property, value) !== undefined);
	const available = values.availableApprovalModes;
	return property.key === 'approvalMode' && schema.properties.availableApprovalModes?.type === 'array' && schema.properties.availableApprovalModes.readOnly === true && Array.isArray(available)
		? offered.filter(value => available.includes(value)) : offered;
}

export function getEffectiveSessionApprovalValue(property: ISessionConfigProperty, schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>): unknown {
	return property.key === 'approvalMode' && schema.properties.effectiveApprovalMode?.type === 'string' && schema.properties.effectiveApprovalMode.readOnly === true && isString(values.effectiveApprovalMode)
		? values.effectiveApprovalMode : values[property.key] ?? property.schema.default;
}

export function isSessionConfigWritable(schema: SessionConfigPropertySchema | undefined, isNewSession: boolean): boolean {
	return !!schema && !schema.readOnly && (isNewSession || schema.sessionMutable === true);
}

function getSessionConfigWriteError(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown, isNewSession: boolean): string | undefined {
	const property = schema.properties[key];
	// readOnly controls picker edits, not settings-derived values forwarded to the host.
	if (!property || (!isNewSession && property.sessionMutable !== true)
		|| (key === 'approvalMode' && Object.hasOwn(schema.properties, SessionConfigKey.AutoApprove))
		|| ((key === 'target' || key === 'baseBranch') && usesVSCodeWorkspaceProperties(schema))) {
		return `Session configuration '${key}' is not writable.`;
	}
	const approval = getSessionApprovalProperty(schema);
	if ((approval?.key === key && (!isString(value) || !getAvailableSessionApprovalValues(approval, schema, values).includes(value)))
		|| (value !== undefined && property.enum?.length && !property.enumDynamic && !property.enum.some(candidate => candidate === value))) {
		return `Session configuration '${key}' does not offer '${String(value)}'.`;
	}
	return undefined;
}

export function validateSessionConfigWrite(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>>, key: string, value: unknown, isNewSession: boolean): void {
	const error = getSessionConfigWriteError(schema, values, key, value, isNewSession);
	if (error) {
		throw new Error(error);
	}
}

/** Retains advertised values without inventing defaults, renaming aliases, or enforcing UI readOnly hints. */
export function filterSessionConfigValues(schema: SessionConfigSchema, values: Readonly<Record<string, unknown>> | undefined, isNewSession = true): Record<string, unknown> {
	return Object.fromEntries(Object.entries(values ?? {}).filter(([key, value]) =>
		value !== undefined && !getSessionConfigWriteError(schema, values ?? {}, key, value, isNewSession)
	));
}
