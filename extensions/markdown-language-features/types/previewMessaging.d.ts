/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface BaseMessage {
	readonly source: string;
}

export namespace FromWebviewMessage {

	export interface CacheImageSizes extends BaseMessage {
		readonly type: 'cacheImageSizes';
		readonly imageData: ReadonlyArray<{ id: string; width: number; height: number }>;
	}

	export interface RevealLine extends BaseMessage {
		readonly type: 'revealLine';
		readonly line: number;
	}

	export interface DidClick extends BaseMessage {
		readonly type: 'didClick';
		readonly line: number;
	}

	export interface ClickLink extends BaseMessage {
		readonly type: 'openLink';
		readonly href: string;
	}

	export interface ShowPreviewSecuritySelector extends BaseMessage {
		readonly type: 'showPreviewSecuritySelector';
	}

	export interface PreviewStyleLoadError extends BaseMessage {
		readonly type: 'previewStyleLoadError';
		readonly unloadedStyles: readonly string[];
	}

	export type Type =
		| CacheImageSizes
		| RevealLine
		| DidClick
		| ClickLink
		| ShowPreviewSecuritySelector
		| PreviewStyleLoadError
		;
}

export namespace ToWebviewMessage {
	export interface OnDidChangeTextEditorSelection extends BaseMessage {
		readonly type: 'onDidChangeTextEditorSelection';
		readonly line: number;
	}

	export interface UpdateView extends BaseMessage {
		readonly type: 'updateView';
		readonly line: number;
		readonly source: string;
	}

	export interface UpdateContent extends BaseMessage {
		readonly type: 'updateContent';
		readonly content: string;
	}

	export type Type =
		| OnDidChangeTextEditorSelection
		| UpdateView
		| UpdateContent
		;
}
