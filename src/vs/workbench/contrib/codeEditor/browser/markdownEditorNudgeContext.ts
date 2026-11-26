/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { EditorMatches, isUnconfiguredUniversalOptionalEditorMatch } from '../../../services/editor/common/editorResolverService.js';

const BUILTIN_MARKDOWN_EDITOR_IDS = new Set([DEFAULT_EDITOR_ASSOCIATION.id, 'vscode.markdown.editor', 'vscode.markdown.preview.editor']);

function isNonEmptyArray(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0;
}

/** A `.md` file edited within this time counts as recent Markdown writing. */
export const RECENT_MARKDOWN_EDIT_MS = 7 * 24 * 60 * 60 * 1000;

/** Who reaches a Markdown Editor nudge, to split experiment results by kind of Markdown user. */
export interface IMarkdownEditorNudgeContext {
	readonly nudge: 'textEditor' | 'preview';
	readonly previewExtensionCount: number;
	readonly otherMarkdownEditorCount: number;
	readonly defaultBefore: 'text' | 'markdownPreview' | 'other';
	readonly editedMarkdownRecently: boolean;
	readonly untitledMarkdownEditorUsed: boolean;
}

export type MarkdownEditorNudgeContextClassification = {
	owner: 'hediet';
	comment: 'Sent once per profile when a Markdown Editor nudge would show (in every experiment arm), to compare how different kinds of Markdown users respond to the nudges.';
	nudge: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The situation that reached the nudge: a Markdown file in the text editor, or a Markdown preview.' };
	previewExtensionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of enabled non-built-in extensions that extend the Markdown preview (markdown-it plugins, preview scripts or styles).' };
	otherMarkdownEditorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of editors other than the built-in ones that can open Markdown files.' };
	defaultBefore: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The default editor for Markdown files: text, markdownPreview, or other.' };
	editedMarkdownRecently: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a Markdown file was edited in the last seven days.' };
	untitledMarkdownEditorUsed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the Markdown Editor was last chosen for an untitled file from the empty editor hint.' };
};

export function countPreviewExtensions(extensions: readonly IExtensionDescription[]): number {
	// Same rules as `MarkdownContributions.fromExtension` in the Markdown extension, so inactive contributions do not count.
	return extensions.filter(extension => {
		// The Markdown contribution points are not part of the typed contributions.
		const contributes = extension.contributes as Record<string, unknown> | undefined;
		return !extension.isBuiltin && !!contributes && (
			!!contributes['markdown.markdownItPlugins']
			|| isNonEmptyArray(contributes['markdown.previewScripts'])
			|| isNonEmptyArray(contributes['markdown.previewStyles'])
		);
	}).length;
}

/** Editors registered for a Markdown file that are not built in. Unconfigured editors for any file (`*`) are not counted. */
export function countOtherMarkdownEditors(matches: EditorMatches): number {
	return new Set(matches.matches
		.filter(match => !isUnconfiguredUniversalOptionalEditorMatch(match) && !BUILTIN_MARKDOWN_EDITOR_IDS.has(match.editor.id))
		.map(match => match.editor.id)).size;
}

export function defaultMarkdownEditorKind(matches: EditorMatches): IMarkdownEditorNudgeContext['defaultBefore'] {
	switch (matches.defaultRule.editor.id) {
		case DEFAULT_EDITOR_ASSOCIATION.id: return 'text';
		case 'vscode.markdown.preview.editor': return 'markdownPreview';
		default: return 'other';
	}
}
