import type * as vscode from 'vscode';
import { isRecord, type JsonObject } from './runtimeGuards';
import { type DialChatRequest, type DialDeployment, type Nullable } from './types';

/** Values that mean "do not send reasoning_effort" (DIAL defaults, UI off states). */
const NO_REASONING_EFFORT_SENTINELS = new Set(['none', 'off', 'false', 'disabled', '']);

export interface ReasoningEffortIdeSnapshot {
	readonly modelConfigurationReasoningEffort: unknown;
	readonly modelOptionsReasoningEffort: unknown;
	readonly modelOptionsEnableThinking: unknown;
}

export interface ReasoningEffortDiagnostic {
	readonly deploymentSupports: boolean;
	readonly ide: ReasoningEffortIdeSnapshot;
	readonly deploymentDefault: string | null;
	readonly requested: string | null;
	readonly sent: string | null;
	readonly source: 'modelConfiguration' | 'modelOptions' | 'deployment-default' | null;
	readonly action:
		| 'sent'
		| 'omitted-no-request'
		| 'omitted-sentinel'
		| 'omitted-enable-thinking-false'
		| 'omitted-unsupported-deployment'
		| 'dropped-unsupported-deployment'
		| 'dropped-not-in-allowed-list';
}

/** Supported effort values from DIAL listing `features.reasoning_efforts`. */
export function getDeploymentReasoningEfforts(deployment: Nullable<DialDeployment>): readonly string[] {
	return deployment?.features?.reasoning_efforts ?? [];
}

/** Whether DIAL listing advertises `reasoning_effort` for this deployment. */
export function deploymentSupportsReasoningEffort(deployment: Nullable<DialDeployment>): boolean {
	return getDeploymentReasoningEfforts(deployment).length > 0;
}

export function isAllowedReasoningEffort(
	effort: string,
	deployment: Nullable<DialDeployment>,
): boolean {
	const lower = effort.toLowerCase();
	return getDeploymentReasoningEfforts(deployment).some((allowed) => allowed.toLowerCase() === lower);
}

export function isNoReasoningEffortSentinel(value: string): boolean {
	return NO_REASONING_EFFORT_SENTINELS.has(value.trim().toLowerCase());
}

export function normalizeReasoningEffort(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0 || isNoReasoningEffortSentinel(trimmed)) {
		return undefined;
	}
	return trimmed.toLowerCase();
}

type ProviderChatOptions = vscode.ProvideLanguageModelChatResponseOptions & {
	readonly modelConfiguration?: { readonly [key: string]: unknown };
};

export function snapshotReasoningIdeInputs(
	options: vscode.ProvideLanguageModelChatResponseOptions,
): ReasoningEffortIdeSnapshot {
	const extended = options as ProviderChatOptions;
	return {
		modelConfigurationReasoningEffort: extended.modelConfiguration?.reasoningEffort ?? null,
		modelOptionsReasoningEffort: options.modelOptions?.reasoningEffort ?? null,
		modelOptionsEnableThinking: options.modelOptions?.enableThinking ?? null,
	};
}

function readReasoningEffortSource(
	options: vscode.ProvideLanguageModelChatResponseOptions,
): { effort: string | undefined; source: ReasoningEffortDiagnostic['source'] } {
	const extended = options as ProviderChatOptions;
	const fromConfig = normalizeReasoningEffort(extended.modelConfiguration?.reasoningEffort);
	if (fromConfig !== undefined) {
		return { effort: fromConfig, source: 'modelConfiguration' };
	}
	const fromOptions = normalizeReasoningEffort(options.modelOptions?.reasoningEffort);
	if (fromOptions !== undefined) {
		return { effort: fromOptions, source: 'modelOptions' };
	}
	return { effort: undefined, source: null };
}

function readDefaultString(defaults: Nullable<JsonObject>, key: string): string | undefined {
	if (!isRecord(defaults)) {
		return undefined;
	}
	const value = defaults[key];
	return typeof value === 'string' ? value : undefined;
}

function defaultReasoningEffort(deployment: Nullable<DialDeployment>): string | undefined {
	return normalizeReasoningEffort(readDefaultString(deployment?.defaults, 'reasoning_effort'));
}

function readRawDeploymentDefault(deployment: Nullable<DialDeployment>): string | null {
	const raw = readDefaultString(deployment?.defaults, 'reasoning_effort');
	return raw ?? null;
}

/**
 * Apply `reasoning_effort` when the deployment feature flag is set; omit otherwise.
 * Returns a diagnostic snapshot for the DIAL output channel.
 */
function isEnableThinkingExplicitlyFalse(
	options: vscode.ProvideLanguageModelChatResponseOptions,
): boolean {
	return options.modelOptions?.enableThinking === false;
}

function omitReasoningEffort(
	request: DialChatRequest,
	diagnostic: ReasoningEffortDiagnostic,
): { request: DialChatRequest; diagnostic: ReasoningEffortDiagnostic } {
	if (request.reasoning_effort !== undefined) {
		const { reasoning_effort: _omit, ...rest } = request;
		return { request: rest, diagnostic };
	}
	return { request, diagnostic };
}

export function applyReasoningEffort(
	request: DialChatRequest,
	deployment: Nullable<DialDeployment>,
	options: vscode.ProvideLanguageModelChatResponseOptions,
): { request: DialChatRequest; diagnostic: ReasoningEffortDiagnostic } {
	const ide = snapshotReasoningIdeInputs(options);
	const deploymentDefaultRaw = readRawDeploymentDefault(deployment);
	const supported = deploymentSupportsReasoningEffort(deployment);
	const { effort: requested, source } = readReasoningEffortSource(options);
	const fromDefault = defaultReasoningEffort(deployment);
	const effective = requested ?? fromDefault;
	const effectiveSource = requested !== undefined ? source : fromDefault !== undefined ? 'deployment-default' : null;

	const baseDiagnostic = {
		deploymentSupports: supported,
		ide,
		deploymentDefault: deploymentDefaultRaw,
		requested: requested ?? null,
	};

	// Copilot Agent toggles thinking per LLM round via modelOptions.enableThinking.
	// When false, do not send reasoning_effort even if modelConfiguration still carries a level.
	if (isEnableThinkingExplicitlyFalse(options)) {
		return omitReasoningEffort(request, {
			...baseDiagnostic,
			sent: null,
			source: effectiveSource,
			action: 'omitted-enable-thinking-false',
		});
	}

	if (!supported) {
		const dropped = effective ?? null;
		return omitReasoningEffort(request, {
			...baseDiagnostic,
			sent: null,
			source: effectiveSource,
			action: dropped ? 'dropped-unsupported-deployment' : 'omitted-unsupported-deployment',
		});
	}

	if (effective === undefined) {
		return omitReasoningEffort(request, {
			...baseDiagnostic,
			sent: null,
			source: null,
			action:
				deploymentDefaultRaw !== null && isNoReasoningEffortSentinel(deploymentDefaultRaw)
					? 'omitted-sentinel'
					: 'omitted-no-request',
		});
	}

	if (!isAllowedReasoningEffort(effective, deployment)) {
		return omitReasoningEffort(request, {
			...baseDiagnostic,
			requested: effective,
			sent: null,
			source: effectiveSource,
			action: 'dropped-not-in-allowed-list',
		});
	}

	return {
		request: { ...request, reasoning_effort: effective },
		diagnostic: {
			...baseDiagnostic,
			requested: effective,
			sent: effective,
			source: effectiveSource,
			action: 'sent',
		},
	};
}

/** Strip `reasoning_effort` when the deployment does not advertise support (safety net). */
export function stripReasoningEffortWhenUnsupported(
	request: DialChatRequest,
	deployment: Nullable<DialDeployment>,
): DialChatRequest {
	if (deploymentSupportsReasoningEffort(deployment) || request.reasoning_effort === undefined) {
		return request;
	}
	const { reasoning_effort: _omit, ...rest } = request;
	return rest;
}
