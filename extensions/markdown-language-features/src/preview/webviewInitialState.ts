/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MarkdownEditorConfiguration } from './markdownEditorProtocol';

export interface MarkdownEditorInitialState extends MarkdownEditorConfiguration {
	readonly taskProgressLabels: TaskProgressLabels;
	/** The text to show until the editor's content session (`@vscode/web-editors`) delivers it. */
	readonly content: string;
	readonly readonly: boolean;
	readonly richLinksEnabled: boolean;
	readonly linkPresentationRules: readonly { id: string; source: string; flags: string; kind: string }[];
}

export interface TaskProgressLabels {
	readonly title: string;
	readonly summary: string;
	readonly language: string;
}

/**
 * Encodes the initial state using an alphabet that cannot terminate or add an HTML attribute.
 */
export function encodeWebviewInitialState(state: MarkdownEditorInitialState): string {
	return encodeURIComponent(JSON.stringify(state));
}
