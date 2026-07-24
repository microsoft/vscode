/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';

/**
 * Structured model info for building display details.
 * Lookups store this so consumers can format with per-turn credits at render time.
 */
export interface ModelDetailsInfo {
	readonly name: string;
	readonly multiplier: number | undefined;
}

/**
 * Formats model details for display in the chat response footer.
 * Uses credits when available, otherwise falls back to the multiplier suffix.
 */
export function formatModelDetails(modelName: string, multiplier: number | undefined, creditsUsed: number | undefined): string {
	if (creditsUsed !== undefined) {
		return formatModelDetailsWithCredits(modelName, creditsUsed);
	}
	return formatModelDetailsWithMultiplier(modelName, multiplier);
}

/**
 * Formats model details with credit usage for display.
 * Returns a localized string like "Model Name • 5 credits" or "Model Name • 1 credit".
 */
export function formatModelDetailsWithCredits(modelName: string, creditsUsed: number): string {
	const formatted = creditsUsed % 1 === 0 ? creditsUsed.toString() : creditsUsed.toFixed(1);
	return creditsUsed === 1
		? l10n.t('{0} \u2022 {1} credit', modelName, formatted)
		: l10n.t('{0} \u2022 {1} credits', modelName, formatted);
}

/**
 * Formats model details with a multiplier suffix for display.
 * Returns "Model Name • 2x" when multiplier is defined, or just "Model Name" otherwise.
 */
export function formatModelDetailsWithMultiplier(modelName: string, multiplier: number | undefined): string {
	return multiplier !== undefined ? l10n.t('{0} \u2022 {1}x', modelName, multiplier) : modelName;
}

/**
 * Formats model details for auto mode when the model name should be hidden.
 * Shows "Auto • N credits" or "Auto • Nx" instead of the actual model name.
 */
export function formatAutoModeDetails(creditsUsed: number | undefined, multiplier: number | undefined): string {
	return formatModelDetails(l10n.t('Auto'), multiplier, creditsUsed);
}
