/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Message, MessageAttachment, ToolDefinition, UsageInfo } from '../../state/protocol/state.js';
import type { CopilotCommand, CopilotErrorDetail, CopilotToolAvailability, CopilotToolDefer, CopilotUsageDetail } from './generated/copilotdMetadata.js';
import { isBoolean, isNumber, isObject, isString } from '../../../../../base/common/types.js';
import { hasAgentMetadata } from '../metadata.js';

interface IMetadataSource {
	readonly _meta?: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> | undefined {
	return isObject(value) ? value as Record<string, unknown> : undefined;
}

function payload(source: IMetadataSource, key: string): Record<string, unknown> | undefined {
	const value = object(source._meta?.[key]);
	return value && Object.keys(value).length > 0 ? value : undefined;
}

function string(value: unknown): string | undefined {
	return isString(value) ? value : undefined;
}

function number(value: unknown): number | undefined {
	return isNumber(value) && Number.isFinite(value) ? value : undefined;
}

export function readCopilotModelText(message: Pick<Message, '_meta'>): string | undefined {
	const value = message._meta?.['copilot.modelText'];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function withCopilotModelText<T extends Pick<Message, '_meta'>>(message: T, modelText: string | undefined): T {
	if (!modelText) {
		return message;
	}
	return { ...message, _meta: { ...message._meta, 'copilot.modelText': modelText } };
}

export function readCopilotCommand(message: Pick<Message, '_meta'>): CopilotCommand | undefined {
	const value = payload(message, 'copilot.command');
	if (value?.name !== 'compact') {
		return undefined;
	}
	const focus = string(value.focus)?.trim();
	return { name: 'compact', focus: focus || null };
}

export function withCopilotCommand<T extends Pick<Message, '_meta'>>(message: T, command: CopilotCommand): T {
	return { ...message, _meta: { ...message._meta, 'copilot.command': command } };
}

export function readCopilotMessageSource(message: Pick<Message, '_meta'>): string | undefined {
	const value = message._meta?.['copilot.source'];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function isCopilotMessageInternal(message: Pick<Message, '_meta'>): boolean {
	return message._meta?.['copilot.visibility'] === 'internal';
}

export function withCopilotMessageInternal<T extends Pick<Message, '_meta'>>(message: T): T {
	return { ...message, _meta: { ...message._meta, 'copilot.visibility': 'internal' } };
}

export function readCopilotModelCategory(source: IMetadataSource): 'lightweight' | 'versatile' | 'powerful' | undefined {
	const value = source._meta?.['copilot.modelPickerCategory'];
	return value === 'lightweight' || value === 'versatile' || value === 'powerful' ? value : undefined;
}

export function readCopilotErrorDetail(source: IMetadataSource): CopilotErrorDetail | undefined {
	const value = payload(source, 'copilot.errorDetail');
	if (!value) {
		return undefined;
	}
	const statusCode = number(value.statusCode);
	return {
		...(typeof value.errorCode === 'string' ? { errorCode: value.errorCode } : {}),
		...(statusCode !== undefined && Number.isInteger(statusCode) ? { statusCode } : {}),
		...(typeof value.url === 'string' ? { url: value.url } : {}),
		...(typeof value.providerCallId === 'string' ? { providerCallId: value.providerCallId } : {}),
		...(typeof value.serviceRequestId === 'string' ? { serviceRequestId: value.serviceRequestId } : {}),
		...(isBoolean(value.eligibleForAutoSwitch) ? { eligibleForAutoSwitch: value.eligibleForAutoSwitch } : {}),
	};
}

export function readCopilotUsageDetail(source: Pick<UsageInfo, '_meta'>): CopilotUsageDetail | undefined {
	const value = payload(source, 'copilot.usageDetail');
	if (!value) {
		return undefined;
	}
	const result: { -readonly [K in keyof CopilotUsageDetail]: CopilotUsageDetail[K] } = {};
	for (const key of ['cost', 'cacheWriteTokens', 'reasoningTokens', 'duration', 'interTokenLatencyMs', 'timeToFirstTokenMs'] as const) {
		const field = number(value[key]);
		if (field !== undefined && field >= 0 && (!['cacheWriteTokens', 'reasoningTokens', 'duration'].includes(key) || Number.isInteger(field))) {
			result[key] = field;
		}
	}
	for (const key of ['cacheExpiresAt', 'reasoningEffort', 'finishReason', 'initiator', 'apiEndpoint', 'apiCallId', 'providerCallId', 'serviceRequestId'] as const) {
		const field = string(value[key]);
		if (field !== undefined) {
			result[key] = field;
		}
	}
	if (isBoolean(value.contentFilterTriggered)) {
		result.contentFilterTriggered = value.contentFilterTriggered;
	}
	const usage = object(value.copilotUsage);
	if (usage) {
		const totalNanoAiu = number(usage.totalNanoAiu);
		result.copilotUsage = {
			...usage,
			...(totalNanoAiu !== undefined && totalNanoAiu >= 0 ? { totalNanoAiu } : {}),
		};
		if (totalNanoAiu === undefined || totalNanoAiu < 0) {
			delete result.copilotUsage.totalNanoAiu;
		}
	}
	return result;
}

export interface IAgentContextUsage {
	readonly currentTokens: number;
	readonly tokenLimit: number;
	readonly messagesLength: number;
	readonly conversationTokens?: number;
	readonly systemTokens?: number;
	readonly toolDefinitionsTokens?: number;
}

export function readCopilotUsageInfo(source: IMetadataSource): Readonly<Record<string, unknown>> | undefined {
	return payload(source, 'copilot.usageInfo');
}

export function readCopilotModelCallFailure(source: IMetadataSource): Readonly<Record<string, unknown>> | undefined {
	return payload(source, 'copilot.modelCallFailure');
}

export function readCopilotContext(source: IMetadataSource): Readonly<Record<string, unknown>> | undefined {
	const value = payload(source, 'copilot.context');
	return value && typeof value.cwd === 'string' ? value : undefined;
}

export function readCopilotAutoTierSwitchFailure(source: IMetadataSource): Readonly<Record<string, unknown>> | undefined {
	const value = payload(source, 'copilot.autoTierSwitchFailure');
	return value && ['requestedAutoTier', 'effectiveAutoTier', 'reason', 'eventId'].every(key => typeof value[key] === 'string') ? value : undefined;
}

export function readCopilotContextUsage(source: IMetadataSource): IAgentContextUsage | undefined {
	const value = payload(source, 'copilot.usageInfo');
	if (!value) {
		return undefined;
	}
	const currentTokens = number(value.currentTokens);
	const tokenLimit = number(value.tokenLimit);
	const messagesLength = number(value.messagesLength);
	if (currentTokens === undefined || tokenLimit === undefined || messagesLength === undefined
		|| !Number.isInteger(currentTokens) || currentTokens < 0 || !Number.isInteger(tokenLimit) || tokenLimit <= 0 || !Number.isInteger(messagesLength) || messagesLength < 0) {
		return undefined;
	}
	const optional: { conversationTokens?: number; systemTokens?: number; toolDefinitionsTokens?: number } = {};
	for (const key of ['conversationTokens', 'systemTokens', 'toolDefinitionsTokens'] as const) {
		const field = number(value[key]);
		if (field !== undefined && Number.isInteger(field) && field >= 0) {
			optional[key] = field;
		}
	}
	return { currentTokens, tokenLimit, messagesLength, ...optional };
}

export interface IAgentToolOrigin {
	readonly kind: string;
	readonly namespacedName?: string;
	readonly mcpServerName?: string;
	readonly mcpToolName?: string;
	readonly deferLoading?: boolean;
}

export function readCopilotToolOrigin(tool: Pick<ToolDefinition, '_meta'>): IAgentToolOrigin | undefined {
	const value = payload(tool, 'copilot.toolOrigin');
	if (!value || typeof value.kind !== 'string' || !value.kind) {
		return undefined;
	}
	return {
		kind: value.kind,
		...(typeof value.namespacedName === 'string' ? { namespacedName: value.namespacedName } : {}),
		...(typeof value.mcpServerName === 'string' ? { mcpServerName: value.mcpServerName } : {}),
		...(typeof value.mcpToolName === 'string' ? { mcpToolName: value.mcpToolName } : {}),
		...(isBoolean(value.deferLoading) ? { deferLoading: value.deferLoading } : {}),
	};
}

export function readCopilotToolTelemetry(source: IMetadataSource): Readonly<Record<string, unknown>> | undefined {
	return payload(source, 'copilot.toolTelemetry');
}

export interface IAgentToolOutputChunk {
	readonly output: string;
	readonly isPty: boolean;
}

export function readCopilotToolOutputDelta(source: IMetadataSource): IAgentToolOutputChunk | undefined {
	const pty = object(source._meta?.ptyTerminal);
	if (pty && typeof pty.output === 'string' && pty.output.length > 0) {
		return { output: pty.output, isPty: true };
	}
	const value = source._meta?.['copilot.toolOutputDelta'];
	return typeof value === 'string' && value.length > 0 ? { output: value, isPty: false } : undefined;
}

export interface IAgentClientToolPreferences {
	readonly defer?: CopilotToolDefer;
	readonly availability?: CopilotToolAvailability;
}

export function readCopilotToolDefer(tool: Pick<ToolDefinition, '_meta'>): CopilotToolDefer | undefined {
	const value = tool._meta?.['copilot.toolDefer'];
	return value === 'auto' || value === 'never' ? value : undefined;
}

export function readCopilotToolAvailability(tool: Pick<ToolDefinition, '_meta'>): CopilotToolAvailability {
	return tool._meta?.['copilot.toolAvailability'] === 'userChats' ? 'userChats' : 'session';
}

export function withCopilotToolPreferences<T extends ToolDefinition>(tool: T, preferences: IAgentClientToolPreferences | undefined): T {
	if (!preferences || (preferences.defer === undefined && preferences.availability === undefined)) {
		return tool;
	}
	if (preferences.defer === undefined && preferences.availability === 'session' && !hasAgentMetadata(tool, ['copilot.toolAvailability'])) {
		return tool;
	}
	const meta = { ...tool._meta };
	if (preferences.availability === 'session') {
		delete meta['copilot.toolAvailability'];
	}
	return {
		...tool,
		_meta: {
			...meta,
			...(preferences.defer !== undefined ? { 'copilot.toolDefer': preferences.defer } : {}),
			...(preferences.availability !== undefined && preferences.availability !== 'session' ? { 'copilot.toolAvailability': preferences.availability } : {}),
		},
	};
}

/** The original open payload is retained for lossless attachment round trips. */
export interface IAgentCopilotAttachmentDetail {
	readonly type: string;
	readonly raw: Record<string, unknown>;
	readonly text?: string;
	readonly url?: string;
}

export function readCopilotAttachmentDetail(attachment: Pick<MessageAttachment, '_meta'>): IAgentCopilotAttachmentDetail | undefined {
	const value = payload(attachment, 'copilot.attachmentDetail');
	if (!value || typeof value.type !== 'string') {
		return undefined;
	}
	return { type: value.type, raw: value, text: string(value.text), url: string(value.url) };
}

export function withCopilotAttachmentDetail<T extends MessageAttachment>(attachment: T, detail: Record<string, unknown>): T {
	return { ...attachment, _meta: { ...attachment._meta, 'copilot.attachmentDetail': detail } };
}
