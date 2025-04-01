/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorunWithStore } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { IRecordableEditorLogEntry, StructuredLogger } from '../structuredLogger.js';

export class TextModelChangeRecorder extends Disposable {
	private readonly _structuredLogger = this._register(this._instantiationService.createInstance(StructuredLogger.cast<IRecordableEditorLogEntry & { source: string }>(),
		'editor.inlineSuggest.logChangeReason.commandId'
	));

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._register(autorunWithStore((reader, store) => {
			if (!(this._editor instanceof CodeEditorWidget)) { return; }
			if (!this._structuredLogger.isEnabled.read(reader)) { return; }

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
					const data: IRecordableEditorLogEntry & { source: string } = {
						sourceId: 'TextModel.setChangeReason',
						source: source,
						time: Date.now(),
						modelUri: tm.uri.toString(),
						modelVersion: tm.getVersionId(),
					};
					this._structuredLogger.log(data);
				}
				sources.length = 0;
			}));

		}));
	}
}
