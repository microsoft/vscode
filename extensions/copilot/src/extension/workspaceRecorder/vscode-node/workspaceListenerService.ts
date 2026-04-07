/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, env } from 'vscode';
import { DocumentEventLogEntryData } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IRecordableEditorLogEntry, IRecordableLogEntry, ITextModelEditReasonMetadata, IWorkspaceListenerService } from '../common/workspaceListenerService';

export class WorkspacListenerService extends Disposable implements IWorkspaceListenerService {
	readonly _serviceBrand = undefined;

	private readonly _onStructuredData = this._register(new Emitter<IRecordableLogEntry | IRecordableEditorLogEntry>());
	readonly onStructuredData = this._onStructuredData.event;

	private readonly _onHandleChangeReason = this._register(new Emitter<{ documentUri: string; documentVersion: number; reason: string; metadata: ITextModelEditReasonMetadata }>());
	readonly onHandleChangeReason = this._onHandleChangeReason.event;

	constructor() {
		super();

		this._register(new StructuredLoggerReceiver<IRecordableLogEntry | IRecordableEditorLogEntry>('editor.inlineSuggest.logChangeReason.commandId', data => this._handleStructuredLogData(data)));
		this._register(new StructuredLoggerReceiver<IRecordableLogEntry | IRecordableEditorLogEntry>('editor.inlineSuggest.logFetch.commandId', data => this._handleStructuredLogData(data)));
	}

	private _handleStructuredLogData(data: IRecordableLogEntry | IRecordableEditorLogEntry) {
		this._onStructuredData.fire(data);

		const d = data as DocumentEventLogEntryData & IRecordableEditorLogEntry;
		if (d.sourceId === 'TextModel.setChangeReason') {
			this._onHandleChangeReason.fire({
				documentUri: d.modelUri.toString(),
				documentVersion: d.modelVersion,
				reason: d.source,
				metadata: d,
			});
		}
	}
}

class StructuredLoggerReceiver<T> extends Disposable {
	constructor(
		key: string,
		handler: (data: T) => void,
	) {
		super();

		const channel = env.getDataChannel<T>('structuredLogger:' + key);
		this._register(channel.onDidReceiveData(e => {
			handler(e.data);
		}));

		const contextKey = 'structuredLogger.enabled:' + key;
		setContextKey(contextKey, true);
		this._register({
			dispose: () => {
				setContextKey(contextKey, undefined);
			}
		});
	}
}

function setContextKey(key: string, value: any) {
	commands.executeCommand('setContext', key, value);
}
