/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProviderId } from './languages.js';

const privateSymbol = Symbol('TextModelEditReason');

export class TextModelEditReason {
	constructor(
		public readonly metadata: ITextModelEditReasonMetadata,
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
	public toKey(level: number, filter: { [TKey in ITextModelEditReasonMetadataKeys]?: boolean } = {}): string {
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
}

type TextModelEditReasonT<T> = TextModelEditReason & {
	metadataT: T;
};

function createEditReason<T extends Record<string, any>>(metadata: T): TextModelEditReasonT<T> {
	return new TextModelEditReason(metadata as any, privateSymbol) as any;
}

export const EditReasons = {
	unknown(data: { name?: string | null }) {
		return createEditReason({
			source: 'unknown',
			name: data.name,
		} as const);
	},

	rename: () => createEditReason({ source: 'rename' } as const),

	chatApplyEdits(data: { modelId: string | undefined }) {
		return createEditReason({
			source: 'Chat.applyEdits',
			$modelId: avoidPathRedaction(data.modelId),
		} as const);
	},

	inlineCompletionAccept(data: { nes: boolean; requestUuid: string; providerId?: ProviderId }) {
		return createEditReason({
			source: 'inlineCompletionAccept',
			$nes: data.nes,
			...toProperties(data.providerId),
			$$requestUuid: data.requestUuid,
		} as const);
	},

	inlineCompletionPartialAccept(data: { nes: boolean; requestUuid: string; providerId?: ProviderId; type: 'word' | 'line' }) {
		return createEditReason({
			source: 'inlineCompletionPartialAccept',
			type: data.type,
			$nes: data.nes,
			...toProperties(data.providerId),
			$$requestUuid: data.requestUuid,
		} as const);
	},

	inlineChatApplyEdit(data: { modelId: string | undefined }) {
		return createEditReason({
			source: 'inlineChat.applyEdits',
			$modelId: avoidPathRedaction(data.modelId),
		} as const);
	},

	reloadFromDisk: () => createEditReason({ source: 'reloadFromDisk' } as const),

	cursor(data: { kind: 'compositionType' | 'compositionEnd' | 'type' | 'paste' | 'cut' | 'executeCommands' | 'executeCommand'; detailedSource?: string | null }) {
		return createEditReason({
			source: 'cursor',
			kind: data.kind,
			detailedSource: data.detailedSource,
		} as const);
	},

	setValue: () => createEditReason({ source: 'setValue' } as const),
	eolChange: () => createEditReason({ source: 'eolChange' } as const),
	applyEdits: () => createEditReason({ source: 'applyEdits' } as const),
	snippet: () => createEditReason({ source: 'snippet' } as const),
	suggest: (data: { providerId: ProviderId | undefined }) => createEditReason({ source: 'suggest', ...toProperties(data.providerId) } as const),

	codeAction: (data: { kind: string | undefined; providerId: ProviderId | undefined }) => createEditReason({ source: 'codeAction', $kind: data.kind, ...toProperties(data.providerId) } as const)
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
type ITextModelEditReasonMetadata = Values<{ [TKey in keyof typeof EditReasons]: ReturnType<typeof EditReasons[TKey]>['metadataT'] }>;
type ITextModelEditReasonMetadataKeys = Values<{ [TKey in keyof typeof EditReasons]: keyof ReturnType<typeof EditReasons[TKey]>['metadataT'] }>;


function avoidPathRedaction(str: string | undefined): string | undefined {
	if (str === undefined) {
		return undefined;
	}
	// To avoid false-positive file path redaction.
	return str.replaceAll('/', '|');
}
