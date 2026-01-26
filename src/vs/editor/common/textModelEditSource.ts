/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sumBy } from '../../base/common/arrays.js';
import { prefixedUuid } from '../../base/common/uuid.js';
import { LineEdit } from './core/edits/lineEdit.js';
import { BaseStringEdit } from './core/edits/stringEdit.js';
import { StringText } from './core/text/abstractText.js';
import { TextLength } from './core/text/textLength.js';
import { ProviderId, VersionedExtensionId } from './languages.js';

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
		// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
		return this.metadata as any;
	}
}

type TextModelEditSourceT<T> = TextModelEditSource & {
	metadataT: T;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createEditSource<T extends Record<string, any>>(metadata: T): TextModelEditSourceT<T> {
	// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
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

	rename: (oldName: string | undefined, newName: string) => createEditSource({ source: 'rename', $$$oldName: oldName, $$$newName: newName } as const),

	chatApplyEdits(data: {
		modelId: string | undefined;
		sessionId: string | undefined;
		requestId: string | undefined;
		languageId: string;
		mode: string | undefined;
		extensionId: VersionedExtensionId | undefined;
		codeBlockSuggestionId: EditSuggestionId | undefined;
	}) {
		return createEditSource({
			source: 'Chat.applyEdits',
			$modelId: avoidPathRedaction(data.modelId),
			$extensionId: data.extensionId?.extensionId,
			$extensionVersion: data.extensionId?.version,
			$$languageId: data.languageId,
			$$sessionId: data.sessionId,
			$$requestId: data.requestId,
			$$mode: data.mode,
			$$codeBlockSuggestionId: data.codeBlockSuggestionId,
		} as const);
	},

	chatUndoEdits: () => createEditSource({ source: 'Chat.undoEdits' } as const),
	chatReset: () => createEditSource({ source: 'Chat.reset' } as const),

	inlineCompletionAccept(data: { nes: boolean; requestUuid: string; languageId: string; providerId?: ProviderId; correlationId: string | undefined }) {
		return createEditSource({
			source: 'inlineCompletionAccept',
			$nes: data.nes,
			...toProperties(data.providerId),
			$$correlationId: data.correlationId,
			$$requestUuid: data.requestUuid,
			$$languageId: data.languageId,
		} as const);
	},

	inlineCompletionPartialAccept(data: { nes: boolean; requestUuid: string; languageId: string; providerId?: ProviderId; correlationId: string | undefined; type: 'word' | 'line' }) {
		return createEditSource({
			source: 'inlineCompletionPartialAccept',
			type: data.type,
			$nes: data.nes,
			...toProperties(data.providerId),
			$$correlationId: data.correlationId,
			$$requestUuid: data.requestUuid,
			$$languageId: data.languageId,
		} as const);
	},

	inlineChatApplyEdit(data: { modelId: string | undefined; requestId: string | undefined; sessionId: string | undefined; languageId: string; extensionId: VersionedExtensionId | undefined }) {
		return createEditSource({
			source: 'inlineChat.applyEdits',
			$modelId: avoidPathRedaction(data.modelId),
			$extensionId: data.extensionId?.extensionId,
			$extensionVersion: data.extensionId?.version,
			$$sessionId: data.sessionId,
			$$requestId: data.requestId,
			$$languageId: data.languageId,
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
export type ITextModelEditSourceMetadata = Values<{ [TKey in keyof typeof EditSources]: ReturnType<typeof EditSources[TKey]>['metadataT'] }>;
type ITextModelEditSourceMetadataKeys = Values<{ [TKey in keyof typeof EditSources]: keyof ReturnType<typeof EditSources[TKey]>['metadataT'] }>;


function avoidPathRedaction(str: string | undefined): string | undefined {
	if (str === undefined) {
		return undefined;
	}
	// To avoid false-positive file path redaction.
	return str.replaceAll('/', '|');
}


export class EditDeltaInfo {
	public static fromText(text: string): EditDeltaInfo {
		const linesAdded = TextLength.ofText(text).lineCount;
		const charsAdded = text.length;
		return new EditDeltaInfo(linesAdded, 0, charsAdded, 0);
	}

	/** @internal */
	public static fromEdit(edit: BaseStringEdit, originalString: StringText): EditDeltaInfo {
		const lineEdit = LineEdit.fromStringEdit(edit, originalString);
		const linesAdded = sumBy(lineEdit.replacements, r => r.newLines.length);
		const linesRemoved = sumBy(lineEdit.replacements, r => r.lineRange.length);
		const charsAdded = sumBy(edit.replacements, r => r.getNewLength());
		const charsRemoved = sumBy(edit.replacements, r => r.replaceRange.length);
		return new EditDeltaInfo(linesAdded, linesRemoved, charsAdded, charsRemoved);
	}

	public static tryCreate(
		linesAdded: number | undefined,
		linesRemoved: number | undefined,
		charsAdded: number | undefined,
		charsRemoved: number | undefined
	): EditDeltaInfo | undefined {
		if (linesAdded === undefined || linesRemoved === undefined || charsAdded === undefined || charsRemoved === undefined) {
			return undefined;
		}
		return new EditDeltaInfo(linesAdded, linesRemoved, charsAdded, charsRemoved);
	}

	constructor(
		public readonly linesAdded: number,
		public readonly linesRemoved: number,
		public readonly charsAdded: number,
		public readonly charsRemoved: number
	) { }
}


/**
 * This is an opaque serializable type that represents a unique identity for an edit.
 */
export interface EditSuggestionId {
	readonly _brand: 'EditIdentity';
}

export namespace EditSuggestionId {
	/**
	 * Use AiEditTelemetryServiceImpl to create a new id!
	*/
	export function newId(genPrefixedUuid?: (ns: string) => string): EditSuggestionId {
		const id = genPrefixedUuid ? genPrefixedUuid('sgt') : prefixedUuid('sgt');
		return toEditIdentity(id);
	}
}

function toEditIdentity(id: string): EditSuggestionId {
	return id as unknown as EditSuggestionId;
}
