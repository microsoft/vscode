/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSessionApprovalProperty, getSessionBaseBranchProperty, getSessionIsolationProperty } from '../../common/sessionConfigProperties.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { SessionConfigPropertySchema } from '../../common/state/protocol/commands.js';
import type { SessionConfigState } from '../../common/state/sessionState.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { ISessionConfigAdapter } from '../protocolServerHandler.js';

export const missionControlSessionConfigAdapter: ISessionConfigAdapter = {
	fromClientValues: fromMissionControlConfigValues,
	fromClientProperty: fromMissionControlConfigProperty,
	toClientConfig: toMissionControlSessionConfig,
	toClientAction: (action, rejected) => rejected && Object.keys(action.config).some(key => fromMissionControlConfigProperty(key) !== key)
		? action : { ...action, config: toMissionControlConfigValues(action.config) },
};

const approvalModeKey = 'approvalMode';
const approvalValues = ['manual', 'assisted', 'allow-all'];
const targetKey = 'target';
const targetValues = ['workspace', 'worktree'];
const baseBranchKey = 'baseBranch';

function toApprovalMode<T>(value: T): T | 'manual' | 'allow-all' {
	return value === 'default' ? 'manual' : value === 'autoApprove' ? 'allow-all' : value;
}

function toTarget<T>(value: T): T | 'workspace' {
	return value === 'folder' ? 'workspace' : value;
}

export function fromMissionControlConfigProperty(property: string): string {
	return property === approvalModeKey ? SessionConfigKey.AutoApprove
		: property === targetKey ? SessionConfigKey.Isolation
			: property === baseBranchKey ? SessionConfigKey.Branch : property;
}

/** Translates native configuration to the Copilot Host vocabulary. */
export function toMissionControlConfigValues(values: Record<string, unknown>, renamed?: ReadonlyMap<string, string>): Record<string, unknown> {
	const translateApprovals = !renamed || renamed.has(SessionConfigKey.AutoApprove);
	const hasApproval = translateApprovals && Object.hasOwn(values, SessionConfigKey.AutoApprove);
	const hasEffectiveApproval = translateApprovals && Object.hasOwn(values, 'effectiveApprovalMode');
	const hasAvailableApprovals = translateApprovals && Array.isArray(values.availableApprovalModes);
	const hasIsolation = (!renamed || renamed.has(SessionConfigKey.Isolation)) && Object.hasOwn(values, SessionConfigKey.Isolation);
	const hasBranch = (!renamed || renamed.has(SessionConfigKey.Branch)) && Object.hasOwn(values, SessionConfigKey.Branch);
	if (!hasApproval && !hasEffectiveApproval && !hasAvailableApprovals && !hasIsolation && !hasBranch) {
		return values;
	}
	const result = { ...values };
	if (hasApproval) {
		delete result[SessionConfigKey.AutoApprove];
		result[approvalModeKey] = toApprovalMode(values[SessionConfigKey.AutoApprove]);
	}
	if (hasEffectiveApproval) {
		result.effectiveApprovalMode = toApprovalMode(values.effectiveApprovalMode);
	}
	if (hasAvailableApprovals && Array.isArray(values.availableApprovalModes)) {
		result.availableApprovalModes = values.availableApprovalModes.map(toApprovalMode);
	}
	if (hasIsolation) {
		delete result[SessionConfigKey.Isolation];
		result[targetKey] = toTarget(values[SessionConfigKey.Isolation]);
	}
	if (hasBranch) {
		delete result[SessionConfigKey.Branch];
		result[baseBranchKey] = values[SessionConfigKey.Branch];
	}
	return result;
}

export function fromMissionControlConfigValues(values: Record<string, unknown>): Record<string, unknown>;
export function fromMissionControlConfigValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
export function fromMissionControlConfigValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!values) {
		return values;
	}
	const hasApproval = Object.hasOwn(values, approvalModeKey);
	const hasTarget = Object.hasOwn(values, targetKey);
	const hasBaseBranch = Object.hasOwn(values, baseBranchKey);
	if (!hasApproval && !hasTarget && !hasBaseBranch) {
		return values;
	}
	const { [approvalModeKey]: approvalMode, [targetKey]: target, [baseBranchKey]: baseBranch, ...rest } = values;
	if (hasApproval) {
		if (typeof approvalMode !== 'string' || !approvalValues.includes(approvalMode)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'approvalMode must be one of manual, assisted, allow-all');
		}
		const autoApprove = approvalMode === 'manual' ? 'default' : approvalMode === 'allow-all' ? 'autoApprove' : approvalMode;
		if (Object.hasOwn(values, SessionConfigKey.AutoApprove) && values[SessionConfigKey.AutoApprove] !== autoApprove) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'approvalMode and autoApprove must select the same approval behavior');
		}
		rest[SessionConfigKey.AutoApprove] = autoApprove;
	}
	if (hasTarget) {
		if (typeof target !== 'string' || !targetValues.includes(target)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'target must be one of workspace, worktree');
		}
		const isolation = target === 'workspace' ? 'folder' : target;
		if (Object.hasOwn(values, SessionConfigKey.Isolation) && values[SessionConfigKey.Isolation] !== isolation) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'target and isolation must select the same workspace isolation');
		}
		rest[SessionConfigKey.Isolation] = isolation;
	}
	if (hasBaseBranch) {
		if (typeof baseBranch !== 'string') {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'baseBranch must be a string');
		}
		if (Object.hasOwn(values, SessionConfigKey.Branch) && values[SessionConfigKey.Branch] !== baseBranch) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'baseBranch and branch must select the same base branch');
		}
		rest[SessionConfigKey.Branch] = baseBranch;
	}
	return rest;
}

function toMissionControlEnumProperty(schema: SessionConfigPropertySchema, mapValue: (value: unknown) => unknown, values: readonly string[]): SessionConfigPropertySchema {
	const options = (schema.enum ?? []).map((value, index) => ({ value: mapValue(value), index }))
		.filter((option): option is { value: string; index: number } => typeof option.value === 'string' && values.includes(option.value));
	const labels = schema.enumLabels;
	const descriptions = schema.enumDescriptions;
	return {
		...schema,
		...(schema.enum ? { enum: options.map(option => option.value) } : {}),
		...(schema.default !== undefined ? { default: mapValue(schema.default) } : {}),
		...(labels ? { enumLabels: options.map(option => labels[option.index]) } : {}),
		...(descriptions ? { enumDescriptions: options.map(option => descriptions[option.index]) } : {}),
	};
}

/** Publishes Copilot Host configuration names while retaining native host state. */
export function toMissionControlSessionConfig(config: SessionConfigState): SessionConfigState {
	const approval = getSessionApprovalProperty(config.schema);
	const isolation = getSessionIsolationProperty(config.schema);
	const branch = getSessionBaseBranchProperty(config.schema);
	const properties = { ...config.schema.properties };
	const renamed = new Map<string, string>();
	if (approval?.key === SessionConfigKey.AutoApprove) {
		delete properties[approval.key];
		properties[approvalModeKey] = toMissionControlEnumProperty(approval.schema, toApprovalMode, approvalValues);
		renamed.set(approval.key, approvalModeKey);
		const effective = properties.effectiveApprovalMode;
		if (effective?.type === 'string') {
			properties.effectiveApprovalMode = toMissionControlEnumProperty(effective, toApprovalMode, approvalValues);
		}
		const available = properties.availableApprovalModes;
		if (available?.type === 'array') {
			properties.availableApprovalModes = {
				...available,
				...(Array.isArray(available.default) ? { default: available.default.map(toApprovalMode) } : {}),
				...(available.items?.type === 'string' ? { items: toMissionControlEnumProperty(available.items, toApprovalMode, approvalValues) } : {}),
			};
		}
	}
	if (isolation?.key === SessionConfigKey.Isolation) {
		delete properties[isolation.key];
		properties[targetKey] = toMissionControlEnumProperty(isolation.schema, toTarget, targetValues);
		renamed.set(isolation.key, targetKey);
	}
	if (branch?.key === SessionConfigKey.Branch) {
		delete properties[branch.key];
		properties[baseBranchKey] = branch.schema;
		renamed.set(branch.key, baseBranchKey);
	}
	if (renamed.size === 0) {
		return config;
	}
	return {
		schema: {
			...config.schema,
			properties,
			...(config.schema.required ? { required: config.schema.required.map(key => renamed.get(key) ?? key) } : {}),
		},
		values: toMissionControlConfigValues(config.values, renamed),
	};
}
