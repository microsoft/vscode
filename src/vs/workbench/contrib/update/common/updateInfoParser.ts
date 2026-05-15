/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey, Mutable } from '../../../../base/common/types.js';

const MAX_FEATURES = 5;

export type UpdateInfoButtonStyle = 'primary' | 'secondary';

export interface IUpdateInfoButton {
	readonly label: string;
	readonly commandId: string;
	readonly args?: unknown[];
	readonly style?: UpdateInfoButtonStyle;
}

export interface IUpdateInfoFeature {
	/**
	 * Optional Codicon icon identifier (e.g. `$(sparkle)` or `$(lightbulb)`) displayed
	 * alongside the feature title.
	 */
	readonly icon?: string;
	/** Short title for the feature highlight. */
	readonly title: string;
	/** One-line description of the feature. */
	readonly description: string;
}

export interface IParsedUpdateInfoInput {
	/** Markdown body rendered in the update-info widget. */
	readonly markdown: string;
	/** Optional action buttons shown below the markdown content. */
	readonly buttons?: IUpdateInfoButton[];
	/**
	 * Optional URL for a banner/hero image shown at the top of the widget.
	 * Must be an `https://` URL; non-HTTPS URLs are ignored.
	 */
	readonly bannerImageUrl?: string;
	/** Optional short badge label (e.g. `"New"`) displayed on the widget. */
	readonly badge?: string;
	/** Optional heading title rendered above the markdown body. */
	readonly title?: string;
	/**
	 * Optional list of feature highlights. At most {@link MAX_FEATURES} entries
	 * (currently 5) are displayed; any additional entries are silently dropped.
	 */
	readonly features?: IUpdateInfoFeature[];
}

/**
 * Parses optional metadata from update info input.
 *
 * Supported formats:
 *
 * **JSON envelope** - a single JSON object with `markdown` and optional fields:
 * ```json
 * {
 *   "markdown": "$(info) **Feature**<br>Description...",
 *   "title": "What's New",
 *   "badge": "New",
 *   "bannerImageUrl": "https://example.com/banner.png",
 *   "buttons": [
 *     { "label": "Release Notes", "commandId": "update.showCurrentReleaseNotes", "style": "secondary" },
 *     { "label": "Open Sessions", "commandId": "workbench.action.chat.open", "style": "primary" }
 *   ],
 *   "features": [
 *     { "icon": "$(sparkle)", "title": "Feature", "description": "Short description" }
 *   ]
 * }
 * ```
 *
 * **Block frontmatter** - YAML-style `---` delimiters wrapping a JSON metadata block:
 * ```
 * ---
 * { "buttons": [...], "features": [...] }
 * ---
 * $(info) **Feature**<br>Description...
 * ```
 *
 * **Inline frontmatter** - metadata on a single `---` line:
 * ```
 * --- { "buttons": [...] } ---
 * $(info) **Feature**<br>Description...
 * ```
 *
 * At most 5 feature entries are retained; any additional ones are silently dropped.
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
		const value = JSON.parse(trimmed) as { markdown?: string; buttons?: unknown; bannerImageUrl?: unknown; badge?: unknown; title?: unknown; features?: unknown };
		if (typeof value.markdown !== 'string') {
			return undefined;
		}

		return buildParsedInput(value.markdown, value);
	} catch {
		return undefined;
	}
}

function buildParsedInput(markdown: string, meta: { buttons?: unknown; bannerImageUrl?: unknown; badge?: unknown; title?: unknown; features?: unknown }): IParsedUpdateInfoInput {
	const result: Mutable<IParsedUpdateInfoInput> = {
		markdown,
		buttons: parseUpdateInfoButtons(meta.buttons),
	};
	if (typeof meta.bannerImageUrl === 'string') { result.bannerImageUrl = meta.bannerImageUrl; }
	if (typeof meta.badge === 'string') { result.badge = meta.badge; }
	if (typeof meta.title === 'string') { result.title = meta.title; }
	const features = parseUpdateInfoFeatures(meta.features);
	if (features) { result.features = features; }
	return result;
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
		const meta = JSON.parse(jsonText) as { buttons?: unknown; bannerImageUrl?: unknown; badge?: unknown; title?: unknown; features?: unknown };
		return buildParsedInput(markdown, meta);
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

/**
 * Parses an array of feature-highlight objects from raw update-info metadata.
 * Only the first {@link MAX_FEATURES} valid entries are returned; the rest are
 * discarded. Each entry must have at minimum a `title` and `description` string.
 * The optional `icon` field accepts a Codicon identifier (e.g. `$(sparkle)`).
 */
function parseUpdateInfoFeatures(features: unknown): IUpdateInfoFeature[] | undefined {
	if (!Array.isArray(features)) {
		return undefined;
	}

	const parsed: IUpdateInfoFeature[] = [];
	for (const feature of features) {
		if (typeof feature !== 'object' || feature === null) {
			continue;
		}
		const candidate = feature as { title?: unknown; description?: unknown; icon?: unknown };
		if (typeof candidate.title !== 'string' || typeof candidate.description !== 'string') {
			continue;
		}
		const icon = typeof candidate.icon === 'string' ? candidate.icon : undefined;
		parsed.push({ icon, title: candidate.title, description: candidate.description });
		if (parsed.length >= MAX_FEATURES) {
			break;
		}
	}

	return parsed.length ? parsed : undefined;
}
