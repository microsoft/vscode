/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';

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
