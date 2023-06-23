/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { TextEdit } from 'vs/editor/common/languages';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { EditMode, IInlineChatSessionProvider, IInlineChatSession, IInlineChatBulkEditResponse, IInlineChatEditResponse, IInlineChatMessageResponse, IInlineChatResponse, IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isCancellationError } from 'vs/base/common/errors';
import { LineRangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { raceCancellation } from 'vs/base/common/async';

export type Recording = {
	when: Date;
	session: IInlineChatSession;
	exchanges: { prompt: string; res: IInlineChatResponse }[];
};

type TelemetryData = {
	extension: string;
	rounds: string;
	undos: string;
	edits: boolean;
	finishedByEdit: boolean;
	startTime: string;
	endTime: string;
	editMode: string;
};

type TelemetryDataClassification = {
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

class SessionWholeRange {

	private static readonly _options = { description: 'inlineChat/session/wholeRange' };

	private readonly _onDidChange = new Emitter<this>();
	readonly onDidChange: Event<this> = this._onDidChange.event;

	private readonly _decorationIds: string[] = [];

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
	private _lastTextModelChanges: readonly LineRangeMapping[] | undefined;
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

	get lastTextModelChanges() {
		return this._lastTextModelChanges ?? [];
	}

	set lastTextModelChanges(changes: readonly LineRangeMapping[]) {
		this._lastTextModelChanges = changes;
	}

	get hasChangedText(): boolean {
		return !this.textModel0.equalsTextBuffer(this.textModelN.getTextBuffer());
	}

	asChangedText(): string | undefined {
		if (!this._lastTextModelChanges || this._lastTextModelChanges.length === 0) {
			return undefined;
		}

		let startLine = Number.MAX_VALUE;
		let endLine = Number.MIN_VALUE;
		for (const change of this._lastTextModelChanges) {
			startLine = Math.min(startLine, change.modifiedRange.startLineNumber);
			endLine = Math.max(endLine, change.modifiedRange.endLineNumberExclusive);
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
			if (response instanceof MarkdownResponse || response instanceof EditResponse) {
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
		readonly response: MarkdownResponse | EditResponse | EmptyResponse | ErrorResponse
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

export class MarkdownResponse {
	constructor(
		readonly localUri: URI,
		readonly raw: IInlineChatMessageResponse
	) { }
}

export class EditResponse {

	readonly localEdits: TextEdit[] = [];
	readonly singleCreateFileEdit: { uri: URI; edits: Promise<TextEdit>[] } | undefined;
	readonly workspaceEdits: ResourceEdit[] | undefined;
	readonly workspaceEditsIncludeLocalEdits: boolean = false;

	constructor(
		localUri: URI,
		readonly modelAltVersionId: number,
		readonly raw: IInlineChatBulkEditResponse | IInlineChatEditResponse
	) {
		if (raw.type === 'editorEdit') {
			//
			this.localEdits = raw.edits;
			this.singleCreateFileEdit = undefined;
			this.workspaceEdits = undefined;

		} else {
			//
			const edits = ResourceEdit.convert(raw.edits);
			this.workspaceEdits = edits;

			let isComplexEdit = false;

			for (const edit of edits) {
				if (edit instanceof ResourceFileEdit) {
					if (!isComplexEdit && edit.newResource && !edit.oldResource) {
						// file create
						if (this.singleCreateFileEdit) {
							isComplexEdit = true;
							this.singleCreateFileEdit = undefined;
						} else {
							this.singleCreateFileEdit = { uri: edit.newResource, edits: [] };
							if (edit.options.contents) {
								this.singleCreateFileEdit.edits.push(edit.options.contents.then(x => ({ range: new Range(1, 1, 1, 1), text: x.toString() })));
							}
						}
					}
				} else if (edit instanceof ResourceTextEdit) {
					//
					if (isEqual(edit.resource, localUri)) {
						this.localEdits.push(edit.textEdit);
						this.workspaceEditsIncludeLocalEdits = true;

					} else if (isEqual(this.singleCreateFileEdit?.uri, edit.resource)) {
						this.singleCreateFileEdit!.edits.push(Promise.resolve(edit.textEdit));
					} else {
						isComplexEdit = true;
					}
				}
			}

			if (isComplexEdit) {
				this.singleCreateFileEdit = undefined;
			}
		}
	}
}

export interface ISessionKeyComputer {
	getComparisonKey(editor: ICodeEditor, uri: URI): string;
}

export const IInlineChatSessionService = createDecorator<IInlineChatSessionService>('IInlineChatSessionService');

export interface IInlineChatSessionService {
	_serviceBrand: undefined;

	onWillStartSession: Event<IActiveCodeEditor>;

	createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: IRange }, token: CancellationToken): Promise<Session | undefined>;

	getSession(editor: ICodeEditor, uri: URI): Session | undefined;

	releaseSession(session: Session): void;

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable;

	//

	recordings(): readonly Recording[];
}

type SessionData = {
	session: Session;
	store: IDisposable;
};

export class InlineChatSessionService implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _onWillStartSession = new Emitter<IActiveCodeEditor>();
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _sessions = new Map<string, SessionData>();
	private readonly _keyComputers = new Map<string, ISessionKeyComputer>();
	private _recordings: Recording[] = [];

	constructor(
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILogService private readonly _logService: ILogService,
	) { }

	dispose() {
		this._onWillStartSession.dispose();
		this._sessions.forEach(x => x.store.dispose());
		this._sessions.clear();
	}

	async createSession(editor: IActiveCodeEditor, options: { editMode: EditMode; wholeRange?: Range }, token: CancellationToken): Promise<Session | undefined> {

		const provider = Iterable.first(this._inlineChatService.getAllProvider());
		if (!provider) {
			this._logService.trace('[IE] NO provider found');
			return undefined;
		}

		this._onWillStartSession.fire(editor);

		const textModel = editor.getModel();
		const selection = editor.getSelection();
		let raw: IInlineChatSession | undefined | null;
		try {
			raw = await raceCancellation(
				Promise.resolve(provider.prepareInlineChatSession(textModel, selection, token)),
				token
			);
		} catch (error) {
			this._logService.error('[IE] FAILED to prepare session', provider.debugName);
			this._logService.error(error);
			return undefined;
		}
		if (!raw) {
			this._logService.trace('[IE] NO session', provider.debugName);
			return undefined;
		}
		this._logService.trace('[IE] NEW session', provider.debugName);

		this._logService.trace(`[IE] creating NEW session for ${editor.getId()},  ${provider.debugName}`);
		const store = new DisposableStore();

		// create: keep a reference to prevent disposal of the "actual" model
		const refTextModelN = await this._textModelService.createModelReference(textModel.uri);
		store.add(refTextModelN);

		// create: keep a snapshot of the "actual" model
		const textModel0 = this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(textModel.createSnapshot()),
			{ languageId: textModel.getLanguageId(), onDidChange: Event.None },
			undefined, true
		);
		store.add(textModel0);

		let wholeRange = options.wholeRange;
		if (!wholeRange) {
			wholeRange = raw.wholeRange ? Range.lift(raw.wholeRange) : editor.getSelection();
		}

		// expand to whole lines
		wholeRange = new Range(wholeRange.startLineNumber, 1, wholeRange.endLineNumber, textModel.getLineMaxColumn(wholeRange.endLineNumber));

		// install managed-marker for the decoration range
		const wholeRangeMgr = new SessionWholeRange(textModel, wholeRange);
		store.add(wholeRangeMgr);

		const session = new Session(options.editMode, editor, textModel0, textModel, provider, raw, wholeRangeMgr);

		// store: key -> session
		const key = this._key(editor, textModel.uri);
		if (this._sessions.has(key)) {
			store.dispose();
			throw new Error(`Session already stored for ${key}`);
		}
		this._sessions.set(key, { session, store });
		return session;
	}

	releaseSession(session: Session): void {

		const { editor } = session;

		// cleanup
		for (const [key, value] of this._sessions) {
			if (value.session === session) {
				value.store.dispose();
				this._sessions.delete(key);
				this._logService.trace(`[IE] did RELEASED session for ${editor.getId()}, ${session.provider.debugName}`);
				break;
			}
		}

		// keep recording
		const newLen = this._recordings.unshift(session.asRecording());
		if (newLen > 5) {
			this._recordings.pop();
		}

		// send telemetry
		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', session.asTelemetryData());
	}

	getSession(editor: ICodeEditor, uri: URI): Session | undefined {
		const key = this._key(editor, uri);
		return this._sessions.get(key)?.session;
	}

	private _key(editor: ICodeEditor, uri: URI): string {
		const item = this._keyComputers.get(uri.scheme);
		return item
			? item.getComparisonKey(editor, uri)
			: `${editor.getId()}@${uri.toString()}`;

	}

	registerSessionKeyComputer(scheme: string, value: ISessionKeyComputer): IDisposable {
		this._keyComputers.set(scheme, value);
		return toDisposable(() => this._keyComputers.delete(scheme));
	}

	// --- debug

	recordings(): readonly Recording[] {
		return this._recordings;
	}

}
