/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface BaseMessage {
	readonly source: string;
}

export interface MarkdownPreviewInnerChange {
	/** 0-based line number */
	readonly line: number;
	/** 0-based start column */
	readonly startColumn: number;
	/** 0-based end column (exclusive). Use Number.MAX_SAFE_INTEGER for end-of-line. */
	readonly endColumn: number;
}

export interface MarkdownPreviewLineChanges {
	readonly added?: readonly number[];
	readonly deleted?: readonly number[];
	readonly innerChanges?: readonly MarkdownPreviewInnerChange[];
}

export interface DiffScrollSyncData {
	/** Shared BroadcastChannel name for this diff pair */
	readonly channelName: string;
	/** Which side of the diff this preview represents */
	readonly role: 'original' | 'modified';
	/** Mapping from the other side's line numbers to this side's line numbers */
	readonly lineMappings: readonly number[];
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
		readonly lineChanges?: MarkdownPreviewLineChanges;
		readonly diffScrollSync?: DiffScrollSyncData;
	}

	export interface CopyImageContent extends BaseMessage {
		readonly type: 'copyImage';
		readonly source: string;
		readonly id: string;
	}

	export interface OpenImageContent extends BaseMessage {
		readonly type: 'openImage';
		readonly source: string;
		readonly imageSource: string;
	}

	export type Type =
		| OnDidChangeTextEditorSelection
		| UpdateView
		| UpdateContent
		| CopyImageContent
		| OpenImageContent
		;
}
