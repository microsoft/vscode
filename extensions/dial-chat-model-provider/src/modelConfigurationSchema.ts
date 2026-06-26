import { isRecord, type JsonObject } from './runtimeGuards';
import {
	deploymentSupportsReasoningEffort,
	getDeploymentReasoningEfforts,
	isNoReasoningEffortSentinel,
	normalizeReasoningEffort,
} from './reasoningEffort';
import { type DialDeployment, type Nullable } from './types';

/** Matches VS Code proposed `LanguageModelConfigurationSchema` (not yet in @types/vscode 1.110). */
export type DialLanguageModelConfigurationSchema = {
	readonly properties?: {
		readonly [key: string]: Record<string, unknown> & {
			readonly enumItemLabels?: readonly string[];
			readonly enumDescriptions?: readonly string[];
			readonly group?: string;
		};
	};
};

function readDefaultString(defaults: Nullable<JsonObject>, key: string): string | undefined {
	if (!isRecord(defaults)) {
		return undefined;
	}
	const value = defaults[key];
	return typeof value === 'string' ? value : undefined;
}

/** Supported effort values from DIAL listing `features.reasoning_efforts`. */
export function resolveReasoningEffortLevels(deployment: DialDeployment): readonly string[] {
	return getDeploymentReasoningEfforts(deployment);
}

function effortDescription(level: string): string {
	switch (level) {
		case 'none':
			return 'No reasoning_effort sent to DIAL';
		case 'minimal':
			return 'Minimal reasoning for fastest responses';
		case 'low':
			return 'Faster responses with less reasoning';
		case 'medium':
			return 'Balanced reasoning and speed';
		case 'high':
			return 'Greater reasoning depth but slower';
		case 'xhigh':
			return 'Highest reasoning depth but slowest';
		default:
			return level;
	}
}

function pickSchemaDefault(deployment: DialDeployment, levels: readonly string[]): string {
	const rawDefault = readDefaultString(deployment.defaults, 'reasoning_effort');
	if (rawDefault !== undefined) {
		if (isNoReasoningEffortSentinel(rawDefault) && levels.includes('none')) {
			return 'none';
		}
		const normalized = normalizeReasoningEffort(rawDefault);
		if (normalized !== undefined && levels.includes(normalized)) {
			return normalized;
		}
		if (levels.includes(rawDefault)) {
			return rawDefault;
		}
	}
	if (levels.includes('medium')) {
		return 'medium';
	}
	return levels[0] ?? 'medium';
}

function buildReasoningEffortProperty(
	deployment: DialDeployment,
	levels: readonly string[],
): NonNullable<DialLanguageModelConfigurationSchema['properties']>[string] {
	return {
		type: 'string',
		title: 'Thinking Effort',
		enum: [...levels],
		enumItemLabels: levels.map((level) => level.charAt(0).toUpperCase() + level.slice(1)),
		enumDescriptions: levels.map((level) => effortDescription(level)),
		default: pickSchemaDefault(deployment, levels),
		group: 'navigation',
	};
}

/**
 * Build {@link vscode.LanguageModelChatInformation.configurationSchema} from DIAL deployment metadata.
 * When `features.reasoning_efforts` is non-empty, exposes a reasoning effort picker for VS Code / Copilot.
 */
export function buildModelConfigurationSchema(
	deployment: DialDeployment,
): DialLanguageModelConfigurationSchema | undefined {
	if (!deploymentSupportsReasoningEffort(deployment)) {
		return undefined;
	}
	const levels = resolveReasoningEffortLevels(deployment);
	if (levels.length === 0) {
		return undefined;
	}
	return {
		properties: {
			reasoningEffort: buildReasoningEffortProperty(deployment, levels),
		},
	};
}
