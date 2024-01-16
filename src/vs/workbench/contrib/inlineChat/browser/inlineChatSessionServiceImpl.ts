/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { EditMode, IInlineChatSession, IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Range } from 'vs/editor/common/core/range';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { raceCancellation } from 'vs/base/common/async';
import { Recording, IInlineChatSessionService, ISessionKeyComputer } from './inlineChatSessionService';
import { HunkData, Session, SessionWholeRange, TelemetryData, TelemetryDataClassification } from './inlineChatSession';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';

type SessionData = {
	editor: ICodeEditor;
	session: Session;
	store: IDisposable;
};

export class InlineChatSessionServiceImpl implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _onWillStartSession = new Emitter<IActiveCodeEditor>();
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

	private readonly _onDidMoveSession = new Emitter<{ session: Session; editor: ICodeEditor }>();
	readonly onDidMoveSession: Event<{ session: Session; editor: ICodeEditor }> = this._onDidMoveSession.event;

	private readonly _onDidEndSession = new Emitter<{ editor: ICodeEditor; session: Session }>();
	readonly onDidEndSession: Event<{ editor: ICodeEditor; session: Session }> = this._onDidEndSession.event;

	private readonly _sessions = new Map<string, SessionData>();
	private readonly _keyComputers = new Map<string, ISessionKeyComputer>();
	private _recordings: Recording[] = [];

	constructor(
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@ILogService private readonly _logService: ILogService
	) { }

	dispose() {
		this._onWillStartSession.dispose();
		this._onDidEndSession.dispose();
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


		// install managed-marker for the decoration range
		const wholeRangeMgr = new SessionWholeRange(textModel, wholeRange);
		store.add(wholeRangeMgr);

		const hunkData = new HunkData(this._editorWorkerService, textModel0, textModel);
		store.add(hunkData);

		const session = new Session(options.editMode, textModel0, textModel, provider, raw, wholeRangeMgr, hunkData);

		// store: key -> session
		const key = this._key(editor, textModel.uri);
		if (this._sessions.has(key)) {
			store.dispose();
			throw new Error(`Session already stored for ${key}`);
		}
		this._sessions.set(key, { session, editor, store });
		return session;
	}

	moveSession(session: Session, target: ICodeEditor): void {
		const newKey = this._key(target, session.textModelN.uri);
		const existing = this._sessions.get(newKey);
		if (existing) {
			if (existing.session !== session) {
				throw new Error(`Cannot move session because the target editor already/still has one`);
			} else {
				// noop
				return;
			}
		}

		let found = false;
		for (const [oldKey, data] of this._sessions) {
			if (data.session === session) {
				found = true;
				this._sessions.delete(oldKey);
				this._sessions.set(newKey, { ...data, editor: target });
				this._logService.trace(`[IE] did MOVE session for ${data.editor.getId()} to NEW EDITOR ${target.getId()}, ${session.provider.debugName}`);
				this._onDidMoveSession.fire({ session, editor: target });
				break;
			}
		}
		if (!found) {
			throw new Error(`Cannot move session because it is not stored`);
		}
	}

	releaseSession(session: Session): void {

		let data: SessionData | undefined;

		// cleanup
		for (const [key, value] of this._sessions) {
			if (value.session === session) {
				data = value;
				value.store.dispose();
				this._sessions.delete(key);
				this._logService.trace(`[IE] did RELEASED session for ${value.editor.getId()}, ${session.provider.debugName}`);
				break;
			}
		}

		if (!data) {
			// double remove
			return;
		}

		// keep recording
		const newLen = this._recordings.unshift(session.asRecording());
		if (newLen > 5) {
			this._recordings.pop();
		}

		// send telemetry
		this._telemetryService.publicLog2<TelemetryData, TelemetryDataClassification>('interactiveEditor/session', session.asTelemetryData());

		this._onDidEndSession.fire({ editor: data.editor, session });
	}

	getCodeEditor(session: Session): ICodeEditor {
		for (const [, data] of this._sessions) {
			if (data.session === session) {
				return data.editor;
			}
		}
		throw new Error('session not found');
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
