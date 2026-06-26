import * as vscode from 'vscode';
import { toEmbeddingModelId } from './dialEmbeddingsService';
import { dialLog } from './logger';
import { type DialDeployment } from './types';

const DIAL_VENDOR = 'dial';

/** VS Code workspace settings Copilot reads for BYOK routing. */
export interface CopilotModelDefaults {
	readonly embeddingModel?: string;
	readonly utilityModel?: string;
	readonly utilitySmallModel?: string;
	readonly riskAssessmentModel?: string;
}

export function buildCopilotModelDefaults(
	chatModels: readonly DialDeployment[],
	embeddingModels: readonly DialDeployment[],
	overrides: Partial<CopilotModelDefaults> = {},
): CopilotModelDefaults {
	const chatId = overrides.utilityModel
		? deploymentIdFromVendorPath(overrides.utilityModel)
		: pickDefaultChatDeployment(chatModels);
	const smallChatId = overrides.utilitySmallModel
		? deploymentIdFromVendorPath(overrides.utilitySmallModel)
		: chatId;
	const embedId = overrides.embeddingModel
		? deploymentIdFromEmbeddingSetting(overrides.embeddingModel)
		: pickDefaultEmbeddingDeployment(embeddingModels);

	return {
		...(embedId !== undefined
			? { embeddingModel: toEmbeddingModelId(embedId) }
			: {}),
		...(chatId !== undefined ? { utilityModel: toVendorModelPath(chatId) } : {}),
		...(smallChatId !== undefined
			? { utilitySmallModel: toVendorModelPath(smallChatId) }
			: {}),
		...(smallChatId !== undefined
			? { riskAssessmentModel: toVendorModelPath(smallChatId) }
			: {}),
	};
}

export function toVendorModelPath(deploymentId: string): string {
	return `${DIAL_VENDOR}/${deploymentId}`;
}

function deploymentIdFromVendorPath(value: string): string | undefined {
	const prefix = `${DIAL_VENDOR}/`;
	return value.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}

function deploymentIdFromEmbeddingSetting(value: string): string | undefined {
	return value.startsWith('dial.') ? value.slice('dial.'.length) : undefined;
}

function pickDefaultChatDeployment(models: readonly DialDeployment[]): string | undefined {
	if (models.length === 0) {
		return undefined;
	}
	const withTools = models.find((m) => m.features?.tools_supported !== false);
	const chosen = withTools ?? models[0];
	return chosen?.id;
}

function pickDefaultEmbeddingDeployment(models: readonly DialDeployment[]): string | undefined {
	return models[0]?.id;
}

/** Write Copilot BYOK workspace settings for DIAL-backed utility and embedding flows. */
export async function applyCopilotModelDefaults(
	defaults: CopilotModelDefaults,
	scope: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
): Promise<void> {
	const config = vscode.workspace.getConfiguration('chat');
	const updates: Array<[string, string | undefined]> = [
		['embeddingModel', defaults.embeddingModel],
		['utilityModel', defaults.utilityModel],
		['utilitySmallModel', defaults.utilitySmallModel],
		['tools.riskAssessment.model', defaults.riskAssessmentModel],
	];

	for (const [key, value] of updates) {
		if (value === undefined) {
			continue;
		}
		await config.update(key, value, scope);
		dialLog.info(`Applied Copilot setting chat.${key}=${value}`);
	}
}
