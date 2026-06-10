/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { ChatPromptReference, ChatResult } from 'vscode';
import { getTextPart } from '../../../platform/chat/common/globalStringUtils';
import { NotebookDocumentSnapshot } from '../../../platform/editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { getAltNotebookRange, IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { findCell, findNotebook, getNotebookAndCellFromUri } from '../../../util/common/notebooks';
import { isLocation, isUri } from '../../../util/common/types';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { isEqual } from '../../../util/vs/base/common/resources';
import { isNumber, isString } from '../../../util/vs/base/common/types';
import { isUriComponents, URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Range, Uri } from '../../../vscodeTypes';
import { ChatVariablesCollection, isCustomizationsIndex, isInstructionFile } from '../../prompt/common/chatVariablesCollection';
import { Turn } from '../../prompt/common/conversation';
import { IBuildPromptContext, IWorkingSet, WorkingSetEntryState } from '../../prompt/common/intents';


export class EditCodeStepTelemetryInfo {
	public codeblockUris = new ResourceSet();

	public codeblockCount: number = 0;
	public codeblockWithUriCount: number = 0;
	public codeblockWithElidedCodeCount: number = 0;

	public shellCodeblockCount: number = 0;
	public shellCodeblockWithUriCount: number = 0;
	public shellCodeblockWithElidedCodeCount: number = 0;
}

export interface IPreviousWorkingSetEntry {
	readonly document: { readonly uri: Uri; readonly languageId: string; readonly version: number; readonly text: string };
	state: WorkingSetEntryState;
}

export interface IPreviousPromptInstruction {
	readonly document: { readonly uri: Uri; readonly version: number; readonly text: string };
}

export class PreviousEditCodeStep {
	public static fromChatResultMetaData(chatResult: ChatResult): PreviousEditCodeStep | undefined {
		const edits = chatResult.metadata?.edits;
		if (isEditHistoryDTO(edits)) {
			const entries = edits.workingSet.map(entry => {
				return {
					document: { uri: URI.revive(entry.uri), languageId: entry.languageId, version: entry.version, text: entry.text },
					state: entry.state,
				} satisfies IPreviousWorkingSetEntry;
			});
			const promptInstructions = edits.promptInstructions?.map(entry => {
				return {
					document: { uri: URI.revive(entry.uri), version: entry.version, text: entry.text }
				} satisfies IPreviousPromptInstruction;
			}) ?? [];
			return new PreviousEditCodeStep(entries, edits.request, edits.response, promptInstructions);
		}
		return undefined;
	}

	public static fromTurn(turn: Turn): PreviousEditCodeStep | undefined {
		let editCodeStep = turn.getMetadata(EditCodeStepTurnMetaData)?.value;
		if (!editCodeStep && turn.responseChatResult) {
			editCodeStep = PreviousEditCodeStep.fromChatResultMetaData(turn.responseChatResult);
			if (editCodeStep) {
				turn.setMetadata(new EditCodeStepTurnMetaData(editCodeStep));
			}
		}
		return editCodeStep;
	}

	public static fromEditCodeStep(editCodeStep: EditCodeStep) {
		const workingSet = editCodeStep.workingSet.map(entry => ({
			document: { uri: entry.document.uri, languageId: entry.document.languageId, version: entry.document.version, text: entry.document.getText() },
			state: entry.state,
		}));
		const promptInstructions = editCodeStep.promptInstructions.map(entry => ({
			document: { uri: entry.uri, version: entry.version, text: entry.getText() }
		}));
		return new PreviousEditCodeStep(workingSet, editCodeStep.userMessage, editCodeStep.assistantReply, promptInstructions);
	}

	constructor(
		public readonly workingSet: readonly IPreviousWorkingSetEntry[],
		public readonly request: string,
		public readonly response: string,
		public readonly promptInstructions: readonly IPreviousPromptInstruction[]
	) { }

	public setWorkingSetEntryState(uri: URI, state: { accepted: boolean; hasRemainingEdits: boolean }): void {
		for (const entry of this.workingSet) {
			if (isEqual(entry.document.uri, uri)) {
				entry.state = this._getUpdatedState(entry, state.accepted, state.hasRemainingEdits);
			}
		}
	}

	private _getUpdatedState(workingSetEntry: IPreviousWorkingSetEntry, accepted: boolean, hasRemainingEdits: boolean): WorkingSetEntryState {
		const { state } = workingSetEntry;

		if (state === WorkingSetEntryState.Accepted || state === WorkingSetEntryState.Rejected) {
			return state;
		}

		if (accepted && !hasRemainingEdits) {
			return WorkingSetEntryState.Accepted;
		}

		if (!accepted && !hasRemainingEdits) {
			return WorkingSetEntryState.Rejected;
		}

		// TODO: reflect partial accepts/rejects within a file when we add support for that
		return WorkingSetEntryState.Undecided;
	}

	public toChatResultMetaData(): any {
		const edits = {
			workingSet: this.workingSet.map(entry => {
				return {
					uri: entry.document.uri,
					text: entry.document.text,
					languageId: entry.document.languageId,
					version: entry.document.version,
					state: entry.state,
				};
			}),
			promptInstructions: this.promptInstructions.map(entry => ({
				uri: entry.document.uri,
				text: entry.document.text,
				version: entry.document.version
			})),
			request: this.request,
			response: this.response
		} satisfies EditHistoryDTO;
		return { edits };
	}

}

export class EditCodeStepTurnMetaData {
	constructor(public readonly value: PreviousEditCodeStep) {
	}
}


export class EditCodeStep {

	public static async create(instantiationService: IInstantiationService, history: readonly Turn[], chatVariables: ChatVariablesCollection, endpoint: IChatEndpoint): Promise<EditCodeStepChatVariablesPair> {
		const factory = instantiationService.createInstance(EditCodeStepFactory);
		return factory.createNextStep(history, chatVariables, endpoint);
	}

	/**
	 * The user message that was sent with this step
	 */
	private _userMessage: string = '';
	public get userMessage(): string {
		return this._userMessage;
	}

	/**
	 * The assistant reply that came back with this step
	 */
	private _assistantReply: string = '';
	public get assistantReply(): string {
		return this._assistantReply;
	}

	/**
	 * The working set (it is initially the list of files sent by the user).
	 * If the assistant replies with a code suggestion for a file contained here, it's status will be changed to undecided.
	 * If the assistant replies with a code suggestion for a file not contained here, the working set will not reflect this in any way.
	 * If the user makes a decision in the ui, the working set entry will update to reflect this.
	 */
	private readonly _workingSet: readonly IMutableWorkingSetEntry[];
	public get workingSet(): IWorkingSet {
		return this._workingSet;
	}

	public get promptInstructions(): readonly TextDocumentSnapshot[] {
		return this._promptInstructions;
	}

	public readonly telemetryInfo = new EditCodeStepTelemetryInfo();

	constructor(
		public readonly previousStep: PreviousEditCodeStep | null,
		workingSet: readonly IMutableWorkingSetEntry[],
		private readonly _promptInstructions: TextDocumentSnapshot[]
	) {
		this._workingSet = workingSet;
	}

	setUserMessage(userMessage: Raw.UserChatMessage): void {
		this._userMessage = getTextPart(userMessage.content);
	}

	setAssistantReply(reply: string): void {
		this._assistantReply = reply;
	}

	public setWorkingSetEntryState(uri: URI, state: WorkingSetEntryState): void {
		for (const entry of this._workingSet) {
			if (isEqual(entry.document.uri, uri)) {
				entry.state = state;
			}
		}
	}

	public getPredominantScheme(): string | undefined {
		const schemes = new Map<string, number>();
		for (const entry of this._workingSet) {
			const scheme = entry.document.uri.scheme;
			schemes.set(scheme, (schemes.get(scheme) ?? 0) + 1);
		}
		let maxCount = 0;
		let maxScheme = undefined;
		for (const [scheme, count] of schemes) {
			if (count > maxCount) {
				maxCount = count;
				maxScheme = scheme;
			}
		}
		return maxScheme;
	}
}

interface EditCodeStepChatVariablesPair {
	readonly editCodeStep: EditCodeStep;
	readonly chatVariables: ChatVariablesCollection;
}

class EditCodeStepFactory {

	constructor(
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContentService: IAlternativeNotebookContentService
	) { }

	/**
	 * Update the working set taking into account the passed in chat variables.
	 * Returns the filtered chat variables that should be used for rendering
	 */
	public async createNextStep(history: readonly Turn[], chatVariables: ChatVariablesCollection, endpoint: IChatEndpoint): Promise<EditCodeStepChatVariablesPair> {

		const findPreviousStepEntry = () => {
			for (let i = history.length - 1; i >= 0; i--) {
				const entry = PreviousEditCodeStep.fromTurn(history[i]);
				if (entry) {
					return entry;
				}
			}
			return null;
		};

		const prevStep = findPreviousStepEntry();

		const workingSet: IMutableWorkingSetEntry[] = [];

		const getWorkingSetEntry = (uri: Uri) => {
			return workingSet.find(entry => isEqual(entry.document.uri, uri));
		};

		const getCurrentOrPreviousWorkingSetEntryState = (uri: Uri) => {
			const currentEntry = getWorkingSetEntry(uri);
			if (currentEntry) {
				return currentEntry.state;
			}
			if (prevStep) {
				const previousStepEntry = prevStep.workingSet.find(entry => isEqual(entry.document.uri, uri));
				if (previousStepEntry) {
					return previousStepEntry.state;
				}
			}
			return WorkingSetEntryState.Initial;
		};

		const addWorkingSetEntry = async (documentOrCellUri: URI, isMarkedReadonly: boolean | undefined, range?: Range) => {
			try {
				const uri = this._notebookService.hasSupportedNotebooks(documentOrCellUri) ? (findNotebook(documentOrCellUri, this._workspaceService.notebookDocuments)?.uri ?? documentOrCellUri) : documentOrCellUri;
				if (!getWorkingSetEntry(uri)) {
					const state = getCurrentOrPreviousWorkingSetEntryState(uri);
					if (this._notebookService.hasSupportedNotebooks(uri)) {
						const format = this.alternativeNotebookContentService.getFormat(endpoint);
						const [document, notebook] = await Promise.all([
							this._workspaceService.openNotebookDocumentAndSnapshot(uri, format),
							this._workspaceService.openNotebookDocument(uri)
						]);
						const cell = findCell(documentOrCellUri, notebook);
						if (cell) {
							range = range ?? new Range(cell.document.lineAt(0).range.start, cell.document.lineAt(cell.document.lineCount - 1).range.end);
							range = getAltNotebookRange(range, cell.document.uri, document.document, format);
						} else {
							range = undefined;
						}
						workingSet.push({
							state: state,
							document,
							isMarkedReadonly,
							range
						});
					} else {
						workingSet.push({
							state: state,
							document: await this._workspaceService.openTextDocumentAndSnapshot(uri),
							isMarkedReadonly,
							range
						});
					}
				}


			} catch (err) {
				return null;
			}
		};


		// here we reverse to account for the UI passing the elements in reversed order
		chatVariables = chatVariables.reverse();

		const promptInstructions: TextDocumentSnapshot[] = [];

		// We extract all files or selections from the chat variables
		const otherChatVariables: ChatPromptReference[] = [];
		for (const chatVariable of chatVariables) {
			if (isInstructionFile(chatVariable) || isCustomizationsIndex(chatVariable)) {
				otherChatVariables.push(chatVariable.reference);
				// take a snapshot of the prompt instruction file so we know if it changed
				if (isUri(chatVariable.value)) {
					const textDocument = await this._workspaceService.openTextDocument(chatVariable.value);
					promptInstructions.push(TextDocumentSnapshot.create(textDocument));
				}
			} else if (isNotebookVariable(chatVariable.value)) {
				const [notebook,] = getNotebookAndCellFromUri(chatVariable.value, this._workspaceService.notebookDocuments);
				if (!notebook) {
					continue;
				}
				// No need to explicitly add the notebook to the working set, let the user do this.
				if (chatVariable.value.scheme !== Schemas.vscodeNotebookCellOutput) {
					await addWorkingSetEntry(notebook.uri, false);
				}
				if (chatVariable.value.scheme === Schemas.vscodeNotebookCellOutput) {
					otherChatVariables.push(chatVariable.reference);
				}
			} else if (isUri(chatVariable.value)) {
				await addWorkingSetEntry(chatVariable.value, chatVariable.isMarkedReadonly);
			} else if (isLocation(chatVariable.value)) {
				await addWorkingSetEntry(chatVariable.value.uri, chatVariable.isMarkedReadonly, chatVariable.value.range);
			} else {
				otherChatVariables.push(chatVariable.reference);
			}
		}
		return {
			editCodeStep: new EditCodeStep(prevStep, workingSet, promptInstructions),
			chatVariables: new ChatVariablesCollection(otherChatVariables)
		};
	}
}


export function isNotebookVariable(chatVariableValue?: unknown): chatVariableValue is URI | Uri {
	if (!chatVariableValue || !isUri(chatVariableValue)) {
		return false;
	}
	return chatVariableValue.scheme === Schemas.vscodeNotebookCell || chatVariableValue.scheme === Schemas.vscodeNotebookCellOutput;
}

interface ITextDocumentMutableWorkingSetEntry {
	readonly document: TextDocumentSnapshot;
	readonly range?: Range | undefined;
	readonly isMarkedReadonly: boolean | undefined;
	state: WorkingSetEntryState;
}

interface INotebookMutableWorkingSetEntry {
	readonly document: NotebookDocumentSnapshot;
	readonly range?: Range | undefined;
	readonly isMarkedReadonly: boolean | undefined;
	state: WorkingSetEntryState;
}

type IMutableWorkingSetEntry = ITextDocumentMutableWorkingSetEntry | INotebookMutableWorkingSetEntry;

export interface IEditStepBuildPromptContext extends IBuildPromptContext {
	readonly workingSet: IWorkingSet;
	readonly promptInstructions: readonly TextDocumentSnapshot[];
}

interface WorkingSetEntryDTO {
	uri: URI;
	text: string;
	version: number;
	languageId: string;
	state: number;
}

interface PromptInstructionsDTO {
	uri: URI;
	text: string;
	version: number;
}

interface EditHistoryDTO {
	workingSet: WorkingSetEntryDTO[];
	promptInstructions?: PromptInstructionsDTO[];
	request: string;
	response: string;
}

function isWorkingSetEntryDTO(data: any): data is WorkingSetEntryDTO {
	return data && isUriComponents(data.uri) && isString(data.text) && isNumber(data.version) && isString(data.languageId) && isNumber(data.state);
}

function isEditHistoryDTO(data: any): data is EditHistoryDTO {
	return data && Array.isArray(data.workingSet) && data.workingSet.every(isWorkingSetEntryDTO) && isString(data.request) && isString(data.response);
}
