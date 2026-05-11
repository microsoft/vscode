/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import type { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';

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
	readonly idleMs?: number;
	readonly tokenCount?: number;
	readonly thresholdHours?: number;
	readonly thresholdTokens?: number;
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
		l10n.t('This session was last active {0} and currently holds {1} of context. Sending another message now will likely miss the prompt cache. Consider starting a fresh session or compacting before continuing to save tokens.', idleTime, tokenCount),
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

export function createStaleSessionWarningRequestMetadata(warning: StaleSessionWarning, originalPrompt: string, sessionId: string | undefined): StaleSessionWarningRequestMetadata {
	return {
		kind: 'staleSessionWarning',
		providerKind: warning.providerKind,
		originalPrompt,
		sessionId,
		modelId: warning.modelId,
		idleMs: warning.idleMs,
		tokenCount: warning.tokenCount,
		thresholdHours: warning.thresholds.timeHours,
		thresholdTokens: warning.thresholds.tokens,
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

/**
 * Returns true when an earlier turn in this session already produced a stale
 * session warning action (Send Anyway / Compact / Start New Session). Once the
 * user has chosen one of those options for the current session we don't want
 * to keep re-prompting them on every subsequent message even if the idle/token
 * thresholds are still exceeded.
 */
export function hasUserAlreadyActedOnStaleSessionWarning(history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[]): boolean {
	for (const entry of history) {
		if (getStaleSessionWarningActionResultMetadata(entry)) {
			return true;
		}
	}
	return false;
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

/**
 * Returns the recorded token count for `(providerKind, sessionId)` if the
 * provider previously reported usage via `wrapStreamForStaleSessionUsageTracking`.
 * Mirrors the source used by the chat context-window widget, which is the
 * model's actual `stream.usage(...)` report (`promptTokens + completionTokens`).
 *
 * Returns undefined when no usage has been reported yet (e.g. on the first
 * message in a new session). Callers should treat that as "no warning" rather
 * than fall back to a character-based estimate, so the warning only fires when
 * we have an authoritative token count to compare against the threshold.
 */
export function getRecordedStaleSessionTokens(providerKind: StaleSessionProviderKind, sessionId: string | undefined): number | undefined {
	if (!sessionId) {
		return undefined;
	}
	return recordedStaleSessionTokens.get(makeRecordedKey(providerKind, sessionId));
}

/**
 * Records token usage for `(providerKind, sessionId)`. Subsequent calls to
 * `getRecordedStaleSessionTokens` will return `promptTokens + completionTokens`.
 */
export function recordStaleSessionTokens(providerKind: StaleSessionProviderKind, sessionId: string | undefined, usage: { readonly promptTokens?: number; readonly completionTokens?: number }): void {
	if (!sessionId) {
		return;
	}
	const total = (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
	if (total <= 0) {
		return;
	}
	recordedStaleSessionTokens.set(makeRecordedKey(providerKind, sessionId), total);
}

/**
 * Wraps a chat response stream so that any `usage(...)` reports are captured
 * for the stale-session warning. Method calls other than `usage` are forwarded
 * to the underlying stream unchanged via prototype-chain delegation.
 *
 * Implementation note: the underlying `vscode.ChatResponseStream` is frozen by
 * the extension host (see `extHostChatAgents2.ts`), so we cannot use a `Proxy`
 * (which would violate the non-configurable property invariant) and we cannot
 * mutate the stream itself. Instead we create a child object inheriting from
 * the stream and shadow `usage` on the child as an own property - a plain
 * assignment would walk the prototype chain and be rejected by the frozen
 * parent.
 */
export function wrapStreamForStaleSessionUsageTracking<T extends { usage(usage: { readonly promptTokens?: number; readonly completionTokens?: number }): void }>(
	stream: T,
	providerKind: StaleSessionProviderKind,
	sessionId: string | undefined,
): T {
	if (!sessionId) {
		return stream;
	}
	const trackingUsage: T['usage'] = ((usage) => {
		recordStaleSessionTokens(providerKind, sessionId, usage);
		return stream.usage(usage);
	}) as T['usage'];
	return Object.create(stream, {
		usage: {
			value: trackingUsage,
			writable: true,
			enumerable: true,
			configurable: true,
		},
	}) as T;
}

const recordedStaleSessionTokens = new Map<string, number>();
const pendingStaleSessionFollowUps = new Map<string, PendingStaleSessionFollowUp>();

interface PendingStaleSessionFollowUp {
	readonly action: StaleSessionWarningAction;
	readonly modelId: string | undefined;
	readonly idleMs: number;
	readonly tokenCount: number;
	readonly recordedAt: number;
}

function makeRecordedKey(providerKind: StaleSessionProviderKind, sessionId: string): string {
	return `${providerKind}::${sessionId}`;
}

export function getLastActivityFromChatSessionItem(item: vscode.ChatSessionItem | undefined): number | undefined {
	return getLastActivityFromTiming(item?.timing);
}

export interface StaleSessionTimingLike {
	readonly created?: number;
	readonly startTime?: number;
	readonly lastRequestStarted?: number;
	readonly lastRequestEnded?: number;
	readonly endTime?: number;
}

export function getLastActivityFromTiming(timing: StaleSessionTimingLike | undefined): number | undefined {
	if (!timing) {
		return undefined;
	}
	return timing.lastRequestEnded
		?? timing.endTime
		?? timing.lastRequestStarted
		?? timing.startTime
		?? timing.created;
}

export function isStaleSessionWarningBypass(request: vscode.ChatRequest): boolean {
	const action = getStaleSessionWarningConfirmation(request)?.action;
	return action === StaleSessionWarningAction.SendAnyway;
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
			thresholdHours: warning.thresholds.timeHours,
			thresholdTokens: warning.thresholds.tokens,
		}
	};
}

export function sendStaleSessionWarningShownTelemetry(telemetryService: Pick<ITelemetryService, 'sendMSFTTelemetryEvent'>, warning: StaleSessionWarning): void {
	const telemetry = getStaleSessionWarningTelemetry(warning);
	/* __GDPR__
		"staleSessionWarning.shown" : {
			"owner": "gcianci",
			"comment": "Tracks when users are warned before sending a request in an old session with a large context.",
			"providerKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat session provider that showed the warning." },
			"modelId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID selected for the request." },
			"idleHours": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The approximate number of hours since the session was last active." },
			"tokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The token count reported for the session context." },
			"thresholdHours": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The idle time threshold in hours used to trigger the warning." },
			"thresholdTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The token count threshold used to trigger the warning." }
		}
	*/
	telemetryService.sendMSFTTelemetryEvent('staleSessionWarning.shown', telemetry.properties, telemetry.measurements);
}

export function recordStaleSessionWarningActionTelemetry(telemetryService: Pick<ITelemetryService, 'sendMSFTTelemetryEvent'>, metadata: StaleSessionWarningMetadata): void {
	const telemetry = getStaleSessionWarningActionTelemetry(metadata);
	/* __GDPR__
		"staleSessionWarning.action" : {
			"owner": "gcianci",
			"comment": "Tracks which action users take when the stale session warning is shown.",
			"providerKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat session provider that showed the warning." },
			"action": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The action selected by the user." },
			"modelId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID selected for the request." },
			"idleHours": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The approximate number of hours since the session was last active when the warning was shown." },
			"tokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The token count reported for the session context when the warning was shown." },
			"thresholdHours": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The idle time threshold in hours used to trigger the warning." },
			"thresholdTokens": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The token count threshold used to trigger the warning." }
		}
	*/
	telemetryService.sendMSFTTelemetryEvent('staleSessionWarning.action', telemetry.properties, telemetry.measurements);
	recordStaleSessionWarningFollowUp(metadata);
}

export function sendStaleSessionWarningFollowUpTelemetry(
	telemetryService: Pick<ITelemetryService, 'sendMSFTTelemetryEvent'>,
	providerKind: StaleSessionProviderKind,
	sessionId: string | undefined,
	modelId: string | undefined,
): void {
	const telemetry = consumeStaleSessionWarningFollowUpTelemetry(providerKind, sessionId, modelId);
	if (!telemetry) {
		return;
	}
	/* __GDPR__
		"staleSessionWarning.followUpRequest" : {
			"owner": "gcianci",
			"comment": "Tracks whether users send another request in the same session after acting on the stale session warning.",
			"providerKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat session provider that showed the previous warning." },
			"previousAction": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The action selected on the previous stale session warning." },
			"modelId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID selected for the request." },
			"minutesSinceAction": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The approximate number of minutes since the user selected the previous warning action." },
			"idleHoursAtPreviousWarning": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The approximate number of hours since the session was last active when the previous warning was shown." },
			"tokenCountAtPreviousWarning": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The token count reported for the session context when the previous warning was shown." }
		}
	*/
	telemetryService.sendMSFTTelemetryEvent('staleSessionWarning.followUpRequest', telemetry.properties, telemetry.measurements);
}

function getStaleSessionWarningActionTelemetry(metadata: StaleSessionWarningMetadata): { readonly properties: Record<string, string>; readonly measurements: Record<string, number> } {
	return {
		properties: {
			providerKind: metadata.providerKind,
			action: metadata.action,
			modelId: metadata.modelId ?? 'unknown',
		},
		measurements: getStaleSessionWarningMetadataMeasurements(metadata),
	};
}

function recordStaleSessionWarningFollowUp(metadata: StaleSessionWarningMetadata): void {
	if (!metadata.sessionId || typeof metadata.idleMs !== 'number' || typeof metadata.tokenCount !== 'number') {
		return;
	}
	pendingStaleSessionFollowUps.set(makeRecordedKey(metadata.providerKind, metadata.sessionId), {
		action: metadata.action,
		modelId: metadata.modelId,
		idleMs: metadata.idleMs,
		tokenCount: metadata.tokenCount,
		recordedAt: Date.now(),
	});
}

function consumeStaleSessionWarningFollowUpTelemetry(providerKind: StaleSessionProviderKind, sessionId: string | undefined, modelId: string | undefined): { readonly properties: Record<string, string>; readonly measurements: Record<string, number> } | undefined {
	if (!sessionId) {
		return undefined;
	}
	const key = makeRecordedKey(providerKind, sessionId);
	const pendingFollowUp = pendingStaleSessionFollowUps.get(key);
	if (!pendingFollowUp) {
		return undefined;
	}
	pendingStaleSessionFollowUps.delete(key);
	return {
		properties: {
			providerKind,
			previousAction: pendingFollowUp.action,
			modelId: pendingFollowUp.modelId ?? modelId ?? 'unknown',
		},
		measurements: {
			minutesSinceAction: (Date.now() - pendingFollowUp.recordedAt) / MS_PER_MINUTE,
			idleHoursAtPreviousWarning: pendingFollowUp.idleMs / MS_PER_HOUR,
			tokenCountAtPreviousWarning: pendingFollowUp.tokenCount,
		},
	};
}

function getStaleSessionWarningMetadataMeasurements(metadata: StaleSessionWarningMetadata): Record<string, number> {
	const measurements: Record<string, number> = {};
	if (typeof metadata.idleMs === 'number') {
		measurements.idleHours = metadata.idleMs / MS_PER_HOUR;
	}
	if (typeof metadata.tokenCount === 'number') {
		measurements.tokenCount = metadata.tokenCount;
	}
	if (typeof metadata.thresholdHours === 'number') {
		measurements.thresholdHours = metadata.thresholdHours;
	}
	if (typeof metadata.thresholdTokens === 'number') {
		measurements.thresholdTokens = metadata.thresholdTokens;
	}
	return measurements;
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
