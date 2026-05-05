/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';

export const enum StaleSessionProviderKind {
	CopilotCLI = 'copilot-cli',
	Claude = 'claude',
	Local = 'local',
}

export const enum StaleSessionWarningAction {
	StartNewSession = 'startNewSession',
	CompactAndContinue = 'compactAndContinue',
	SendAnyway = 'sendAnyway',
}

export interface StaleSessionWarningThreshold {
	readonly timeHours?: number;
	readonly tokens?: number;
}

export interface StaleSessionWarningMetadata {
	readonly kind: 'staleSessionWarning';
	readonly providerKind: StaleSessionProviderKind;
	readonly action: StaleSessionWarningAction;
	readonly originalPrompt: string;
	readonly sessionId?: string;
	readonly modelId?: string;
}

export type StaleSessionWarningRequestMetadata = Omit<StaleSessionWarningMetadata, 'action'>;

export interface StaleSessionWarning {
	readonly providerKind: StaleSessionProviderKind;
	readonly modelId: string | undefined;
	readonly idleMs: number;
	readonly tokenCount: number;
	readonly thresholds: Required<StaleSessionWarningThreshold>;
}

export interface StaleSessionWarningInput {
	readonly providerKind: StaleSessionProviderKind;
	readonly modelId: string | undefined;
	readonly tokenCount: number | undefined;
	readonly lastActivityTime: number | undefined;
	readonly now?: number;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const FALLBACK_THRESHOLD_HOURS = 8;
const FALLBACK_THRESHOLD_TOKENS = 80_000;

export function getStaleSessionWarningThresholds(configurationService: IConfigurationService, modelId: string | undefined): Required<StaleSessionWarningThreshold> {
	const timeHours = positiveNumberOrDefault(
		configurationService.getConfig(ConfigKey.Advanced.StaleSessionWarningThresholdHours),
		FALLBACK_THRESHOLD_HOURS
	);
	const tokens = positiveNumberOrDefault(
		configurationService.getConfig(ConfigKey.Advanced.StaleSessionWarningThresholdTokens),
		FALLBACK_THRESHOLD_TOKENS
	);
	const byModel = configurationService.getConfig(ConfigKey.Advanced.StaleSessionWarningThresholdsByModel);
	const modelThreshold = modelId ? byModel[modelId] : undefined;

	return {
		timeHours: positiveNumberOrDefault(modelThreshold?.timeHours, timeHours),
		tokens: positiveNumberOrDefault(modelThreshold?.tokens, tokens),
	};
}

export function shouldWarnAboutStaleSession(configurationService: IConfigurationService, input: StaleSessionWarningInput): StaleSessionWarning | undefined {
	if (!configurationService.getConfig(ConfigKey.Advanced.StaleSessionWarningEnabled)) {
		return undefined;
	}

	const excludedProviders = configurationService.getConfig(ConfigKey.Advanced.StaleSessionWarningExcludedProviders);
	if (excludedProviders.includes(input.providerKind)) {
		return undefined;
	}

	if (input.tokenCount === undefined || input.lastActivityTime === undefined) {
		return undefined;
	}

	const thresholds = getStaleSessionWarningThresholds(configurationService, input.modelId);
	const idleMs = (input.now ?? Date.now()) - input.lastActivityTime;
	if (idleMs < thresholds.timeHours * MS_PER_HOUR || input.tokenCount < thresholds.tokens) {
		return undefined;
	}

	return {
		providerKind: input.providerKind,
		modelId: input.modelId,
		idleMs,
		tokenCount: input.tokenCount,
		thresholds,
	};
}

export function showStaleSessionWarningConfirmation(stream: vscode.ChatResponseStream, warning: StaleSessionWarning, metadata: StaleSessionWarningRequestMetadata): void {
	const idleTime = formatStaleSessionIdleTime(warning.idleMs);
	const tokenCount = formatStaleSessionTokenCount(warning.tokenCount);

	stream.confirmation(
		l10n.t('Long, idle session'),
		l10n.t('This session was last active {0} and currently holds {1} of context. Sending another message now will likely miss the prompt cache and re-bill the full context. Consider starting fresh or compacting before continuing.', idleTime, tokenCount),
		{
			metadata: {
				metadataByAction: {
					[StaleSessionWarningAction.StartNewSession]: { ...metadata, action: StaleSessionWarningAction.StartNewSession },
					[StaleSessionWarningAction.CompactAndContinue]: { ...metadata, action: StaleSessionWarningAction.CompactAndContinue },
					[StaleSessionWarningAction.SendAnyway]: { ...metadata, action: StaleSessionWarningAction.SendAnyway },
				}
			}
		},
		[
			l10n.t('Start New Session'),
			l10n.t('Compact and Continue'),
			l10n.t('Send Anyway'),
		]
	);
}

export function createStaleSessionWarningResult(metadata: StaleSessionWarningRequestMetadata): vscode.ChatResult {
	return {
		metadata: {
			staleSessionWarning: metadata,
		}
	};
}

export function createStaleSessionWarningActionResult(metadata: StaleSessionWarningMetadata): vscode.ChatResult {
	return {
		metadata: {
			staleSessionWarningAction: metadata,
		}
	};
}

export function getStaleSessionWarningConfirmation(request: vscode.ChatRequest): StaleSessionWarningMetadata | undefined {
	const metadataByAction = getConfirmationMetadataByAction(request);
	if (!metadataByAction) {
		return undefined;
	}

	const selectedAction = getSelectedAction(request.prompt);
	if (!selectedAction) {
		return undefined;
	}

	return metadataByAction[selectedAction];
}

export function removeStaleSessionWarningHistory(history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]): readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[] {
	const filtered: (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[] = [];
	for (let i = 0; i < history.length; i++) {
		const entry = history[i];
		const next = history[i + 1];
		const warningMetadata = getStaleSessionWarningResultMetadata(next);
		const actionMetadata = getStaleSessionWarningActionResultMetadata(next);
		if (warningMetadata && isRequestTurnForStaleSessionWarning(entry, warningMetadata)) {
			i++;
			continue;
		}
		if (actionMetadata?.action === StaleSessionWarningAction.StartNewSession) {
			i++;
			continue;
		}
		filtered.push(entry);
	}
	return filtered;
}

export function estimateChatHistoryTokens(history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]): number {
	let characters = 0;
	for (const turn of history) {
		characters += extractTurnText(turn).length;
	}
	return Math.ceil(characters / 4);
}

export function getLastActivityFromChatSessionItem(item: vscode.ChatSessionItem | undefined): number | undefined {
	if (!item?.timing) {
		return undefined;
	}

	const timing = item.timing;
	return timing.lastRequestEnded
		?? timing.endTime
		?? timing.lastRequestStarted
		?? timing.startTime
		?? timing.created;
}

export function isStaleSessionWarningBypass(request: vscode.ChatRequest): boolean {
	return getStaleSessionWarningConfirmation(request)?.action === StaleSessionWarningAction.SendAnyway;
}

export function getStaleSessionWarningTelemetry(warning: StaleSessionWarning): { readonly properties: Record<string, string>; readonly measurements: Record<string, number> } {
	return {
		properties: {
			providerKind: warning.providerKind,
			modelId: warning.modelId ?? 'unknown',
		},
		measurements: {
			idleHours: warning.idleMs / MS_PER_HOUR,
			tokenCount: warning.tokenCount,
		}
	};
}

export function formatStaleSessionIdleTime(idleMs: number): string {
	if (idleMs < MS_PER_HOUR) {
		const minutes = Math.max(1, Math.round(idleMs / MS_PER_MINUTE));
		return minutes === 1 ? l10n.t('about 1 minute ago') : l10n.t('about {0} minutes ago', minutes);
	}
	if (idleMs < MS_PER_DAY) {
		const hours = Math.max(1, Math.round(idleMs / MS_PER_HOUR));
		return hours === 1 ? l10n.t('about 1 hour ago') : l10n.t('about {0} hours ago', hours);
	}
	const days = Math.max(1, Math.floor(idleMs / MS_PER_DAY));
	return days === 1 ? l10n.t('1 day ago') : l10n.t('{0} days ago', days);
}

export function formatStaleSessionTokenCount(tokenCount: number): string {
	if (tokenCount < 1000) {
		return tokenCount === 1 ? l10n.t('1 token') : l10n.t('{0} tokens', tokenCount);
	}
	const tokenCountInThousands = Math.floor(tokenCount / 1000);
	return tokenCountInThousands === 1 ? l10n.t('1K tokens') : l10n.t('{0}K tokens', tokenCountInThousands);
}

function positiveNumberOrDefault(value: number | undefined, defaultValue: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function getConfirmationMetadataByAction(request: vscode.ChatRequest): Record<StaleSessionWarningAction, StaleSessionWarningMetadata> | undefined {
	const metadata = request.acceptedConfirmationData?.[0]?.metadata ?? request.rejectedConfirmationData?.[0]?.metadata;
	if (!metadata || typeof metadata !== 'object' || !('metadataByAction' in metadata)) {
		return undefined;
	}

	const metadataByAction = (metadata as { metadataByAction?: unknown }).metadataByAction;
	if (!metadataByAction || typeof metadataByAction !== 'object') {
		return undefined;
	}

	const record = metadataByAction as Partial<Record<StaleSessionWarningAction, StaleSessionWarningMetadata>>;
	if (isStaleSessionWarningMetadata(record[StaleSessionWarningAction.StartNewSession])
		&& isStaleSessionWarningMetadata(record[StaleSessionWarningAction.CompactAndContinue])
		&& isStaleSessionWarningMetadata(record[StaleSessionWarningAction.SendAnyway])) {
		return record as Record<StaleSessionWarningAction, StaleSessionWarningMetadata>;
	}
	return undefined;
}

function getStaleSessionWarningResultMetadata(entry: vscode.ChatRequestTurn | vscode.ChatResponseTurn | undefined): StaleSessionWarningRequestMetadata | undefined {
	const metadata = (entry as { result?: { metadata?: { staleSessionWarning?: unknown } } } | undefined)?.result?.metadata?.staleSessionWarning;
	return isStaleSessionWarningRequestMetadata(metadata) ? metadata : undefined;
}

function getStaleSessionWarningActionResultMetadata(entry: vscode.ChatRequestTurn | vscode.ChatResponseTurn | undefined): StaleSessionWarningMetadata | undefined {
	const metadata = (entry as { result?: { metadata?: { staleSessionWarningAction?: unknown } } } | undefined)?.result?.metadata?.staleSessionWarningAction;
	return isStaleSessionWarningMetadata(metadata) ? metadata : undefined;
}

function isRequestTurnForStaleSessionWarning(entry: vscode.ChatRequestTurn | vscode.ChatResponseTurn, metadata: StaleSessionWarningRequestMetadata): boolean {
	return 'prompt' in entry && entry.prompt === metadata.originalPrompt;
}

function isStaleSessionWarningRequestMetadata(value: unknown): value is StaleSessionWarningRequestMetadata {
	return !!value
		&& typeof value === 'object'
		&& (value as StaleSessionWarningRequestMetadata).kind === 'staleSessionWarning'
		&& typeof (value as StaleSessionWarningRequestMetadata).originalPrompt === 'string'
		&& isStaleSessionProviderKind((value as StaleSessionWarningRequestMetadata).providerKind);
}

function isStaleSessionWarningMetadata(value: unknown): value is StaleSessionWarningMetadata {
	return !!value
		&& typeof value === 'object'
		&& (value as StaleSessionWarningMetadata).kind === 'staleSessionWarning'
		&& typeof (value as StaleSessionWarningMetadata).originalPrompt === 'string'
		&& isStaleSessionProviderKind((value as StaleSessionWarningMetadata).providerKind)
		&& isStaleSessionWarningAction((value as StaleSessionWarningMetadata).action);
}

function isStaleSessionProviderKind(value: unknown): value is StaleSessionProviderKind {
	return value === StaleSessionProviderKind.CopilotCLI || value === StaleSessionProviderKind.Claude || value === StaleSessionProviderKind.Local;
}

function isStaleSessionWarningAction(value: unknown): value is StaleSessionWarningAction {
	return value === StaleSessionWarningAction.StartNewSession || value === StaleSessionWarningAction.CompactAndContinue || value === StaleSessionWarningAction.SendAnyway;
}

function getSelectedAction(prompt: string): StaleSessionWarningAction | undefined {
	const selection = prompt.split(':')[0]?.trim().toLowerCase();
	switch (selection) {
		case l10n.t('Start New Session').toLowerCase():
			return StaleSessionWarningAction.StartNewSession;
		case l10n.t('Compact and Continue').toLowerCase():
			return StaleSessionWarningAction.CompactAndContinue;
		case l10n.t('Send Anyway').toLowerCase():
			return StaleSessionWarningAction.SendAnyway;
		default:
			return undefined;
	}
}

function extractTurnText(turn: vscode.ChatRequestTurn | vscode.ChatResponseTurn): string {
	if ('prompt' in turn && typeof turn.prompt === 'string') {
		return turn.prompt;
	}
	if ('response' in turn && Array.isArray(turn.response)) {
		return turn.response.map(extractResponsePartText).join('\n');
	}
	return '';
}

function extractResponsePartText(part: unknown): string {
	if (!part || typeof part !== 'object') {
		return '';
	}

	const value = (part as { value?: unknown }).value;
	if (typeof value === 'string') {
		return value;
	}
	if (value && typeof value === 'object' && 'value' in value && typeof (value as { value?: unknown }).value === 'string') {
		return (value as { value: string }).value;
	}

	const content = (part as { content?: unknown }).content;
	if (typeof content === 'string') {
		return content;
	}

	return '';
}
