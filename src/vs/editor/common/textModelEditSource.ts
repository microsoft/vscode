/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProviderId } from './languages.js';

const privateSymbol = Symbol('TextModelEditSource');

export class TextModelEditSource {
	constructor(
		public readonly metadata: ITextModelEditSourceMetadata,
		_privateCtorGuard: typeof privateSymbol,
	) { }

	public toString(): string {
		return `${this.metadata.source}`;
	}

	public getType(): string {
		const metadata = this.metadata;
		switch (metadata.source) {
			case 'cursor':
				return metadata.kind;
			case 'inlineCompletionAccept':
				return metadata.source + (metadata.$nes ? ':nes' : '');
			case 'unknown':
				return metadata.name || 'unknown';
			default:
				return metadata.source;
		}
	}

	/**
	 * Converts the metadata to a key string.
	 * Only includes properties/values that have `level` many `$` prefixes or less.
	*/
	public toKey(level: number, filter: { [TKey in ITextModelEditSourceMetadataKeys]?: boolean } = {}): string {
		const metadata = this.metadata;
		const keys = Object.entries(metadata).filter(([key, value]) => {
			const filterVal = (filter as Record<string, boolean>)[key];
			if (filterVal !== undefined) {
				return filterVal;
			}

			const prefixCount = (key.match(/\$/g) || []).length;
			return prefixCount <= level && value !== undefined && value !== null && value !== '';
		}).map(([key, value]) => `${key}:${value}`);
		return keys.join('-');
	}

	public get props(): Record<ITextModelEditSourceMetadataKeys, string | undefined> {
		return this.metadata as any;
	}
}

type TextModelEditSourceT<T> = TextModelEditSource & {
	metadataT: T;
};

function createEditSource<T extends Record<string, any>>(metadata: T): TextModelEditSourceT<T> {
	return new TextModelEditSource(metadata as any, privateSymbol) as any;
}

export function isAiEdit(source: TextModelEditSource): boolean {
	switch (source.metadata.source) {
		case 'inlineCompletionAccept':
		case 'inlineCompletionPartialAccept':
		case 'inlineChat.applyEdits':
		case 'Chat.applyEdits':
			return true;
	}
	return false;
}

export function isUserEdit(source: TextModelEditSource): boolean {
	switch (source.metadata.source) {
		case 'cursor':
			return source.metadata.kind === 'type';
	}
	return false;
}

export const EditSources = {
	unknown(data: { name?: string | null }) {
		return createEditSource({
			source: 'unknown',
			name: data.name,
		} as const);
	},

	rename: () => createEditSource({ source: 'rename' } as const),

	chatApplyEdits(data: { modelId: string | undefined; sessionId: string | undefined; requestId: string | undefined }) {
		return createEditSource({
			source: 'Chat.applyEdits',
			$modelId: avoidPathRedaction(data.modelId),
			$$sessionId: data.sessionId,
			$$requestId: data.requestId,
		} as const);
	},

	chatUndoEdits: () => createEditSource({ source: 'Chat.undoEdits' } as const),
	chatReset: () => createEditSource({ source: 'Chat.reset' } as const),

	inlineCompletionAccept(data: { nes: boolean; requestUuid: string; providerId?: ProviderId }) {
		return createEditSource({
			source: 'inlineCompletionAccept',
			$nes: data.nes,
			...toProperties(data.providerId),
			$$requestUuid: data.requestUuid,
		} as const);
	},

	inlineCompletionPartialAccept(data: { nes: boolean; requestUuid: string; providerId?: ProviderId; type: 'word' | 'line' }) {
		return createEditSource({
			source: 'inlineCompletionPartialAccept',
			type: data.type,
			$nes: data.nes,
			...toProperties(data.providerId),
			$$requestUuid: data.requestUuid,
		} as const);
	},

	inlineChatApplyEdit(data: { modelId: string | undefined }) {
		return createEditSource({
			source: 'inlineChat.applyEdits',
			$modelId: avoidPathRedaction(data.modelId),
		} as const);
	},

	reloadFromDisk: () => createEditSource({ source: 'reloadFromDisk' } as const),

	cursor(data: { kind: 'compositionType' | 'compositionEnd' | 'type' | 'paste' | 'cut' | 'executeCommands' | 'executeCommand'; detailedSource?: string | null }) {
		return createEditSource({
			source: 'cursor',
			kind: data.kind,
			detailedSource: data.detailedSource,
		} as const);
	},

	setValue: () => createEditSource({ source: 'setValue' } as const),
	eolChange: () => createEditSource({ source: 'eolChange' } as const),
	applyEdits: () => createEditSource({ source: 'applyEdits' } as const),
	snippet: () => createEditSource({ source: 'snippet' } as const),
	suggest: (data: { providerId: ProviderId | undefined }) => createEditSource({ source: 'suggest', ...toProperties(data.providerId) } as const),

	codeAction: (data: { kind: string | undefined; providerId: ProviderId | undefined }) => createEditSource({ source: 'codeAction', $kind: data.kind, ...toProperties(data.providerId) } as const)
};

function toProperties(version: ProviderId | undefined) {
	if (!version) {
		return {};
	}
	return {
		$extensionId: version.extensionId,
		$extensionVersion: version.extensionVersion,
		$providerId: version.providerId,
	};
}

type Values<T> = T[keyof T];
type ITextModelEditSourceMetadata = Values<{ [TKey in keyof typeof EditSources]: ReturnType<typeof EditSources[TKey]>['metadataT'] }>;
type ITextModelEditSourceMetadataKeys = Values<{ [TKey in keyof typeof EditSources]: keyof ReturnType<typeof EditSources[TKey]>['metadataT'] }>;


function avoidPathRedaction(str: string | undefined): string | undefined {
	if (str === undefined) {
		return undefined;
	}
	// To avoid false-positive file path redaction.
	return str.replaceAll('/', '|');
}
