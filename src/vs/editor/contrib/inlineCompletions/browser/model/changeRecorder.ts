/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorunWithStore } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { formatRecordableLogEntry, IRecordableEditorLogEntry, observableContextKey } from './inlineCompletionsSource.js';

export class TextModelChangeRecorder extends Disposable {
	private readonly _recordingLoggingEnabled = observableContextKey('editor.inlineSuggest.logChangeReason', this._contextKeyService).recomputeInitiallyAndOnChange(this._store);

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._register(autorunWithStore((reader, store) => {
			if (!(this._editor instanceof CodeEditorWidget)) { return; }
			if (!this._recordingLoggingEnabled.read(reader)) { return; }

			const sources: string[] = [];

			store.add(this._editor.onBeforeExecuteEdit(({ source }) => {
				if (source) {
					sources.push(source);
				}
			}));

			store.add(this._editor.onDidChangeModelContent(e => {
				const tm = this._editor.getModel();
				if (!tm) { return; }
				for (const source of sources) {
					this._logService.info(formatRecordableLogEntry<IRecordableEditorLogEntry & { source: string }>('TextModel.setChangeReason', {
						time: Date.now(),
						modelUri: tm.uri.toString(),
						modelVersion: tm.getVersionId(),
						source: source,
					}));
				}
				sources.length = 0;
			}));

		}));
	}
}
