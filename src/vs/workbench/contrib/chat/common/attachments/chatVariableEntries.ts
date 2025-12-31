/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { IOffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { isLocation, Location, SymbolKind } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { MarkerSeverity, IMarker } from '../../../../../platform/markers/common/markers.js';
import { ISCMHistoryItem } from '../../../scm/common/history.js';
import { IChatContentReference } from '../chatService/chatService.js';
import { IChatRequestVariableValue } from './chatVariables.js';
import { IToolData, ToolSet } from '../tools/languageModelToolsService.js';


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

export type ChatRequestToolReferenceEntry = IChatRequestToolEntry | IChatRequestToolSetEntry;

export interface StringChatContextValue {
	value?: string;
	name: string;
	modelDescription?: string;
	icon: ThemeIcon;
	uri: URI;
}

export interface IChatRequestImplicitVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'implicit';
	readonly isFile: true;
	readonly value: URI | Location | StringChatContextValue | undefined;
	readonly uri: URI | undefined;
	readonly isSelection: boolean;
	enabled: boolean;
}

export interface IChatRequestStringVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'string';
	readonly value: string | undefined;
	readonly modelDescription?: string;
	readonly icon: ThemeIcon;
	readonly uri: URI;
}

export interface IChatRequestWorkspaceVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'workspace';
	readonly value: string;
	readonly modelDescription?: string;
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
		return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber, data.filterRange?.startColumn].join(':');
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
	readonly value: URI;
	readonly isRoot: boolean;
	readonly originLabel?: string;
	readonly modelDescription: string;
	readonly automaticallyAdded: boolean;
	readonly toolReferences?: readonly ChatRequestToolReferenceEntry[];
}

export interface IPromptTextVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'promptText';
	readonly value: string;
	readonly settingId?: string;
	readonly modelDescription: string;
	readonly automaticallyAdded: boolean;
	readonly toolReferences?: readonly ChatRequestToolReferenceEntry[];
}

export interface ISCMHistoryItemVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'scmHistoryItem';
	readonly value: URI;
	readonly historyItem: ISCMHistoryItem;
}

export interface ISCMHistoryItemChangeVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'scmHistoryItemChange';
	readonly value: URI;
	readonly historyItem: ISCMHistoryItem;
}

export interface ISCMHistoryItemChangeRangeVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'scmHistoryItemChangeRange';
	readonly value: URI;
	readonly historyItemChangeStart: {
		readonly uri: URI;
		readonly historyItem: ISCMHistoryItem;
	};
	readonly historyItemChangeEnd: {
		readonly uri: URI;
		readonly historyItem: ISCMHistoryItem;
	};
}

export interface ITerminalVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'terminalCommand';
	readonly value: string;
	readonly resource: URI;
	readonly command: string;
	readonly output?: string;
	readonly exitCode?: number;
}

export interface IDebugVariableEntry extends IBaseChatRequestVariableEntry {
	readonly kind: 'debugVariable';
	readonly value: string;
	readonly expression: string;
	readonly type?: string;
}

export type IChatRequestVariableEntry = IGenericChatRequestVariableEntry | IChatRequestImplicitVariableEntry | IChatRequestPasteVariableEntry
	| ISymbolVariableEntry | ICommandResultVariableEntry | IDiagnosticVariableEntry | IImageVariableEntry
	| IChatRequestToolEntry | IChatRequestToolSetEntry
	| IChatRequestDirectoryEntry | IChatRequestFileEntry | INotebookOutputVariableEntry | IElementVariableEntry
	| IPromptFileVariableEntry | IPromptTextVariableEntry
	| ISCMHistoryItemVariableEntry | ISCMHistoryItemChangeVariableEntry | ISCMHistoryItemChangeRangeVariableEntry | ITerminalVariableEntry
	| IChatRequestStringVariableEntry | IChatRequestWorkspaceVariableEntry | IDebugVariableEntry;

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

export function isStringVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestStringVariableEntry {
	return obj.kind === 'string';
}

export function isTerminalVariableEntry(obj: IChatRequestVariableEntry): obj is ITerminalVariableEntry {
	return obj.kind === 'terminalCommand';
}

export function isDebugVariableEntry(obj: IChatRequestVariableEntry): obj is IDebugVariableEntry {
	return obj.kind === 'debugVariable';
}

export function isPasteVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestPasteVariableEntry {
	return obj.kind === 'paste';
}

export function isWorkspaceVariableEntry(obj: IChatRequestVariableEntry): obj is IChatRequestWorkspaceVariableEntry {
	return obj.kind === 'workspace';
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

export function isPromptFileVariableEntry(obj: IChatRequestVariableEntry): obj is IPromptFileVariableEntry {
	return obj.kind === 'promptFile';
}

export function isPromptTextVariableEntry(obj: IChatRequestVariableEntry): obj is IPromptTextVariableEntry {
	return obj.kind === 'promptText';
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

export function isSCMHistoryItemChangeVariableEntry(obj: IChatRequestVariableEntry): obj is ISCMHistoryItemChangeVariableEntry {
	return obj.kind === 'scmHistoryItemChange';
}

export function isSCMHistoryItemChangeRangeVariableEntry(obj: IChatRequestVariableEntry): obj is ISCMHistoryItemChangeRangeVariableEntry {
	return obj.kind === 'scmHistoryItemChangeRange';
}

export function isStringImplicitContextValue(value: unknown): value is StringChatContextValue {
	const asStringImplicitContextValue = value as Partial<StringChatContextValue>;
	return (
		typeof asStringImplicitContextValue === 'object' &&
		asStringImplicitContextValue !== null &&
		(typeof asStringImplicitContextValue.value === 'string' || typeof asStringImplicitContextValue.value === 'undefined') &&
		typeof asStringImplicitContextValue.name === 'string' &&
		ThemeIcon.isThemeIcon(asStringImplicitContextValue.icon) &&
		URI.isUri(asStringImplicitContextValue.uri)
	);
}

export enum PromptFileVariableKind {
	Instruction = 'vscode.prompt.instructions.root',
	InstructionReference = `vscode.prompt.instructions`,
	PromptFile = 'vscode.prompt.file'
}

/**
 * Utility to convert a {@link uri} to a chat variable entry.
 * The `id` of the chat variable can be one of the following:
 *
 * - `vscode.prompt.instructions__<URI>`: for all non-root prompt instructions references
 * - `vscode.prompt.instructions.root__<URI>`: for *root* prompt instructions references
 * - `vscode.prompt.file__<URI>`: for prompt file references
 *
 * @param uri A resource URI that points to a prompt instructions file.
 * @param kind The kind of the prompt file variable entry.
 */
export function toPromptFileVariableEntry(uri: URI, kind: PromptFileVariableKind, originLabel?: string, automaticallyAdded = false, toolReferences?: ChatRequestToolReferenceEntry[]): IPromptFileVariableEntry {
	//  `id` for all `prompt files` starts with the well-defined part that the copilot extension(or other chatbot) can rely on
	return {
		id: `${kind}__${uri.toString()}`,
		name: `prompt:${basename(uri)}`,
		value: uri,
		kind: 'promptFile',
		modelDescription: 'Prompt instructions file',
		isRoot: kind !== PromptFileVariableKind.InstructionReference,
		originLabel,
		toolReferences,
		automaticallyAdded
	};
}

export function toPromptTextVariableEntry(content: string, automaticallyAdded = false, toolReferences?: ChatRequestToolReferenceEntry[]): IPromptTextVariableEntry {
	return {
		id: `vscode.prompt.instructions.text`,
		name: `prompt:instructionsList`,
		value: content,
		kind: 'promptText',
		modelDescription: 'Prompt instructions list',
		automaticallyAdded,
		toolReferences
	};
}

export function toFileVariableEntry(uri: URI, range?: IRange): IChatRequestFileEntry {
	return {
		kind: 'file',
		value: range ? { uri, range } : uri,
		id: uri.toString() + (range?.toString() ?? ''),
		name: basename(uri),
	};
}

export function toToolVariableEntry(entry: IToolData, range?: IOffsetRange): IChatRequestToolEntry {
	return {
		kind: 'tool',
		id: entry.id,
		icon: ThemeIcon.isThemeIcon(entry.icon) ? entry.icon : undefined,
		name: entry.displayName,
		value: undefined,
		range
	};
}

export function toToolSetVariableEntry(entry: ToolSet, range?: IOffsetRange): IChatRequestToolSetEntry {
	return {
		kind: 'toolset',
		id: entry.id,
		icon: entry.icon,
		name: entry.referenceName,
		value: Array.from(entry.getTools()).map(t => toToolVariableEntry(t)),
		range
	};
}

export class ChatRequestVariableSet {
	private _ids = new Set<string>();
	private _entries: IChatRequestVariableEntry[] = [];

	constructor(entries?: IChatRequestVariableEntry[]) {
		if (entries) {
			this.add(...entries);
		}
	}

	public add(...entry: IChatRequestVariableEntry[]): void {
		for (const e of entry) {
			if (!this._ids.has(e.id)) {
				this._ids.add(e.id);
				this._entries.push(e);
			}
		}
	}

	public insertFirst(entry: IChatRequestVariableEntry): void {
		if (!this._ids.has(entry.id)) {
			this._ids.add(entry.id);
			this._entries.unshift(entry);
		}
	}

	public remove(entry: IChatRequestVariableEntry): void {
		this._ids.delete(entry.id);
		this._entries = this._entries.filter(e => e.id !== entry.id);
	}

	public has(entry: IChatRequestVariableEntry): boolean {
		return this._ids.has(entry.id);
	}

	public asArray(): IChatRequestVariableEntry[] {
		return this._entries.slice(0); // return a copy
	}

	public get length(): number {
		return this._entries.length;
	}
}
