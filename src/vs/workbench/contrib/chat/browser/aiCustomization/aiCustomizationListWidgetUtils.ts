/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

/**
 * Truncates a description string to the first line.
 * The UI applies CSS text-overflow ellipsis for width overflow.
 */
export function truncateToFirstLine(text: string): string {
	const newlineIndex = text.search(/[\r\n]/);
	if (newlineIndex !== -1) {
		return text.substring(0, newlineIndex);
	}
	return text;
}

/**
 * Returns the secondary text shown for a customization item.
 */
export function getCustomizationSecondaryText(description: string | undefined, filename: string, promptType: PromptsType): string {
	if (!description) {
		return filename;
	}

	return promptType === PromptsType.hook ? description : truncateToFirstLine(description);
}

/**
 * Extracts an extension ID from a file path if the path is inside an
 * extension install directory (e.g. `~/.vscode/extensions/<id>-<version>/...`).
 *
 * Returns the extension ID (e.g. `github.copilot-chat`) or `undefined`
 * if the path is not inside an extension directory.
 */
export function extractExtensionIdFromPath(uriPath: string): string | undefined {
	const segments = uriPath.split('/');
	const extensionsIdx = segments.lastIndexOf('extensions');
	if (extensionsIdx < 0 || extensionsIdx + 1 >= segments.length) {
		return undefined;
	}
	const folderName = segments[extensionsIdx + 1];
	// Strip version suffix: the version starts with digits after the last hyphen
	// e.g. "github.copilot-chat-0.43.2026040602" → "github.copilot-chat"
	const versionMatch = folderName.match(/^(.+)-\d+\./);
	return versionMatch ? versionMatch[1] : undefined;
}
