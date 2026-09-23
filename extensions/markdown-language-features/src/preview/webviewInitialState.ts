/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface MarkdownEditorInitialState {
	readonly content: string;
	readonly documentVersion: number;
	/** Identifies the authoritative text baseline shared by the host and webview. */
	readonly editEpoch: number;
	readonly readonly: boolean;
	readonly richLinksEnabled: boolean;
	readonly linkPresentationRules: readonly { id: string; source: string; flags: string; kind: string }[];
}

/**
 * Encodes the initial state using an alphabet that cannot terminate or add an HTML attribute.
 */
export function encodeWebviewInitialState(state: MarkdownEditorInitialState): string {
	return encodeURIComponent(JSON.stringify(state));
}
