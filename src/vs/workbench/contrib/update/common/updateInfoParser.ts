/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';

export type UpdateInfoButtonStyle = 'primary' | 'secondary';

export interface IUpdateInfoButton {
	readonly label: string;
	readonly commandId: string;
	readonly args?: unknown[];
	readonly style?: UpdateInfoButtonStyle;
}

export interface IParsedUpdateInfoInput {
	readonly markdown: string;
	readonly buttons?: IUpdateInfoButton[];
}

/**
 * Parses optional metadata from update info input.
 *
 * Supported formats:
 *
 * **JSON envelope** - a single JSON object with `markdown` and optional `buttons`:
 * ```json
 * {
 *   "markdown": "$(info) **Feature**<br>Description...",
 *   "buttons": [
 *     { "label": "Release Notes", "commandId": "update.showCurrentReleaseNotes", "style": "secondary" },
 *     { "label": "Open Sessions", "commandId": "workbench.action.chat.open", "style": "primary" }
 *   ]
 * }
 * ```
 *
 * **Block frontmatter** - YAML-style `---` delimiters wrapping a JSON metadata block:
 * ```
 * ---
 * { "buttons": [...] }
 * ---
 * $(info) **Feature**<br>Description...
 * ```
 *
 * **Inline frontmatter** - metadata on a single `---` line:
 * ```
 * --- { "buttons": [...] } ---
 * $(info) **Feature**<br>Description...
 * ```
 */
export function parseUpdateInfoInput(text: string): IParsedUpdateInfoInput {
	const normalized = text.replace(/^\uFEFF/, '');
	return tryParseUpdateInfoEnvelope(normalized) ?? parseUpdateInfoFrontmatter(normalized);
}

function tryParseUpdateInfoEnvelope(text: string): IParsedUpdateInfoInput | undefined {
	const trimmed = text.trim();
	if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
		return undefined;
	}

	try {
		const value = JSON.parse(trimmed) as { markdown?: string; buttons?: unknown };
		if (typeof value.markdown !== 'string') {
			return undefined;
		}

		return {
			markdown: value.markdown,
			buttons: parseUpdateInfoButtons(value.buttons),
		};
	} catch {
		return undefined;
	}
}

function parseUpdateInfoFrontmatter(text: string): IParsedUpdateInfoInput {
	const blockMatch = text.match(/^---[ \t]*\r?\n(?<json>[\s\S]*?)\r?\n---[ \t]*(?:\r?\n(?<body>[\s\S]*))?$/);
	if (blockMatch?.groups) {
		return parseUpdateInfoFrontmatterMatch(text, blockMatch.groups['json'], blockMatch.groups['body'] ?? '');
	}

	const inlineMatch = text.match(/^---[ \t]*(?<json>\{.*\})[ \t]*---[ \t]*(?<body>[\s\S]*)$/);
	if (inlineMatch?.groups) {
		return parseUpdateInfoFrontmatterMatch(text, inlineMatch.groups['json'], inlineMatch.groups['body']);
	}

	return { markdown: text };
}

function parseUpdateInfoFrontmatterMatch(text: string, jsonText: string, markdown: string): IParsedUpdateInfoInput {
	try {
		const meta = JSON.parse(jsonText) as { buttons?: unknown };
		return {
			markdown,
			buttons: parseUpdateInfoButtons(meta.buttons),
		};
	} catch {
		return { markdown: text };
	}
}

function parseUpdateInfoButtons(buttons: unknown): IUpdateInfoButton[] | undefined {
	if (!Array.isArray(buttons)) {
		return undefined;
	}

	const parsedButtons: IUpdateInfoButton[] = [];
	for (const button of buttons) {
		if (typeof button !== 'object' || button === null) {
			continue;
		}

		if (!hasKey(button, { label: true, commandId: true }) || typeof button.label !== 'string' || typeof button.commandId !== 'string') {
			continue;
		}

		const style = hasKey(button, { style: true }) && (button.style === 'primary' || button.style === 'secondary') ? button.style : undefined;
		const args = hasKey(button, { args: true }) && Array.isArray(button.args) ? button.args : undefined;
		parsedButtons.push({
			label: button.label,
			commandId: button.commandId,
			args,
			style,
		});
	}

	return parsedButtons.length ? parsedButtons : undefined;
}
