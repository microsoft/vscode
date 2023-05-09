/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { TextEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { EditMode, IInteractiveEditorSessionProvider, IInteractiveEditorSession, IInteractiveEditorBulkEditResponse, IInteractiveEditorEditResponse, IInteractiveEditorMessageResponse, IInteractiveEditorResponse } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { Range } from 'vs/editor/common/core/range';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export type Recording = {
	when: Date;
	session: IInteractiveEditorSession;
	exchanges: { prompt: string; res: IInteractiveEditorResponse }[];
};

type TelemetryData = {
	extension: string;
	rounds: string;
	undos: string;
	edits: boolean;
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
	startTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session started' };
	endTime: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'When the session ended' };
	editMode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What edit mode was choosen: live, livePreview, preview' };
};

export class Session {

	private readonly _exchange: SessionExchange[] = [];
	private readonly _startTime = new Date();
	private readonly _teldata: Partial<TelemetryData>;

	constructor(
		readonly editMode: EditMode,
		readonly model0: ITextModel,
		readonly modelN: ITextModel,
		readonly provider: IInteractiveEditorSessionProvider,
		readonly session: IInteractiveEditorSession,
	) {
		this._teldata = {
			extension: provider.debugName,
			startTime: this._startTime.toISOString(),
			edits: false,
			rounds: '',
			undos: '',
			editMode
		};
	}

	addExchange(exchange: SessionExchange): void {
		const newLen = this._exchange.push(exchange);
		this._teldata.rounds += `${newLen}|`;
	}

	get lastExchange(): SessionExchange | undefined {
		return this._exchange[this._exchange.length - 1];
	}

	recordExternalEditOccurred() {
		this._teldata.edits = true;
	}

	asTelemetryData(): TelemetryData {
		return <TelemetryData>{
			...this._teldata,
			endTime: new Date().toISOString(),
		};
	}

	asRecording(): Recording {
		return {
			session: this.session,
			when: this._startTime,
			exchanges: this._exchange.map(e => ({ prompt: e.prompt, res: e.response.raw }))
		};
	}
}


export class SessionExchange {
	constructor(
		readonly prompt: string,
		readonly response: MarkdownResponse | EditResponse
	) { }
}

export class MarkdownResponse {
	constructor(
		readonly localUri: URI,
		readonly raw: IInteractiveEditorMessageResponse
	) { }
}

export class EditResponse {

	readonly localEdits: TextEdit[] = [];
	readonly singleCreateFileEdit: { uri: URI; edits: Promise<TextEdit>[] } | undefined;
	readonly workspaceEdits: ResourceEdit[] | undefined;
	readonly workspaceEditsIncludeLocalEdits: boolean = false;

	constructor(localUri: URI, readonly raw: IInteractiveEditorBulkEditResponse | IInteractiveEditorEditResponse) {
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

export const IInteractiveEditorSessionService = createDecorator<IInteractiveEditorSessionService>('IInteractiveEditorSessionService');

export interface IInteractiveEditorSessionService {
	_serviceBrand: undefined;

	retrieveSession(editor: ICodeEditor, uri: URI): Session | undefined;

	storeSession(editor: ICodeEditor, uri: URI, session: Session): void;

	releaseSession(editor: ICodeEditor, uri: URI, session: Session): void;

	//

	recordings(): readonly Recording[];
}


export class InteractiveEditorSessionService implements IInteractiveEditorSessionService {

	declare _serviceBrand: undefined;

	private readonly _sessions = new Map<ICodeEditor, ResourceMap<Session>>();
	private _recordings: Recording[] = [];

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	storeSession(editor: ICodeEditor, uri: URI, session: Session): void {
		let map = this._sessions.get(editor);
		if (!map) {
			map = new ResourceMap<Session>();
			this._sessions.set(editor, map);
		}
		if (map.has(uri)) {
			throw new Error(`Session already stored for ${uri}`);
		}
		map.set(uri, session);
	}

	releaseSession(editor: ICodeEditor, uri: URI, session: Session): void {

		// cleanup
		const map = this._sessions.get(editor);
		if (map) {
			map.delete(uri);
			if (map.size === 0) {
				this._sessions.delete(editor);
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

	retrieveSession(editor: ICodeEditor, uri: URI): Session | undefined {
		return this._sessions.get(editor)?.get(uri);
	}

	// --- debug

	recordings(): readonly Recording[] {
		return this._recordings;
	}

}
