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
import { Session, SessionWholeRange, TelemetryData, TelemetryDataClassification } from './inlineChatSession';

type SessionData = {
	session: Session;
	store: IDisposable;
};

export class InlineChatSessionService implements IInlineChatSessionService {

	declare _serviceBrand: undefined;

	private readonly _onWillStartSession = new Emitter<IActiveCodeEditor>();
	readonly onWillStartSession: Event<IActiveCodeEditor> = this._onWillStartSession.event;

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

		this._onDidEndSession.fire({ editor, session });
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
