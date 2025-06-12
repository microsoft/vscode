/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IOffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { isLocation, Location, SymbolKind } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { MarkerSeverity, IMarker } from '../../../../platform/markers/common/markers.js';
import { ISCMHistoryItem } from '../../scm/common/history.js';
import { IChatContentReference } from './chatService.js';
import { IChatRequestVariableValue } from './chatVariables.js';


interface IBaseChatRequestVariableEntry {
	readonly id: string;
	readonly fullName?: string;
	readonly icon?: ThemeIcon;
	readonly name: string;
	readonly modelDescription?: string;

	/**
	 * The offset-range in the prompt. This means this entry has been explicitly typed out
	 * by the user.
	 */
	readonly range?: IOffsetRange;
	readonly value: IChatRequestVariableValue;
	readonly references?: IChatContentReference[];

	omittedState?: OmittedState;
}

export interface IGenericChatRequestVariableEntry extends IBaseChatRequestVariableEntry {
	kind: 'generic';
}

export interface IChatRequestDirectoryEntry extends IBaseChatRequestVariableEntry {
	kind: 'directory';
}

export interface IChatRequestFileEntry extends IBaseChatRequestVariableEntry {
	kind: 'file';
}

export const enum OmittedState {
	NotOmitted,
	Partial,
	Full,
}

export interface IChatRequestToolEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'tool';
}

export interface IChatRequestToolSetEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'toolset';
	readonly value: IChatRequestToolEntry[];
}

export interface IChatRequestImplicitVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'implicit';
	readonly isFile: true;
	readonly value: URI | Location | undefined;
	readonly isSelection: boolean;
	readonly isPromptFile: boolean;
	readonly enabled: boolean;
}

export interface IChatRequestPasteVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'paste';
	readonly code: string;
	readonly language: string;
	readonly pastedLines: string;

	// This is only used for old serialized data and should be removed once we no longer support it
	readonly fileName: string;

	// This is only undefined on old serialized data
	readonly copiedFrom: {
		readonly uri: URI;
		readonly range: IRange;
	} | undefined;
}

export interface ISymbolVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'symbol';
	readonly value: Location;
	readonly symbolKind: SymbolKind;
}

export interface ICommandResultVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'command';
}

export interface IImageVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'image';
	readonly isPasted?: boolean;
	readonly isURL?: boolean;
	readonly mimeType?: string;
}

export interface INotebookOutputVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'notebookOutput';
	readonly outputIndex?: number;
	readonly mimeType?: string;
}

export interface IDiagnosticVariableEntryFilterData {
	readonly owner?: string;
	readonly problemMessage?: string;
	readonly filterUri?: URI;
	readonly filterSeverity?: MarkerSeverity;
	readonly filterRange?: IRange;
}

/**
 * Chat variable that represents an attached prompt file.
 */
export interface IPromptVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'file';
	readonly value: URI | Location;
	readonly isRoot: boolean;
	readonly modelDescription: string;
}

export namespace IDiagnosticVariableEntryFilterData {
	export const icon = Codicon.error;

	export function fromMarker(marker: IMarker): IDiagnosticVariableEntryFilterData {
		return {
			filterUri: marker.resource,
			owner: marker.owner,
			problemMessage: marker.message,
			filterRange: { startLineNumber: marker.startLineNumber, endLineNumber: marker.endLineNumber, startColumn: marker.startColumn, endColumn: marker.endColumn }
		};
	}

	export function toEntry(data: IDiagnosticVariableEntryFilterData): IDiagnosticVariableEntry {
		return {
			id: id(data),
			name: label(data),
			icon,
			value: data,
			kind: 'diagnostic',
			...data,
		};
	}

	export function id(data: IDiagnosticVariableEntryFilterData) {
		return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber].join(':');
	}

	export function label(data: IDiagnosticVariableEntryFilterData) {
		const enum TrimThreshold {
			MaxChars = 30,
			MaxSpaceLookback = 10,
		}
		if (data.problemMessage) {
			if (data.problemMessage.length < TrimThreshold.MaxChars) {
				return data.problemMessage;
			}

			// Trim the message, on a space if it would not lose too much
			// data (MaxSpaceLookback) or just blindly otherwise.
			const lastSpace = data.problemMessage.lastIndexOf(' ', TrimThreshold.MaxChars);
			if (lastSpace === -1 || lastSpace + TrimThreshold.MaxSpaceLookback < TrimThreshold.MaxChars) {
				return data.problemMessage.substring(0, TrimThreshold.MaxChars) + '…';
			}
			return data.problemMessage.substring(0, lastSpace) + '…';
		}
		let labelStr = localize('chat.attachment.problems.all', "All Problems");
		if (data.filterUri) {
			labelStr = localize('chat.attachment.problems.inFile', "Problems in {0}", basename(data.filterUri));
		}

		return labelStr;
	}
}

export interface IDiagnosticVariableEntry extends IBaseChatRequestVariableEntry, IDiagnosticVariableEntryFilterData {
	readonly kind: 'diagnostic';
}

export interface IElementVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'element';
}

export interface IPromptFileVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'promptFile';
}

export interface ISCMHistoryItemVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'scmHistoryItem';
	readonly value: URI;
	readonly historyItem: ISCMHistoryItem;
}

export type IChatRequestVariableEntry = IGenericChatRequestVariableEntry | IChatRequestImplicitVariableEntry | IChatRequestPasteVariableEntry
	| ISymbolVariableEntry | ICommandResultVariableEntry | IDiagnosticVariableEntry | IImageVariableEntry
	| IChatRequestToolEntry | IChatRequestToolSetEntry
	| IChatRequestDirectoryEntry | IChatRequestFileEntry | INotebookOutputVariableEntry | IElementVariableEntry
	| IPromptFileVariableEntry | ISCMHistoryItemVariableEntry;


export namespace IChatRequestVariableEntry {

	/**
	 * Returns URI of the passed variant entry. Return undefined if not found.
	 */
	export function toUri(entry: IChatRequestVariableEntry): URI | undefined {
		return URI.isUri(entry.value)
			? entry.value
			: isLocation(entry.value)
				? entry.value.uri
				: undefined;
	}
}


export function isImplicitVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestImplicitVariableEntry {
	return obj.kind === 'implicit';
}

export function isPasteVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestPasteVariableEntry {
	return obj.kind === 'paste';
}

export function isImageVariableEntry(obj: IChatRequestVariableEntry): obj is IImageVariableEntry {
	return obj.kind === 'image';
}

export function isNotebookOutputVariableEntry(obj: IChatRequestVariableEntry): obj is INotebookOutputVariableEntry {
	return obj.kind === 'notebookOutput';
}

export function isElementVariableEntry(obj: IChatRequestVariableEntry): obj is IElementVariableEntry {
	return obj.kind === 'element';
}

export function isDiagnosticsVariableEntry(obj: IChatRequestVariableEntry): obj is IDiagnosticVariableEntry {
	return obj.kind === 'diagnostic';
}

export function isChatRequestFileEntry(obj: IChatRequestVariableEntry): obj is IChatRequestFileEntry {
	return obj.kind === 'file';
}

export function isChatRequestVariableEntry(obj: unknown): obj is IChatRequestVariableEntry {
	const entry = obj as IChatRequestVariableEntry;
	return typeof entry === 'object' &&
		entry !== null &&
		typeof entry.id === 'string' &&
		typeof entry.name === 'string';
}

export function isSCMHistoryItemVariableEntry(obj: IChatRequestVariableEntry): obj is ISCMHistoryItemVariableEntry {
	return obj.kind === 'scmHistoryItem';
}
