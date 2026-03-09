/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * String keys matching the keys in resources/strings.json.
 */
export type PersonalityStringKey =
	| 'codeGraphUnavailable'
	| 'mcpServerTimeout'
	| 'agentTaskFailedAfterRetries'
	| 'allAgentsIdle'
	| 'checkpointRestored'
	| 'securityScanClean'
	| 'noProjectOpen'
	| 'reviewAgentRejectsCode'
	| 'backgroundAgentCompleted'
	| 'promptCacheHitRate'
	| 'fridayAfternoon'
	| 'allAgentAuthored';

let loadedStrings: Record<string, string> | undefined;

/**
 * Loads personality strings from resources/strings.json.
 * Caches after the first successful load.
 */
export async function loadPersonalityStrings(extensionUri: vscode.Uri): Promise<Record<string, string>> {
	if (loadedStrings) {
		return loadedStrings;
	}

	try {
		const stringsUri = vscode.Uri.joinPath(extensionUri, 'resources', 'strings.json');
		const content = await vscode.workspace.fs.readFile(stringsUri);
		loadedStrings = JSON.parse(Buffer.from(content).toString('utf-8'));
		return loadedStrings!;
	} catch {
		return {};
	}
}

/**
 * Gets a personality string by key, with optional placeholder substitution.
 * Placeholders use the format {0}, {1}, etc.
 * Returns the key itself as fallback if not found.
 */
export async function getPersonalityString(
	extensionUri: vscode.Uri,
	key: PersonalityStringKey,
	...args: (string | number)[]
): Promise<string> {
	const strings = await loadPersonalityStrings(extensionUri);
	let value = strings[key] ?? key;

	for (let i = 0; i < args.length; i++) {
		const placeholderRegex = new RegExp(`\\{${i}\\}`, 'g');
		value = value.replace(placeholderRegex, String(args[i]));
	}

	return value;
}
