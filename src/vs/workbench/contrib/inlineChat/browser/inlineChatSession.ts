/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IWorkspaceTextEdit, TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { IModelDecorationOptions, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { EditMode, IInlineChatSessionProvider, IInlineChatSession, IInlineChatBulkEditResponse, IInlineChatEditResponse, InlineChatResponseType, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { DetailedLineRangeMapping, LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { Recording } from './inlineChatSessionService';


export type TelemetryData = {
	extension: string;
	rounds: string;
	undos: string;
	edits: boolean;
	finishedByEdit: boolean;
	startTime: string;
	endTime: string;
	editMode: string;
};

export type TelemetryDataClassification = {
	owner: 'jrieken';
	comment: 'Data about an interaction editor session';
	extension: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension providing the data' };
	rounds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of request that were made' };
	undos: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Requests that have been undone' };
	edits: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Did edits happen while the session was active' };
	finishedByEdit: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Did edits cause the session to terminate' };
	startTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session started' };
	endTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session ended' };
	editMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What edit mode was choosen: live, livePreview, preview' };
};

export enum ExpansionState {
	EXPANDED = 'expanded',
	CROPPED = 'cropped',
	NOT_CROPPED = 'not_cropped'
}

export class SessionWholeRange {

	private static readonly _options: IModelDecorationOptions = ModelDecorationOptions.register({ description: 'inlineChat/session/wholeRange' });

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private _decorationIds: string[] = [];

	constructor(private readonly _textModel: ITextModel, wholeRange: IRange) {
		this._decorationIds = _textModel.deltaDecorations([], [{ range: wholeRange, options: SessionWholeRange._options }]);
	}

	dispose() {
		this._onDidChange.dispose();
		if (!this._textModel.isDisposed()) {
			this._textModel.deltaDecorations(this._decorationIds, []);
		}
	}

	trackEdits(edits: ISingleEditOperation[]): void {
		const newDeco: IModelDeltaDecoration[] = [];
		for (const edit of edits) {
			newDeco.push({ range: edit.range, options: SessionWholeRange._options });
		}
		this._decorationIds.push(...this._textModel.deltaDecorations([], newDeco));
		this._onDidChange.fire(this);
	}

	fixup(changes: readonly DetailedLineRangeMapping[]): void {

		const newDeco: IModelDeltaDecoration[] = [];
		for (const { modified } of changes) {
			const modifiedRange = modified.isEmpty
				? new Range(modified.startLineNumber, 1, modified.startLineNumber, this._textModel.getLineLength(modified.startLineNumber))
				: new Range(modified.startLineNumber, 1, modified.endLineNumberExclusive - 1, this._textModel.getLineLength(modified.endLineNumberExclusive - 1));

			newDeco.push({ range: modifiedRange, options: SessionWholeRange._options });
		}
		const [first, ...rest] = this._decorationIds; // first is the original whole range
		const newIds = this._textModel.deltaDecorations(rest, newDeco);
		this._decorationIds = [first].concat(newIds);
		this._onDidChange.fire(this);
	}

	get trackedInitialRange(): Range {
		const [first] = this._decorationIds;
		return this._textModel.getDecorationRange(first) ?? new Range(1, 1, 1, 1);
	}

	get value(): Range {
		let result: Range | undefined;
		for (const id of this._decorationIds) {
			const range = this._textModel.getDecorationRange(id);
			if (range) {
				if (!result) {
					result = range;
				} else {
					result = Range.plusRange(result, range);
				}
			}
		}
		return result!;
	}
}

export class Session {

	private _lastInput: SessionPrompt | undefined;
	private _lastExpansionState: ExpansionState | undefined;
	private _isUnstashed: boolean = false;
	private readonly _exchange: SessionExchange[] = [];
	private readonly _startTime = new Date();
	private readonly _teldata: Partial<TelemetryData>;

	readonly textModelNAltVersion: number;
	private _textModelNSnapshotAltVersion: number | undefined;

	constructor(
		readonly editMode: EditMode,
		readonly editor: ICodeEditor,
		readonly textModel0: ITextModel,
		readonly textModelN: ITextModel,
		readonly provider: IInlineChatSessionProvider,
		readonly session: IInlineChatSession,
		readonly wholeRange: SessionWholeRange
	) {
		this.textModelNAltVersion = textModelN.getAlternativeVersionId();
		this._teldata = {
			extension: provider.debugName,
			startTime: this._startTime.toISOString(),
			edits: false,
			finishedByEdit: false,
			rounds: '',
			undos: '',
			editMode
		};
	}

	addInput(input: SessionPrompt): void {
		this._lastInput = input;
	}

	get lastInput() {
		return this._lastInput;
	}

	get isUnstashed(): boolean {
		return this._isUnstashed;
	}

	markUnstashed() {
		this._isUnstashed = true;
	}

	get lastExpansionState(): ExpansionState | undefined {
		return this._lastExpansionState;
	}

	set lastExpansionState(state: ExpansionState) {
		this._lastExpansionState = state;
	}

	get textModelNSnapshotAltVersion(): number | undefined {
		return this._textModelNSnapshotAltVersion;
	}

	createSnapshot(): void {
		this._textModelNSnapshotAltVersion = this.textModelN.getAlternativeVersionId();
	}

	addExchange(exchange: SessionExchange): void {
		this._isUnstashed = false;
		const newLen = this._exchange.push(exchange);
		this._teldata.rounds += `${newLen}|`;
	}

	get exchanges(): Iterable<SessionExchange> {
		return this._exchange;
	}

	get lastExchange(): SessionExchange | undefined {
		return this._exchange[this._exchange.length - 1];
	}

	get hasChangedText(): boolean {
		return !this.textModel0.equalsTextBuffer(this.textModelN.getTextBuffer());
	}

	asChangedText(changes: readonly LineRangeMapping[]): string | undefined {
		if (changes.length === 0) {
			return undefined;
		}

		let startLine = Number.MAX_VALUE;
		let endLine = Number.MIN_VALUE;
		for (const change of changes) {
			startLine = Math.min(startLine, change.modified.startLineNumber);
			endLine = Math.max(endLine, change.modified.endLineNumberExclusive);
		}

		return this.textModelN.getValueInRange(new Range(startLine, 1, endLine, Number.MAX_VALUE));
	}

	recordExternalEditOccurred(didFinish: boolean) {
		this._teldata.edits = true;
		this._teldata.finishedByEdit = didFinish;
	}

	asTelemetryData(): TelemetryData {
		return <TelemetryData>{
			...this._teldata,
			endTime: new Date().toISOString(),
		};
	}

	asRecording(): Recording {
		const result: Recording = {
			session: this.session,
			when: this._startTime,
			exchanges: []
		};
		for (const exchange of this._exchange) {
			const response = exchange.response;
			if (response instanceof ReplyResponse) {
				result.exchanges.push({ prompt: exchange.prompt.value, res: response.raw });
			}
		}
		return result;
	}
}


export class SessionPrompt {

	private _attempt: number = 0;

	constructor(
		readonly value: string,
	) { }

	get attempt() {
		return this._attempt;
	}

	retry() {
		const result = new SessionPrompt(this.value);
		result._attempt = this._attempt + 1;
		return result;
	}
}

export class SessionExchange {

	constructor(
		readonly prompt: SessionPrompt,
		readonly response: ReplyResponse | EmptyResponse | ErrorResponse
	) { }
}

export class EmptyResponse {

}

export class ErrorResponse {

	readonly message: string;
	readonly isCancellation: boolean;

	constructor(
		readonly error: any
	) {
		this.message = toErrorMessage(error, false);
		this.isCancellation = isCancellationError(error);
	}
}

export class ReplyResponse {

	readonly allLocalEdits: TextEdit[][] = [];
	readonly untitledTextModel: IUntitledTextEditorModel | undefined;
	readonly workspaceEdit: WorkspaceEdit | undefined;

	readonly responseType: InlineChatResponseTypes;

	constructor(
		readonly raw: IInlineChatBulkEditResponse | IInlineChatEditResponse,
		readonly mdContent: IMarkdownString,
		localUri: URI,
		readonly modelAltVersionId: number,
		progressEdits: TextEdit[][],
		readonly requestId: string,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {

		const editsMap = new ResourceMap<TextEdit[][]>();

		editsMap.set(localUri, [...progressEdits]);

		if (raw.type === InlineChatResponseType.EditorEdit) {
			//
			editsMap.get(localUri)!.push(raw.edits);

		} else if (raw.type === InlineChatResponseType.BulkEdit) {
			//
			const edits = ResourceEdit.convert(raw.edits);

			for (const edit of edits) {
				if (edit instanceof ResourceFileEdit) {
					if (edit.newResource && !edit.oldResource) {
						editsMap.set(edit.newResource, []);
						if (edit.options.contents) {
							console.warn('CONTENT not supported');
						}
					}
				} else if (edit instanceof ResourceTextEdit) {
					//
					const array = editsMap.get(edit.resource);
					if (array) {
						array.push([edit.textEdit]);
					} else {
						editsMap.set(edit.resource, [[edit.textEdit]]);
					}
				}
			}
		}

		let needsWorkspaceEdit = false;

		for (const [uri, edits] of editsMap) {

			const flatEdits = edits.flat();
			if (flatEdits.length === 0) {
				editsMap.delete(uri);
				continue;
			}

			const isLocalUri = isEqual(uri, localUri);
			needsWorkspaceEdit = needsWorkspaceEdit || (uri.scheme !== Schemas.untitled && !isLocalUri);

			if (uri.scheme === Schemas.untitled && !isLocalUri && !this.untitledTextModel) { //TODO@jrieken the first untitled model WINS
				const langSelection = this._languageService.createByFilepathOrFirstLine(uri, undefined);
				const untitledTextModel = this._textFileService.untitled.create({
					associatedResource: uri,
					languageId: langSelection.languageId
				});
				this.untitledTextModel = untitledTextModel;

				untitledTextModel.resolve().then(async () => {
					const model = untitledTextModel.textEditorModel!;
					model.applyEdits(flatEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
				});
			}
		}

		this.allLocalEdits = editsMap.get(localUri) ?? [];

		if (needsWorkspaceEdit) {
			const workspaceEdits: IWorkspaceTextEdit[] = [];
			for (const [uri, edits] of editsMap) {
				for (const edit of edits.flat()) {
					workspaceEdits.push({ resource: uri, textEdit: edit, versionId: undefined });
				}
			}
			this.workspaceEdit = { edits: workspaceEdits };
		}


		const hasEdits = editsMap.size > 0;
		const hasMessage = mdContent.value.length > 0;
		if (hasEdits && hasMessage) {
			this.responseType = InlineChatResponseTypes.Mixed;
		} else if (hasEdits) {
			this.responseType = InlineChatResponseTypes.OnlyEdits;
		} else if (hasMessage) {
			this.responseType = InlineChatResponseTypes.OnlyMessages;
		} else {
			this.responseType = InlineChatResponseTypes.Empty;
		}
	}
}
