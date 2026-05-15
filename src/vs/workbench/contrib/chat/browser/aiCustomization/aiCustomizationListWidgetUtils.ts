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
 * Extracts an extension ID from a file path if the path is inside either
 * an extension install directory (e.g. `~/.vscode/extensions/<id>-<version>/...`)
 * or an extension's globalStorage directory
 * (e.g. `~/<userdata>/User/globalStorage/<id>/...`). The latter is used by
 * extensions like Copilot Chat that materialize prompt files under their
 * own globalStorage and register them via the prompt-file provider API.
 *
 * Returns the extension ID (e.g. `github.copilot-chat`) or `undefined`
 * if the path is not inside an extension directory.
 */
export function extractExtensionIdFromPath(uriPath: string): string | undefined {
	const segments = uriPath.split('/');

	// `~/<userdata>/User/globalStorage/<extensionId>/...`
	// Require at least one segment after `<extensionId>` so we only match
	// files INSIDE an extension's storage, not the storage folder itself.
	const globalStorageIdx = segments.lastIndexOf('globalStorage');
	if (
		globalStorageIdx > 0
		&& segments[globalStorageIdx - 1] === 'User'
		&& globalStorageIdx + 2 < segments.length
	) {
		const candidate = segments[globalStorageIdx + 1];
		// Extension IDs are `<publisher>.<name>` (alphanumeric/hyphen each side).
		if (/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i.test(candidate)) {
			return candidate;
		}
	}

	// `~/.vscode/extensions/<extensionId>-<version>/...`
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
