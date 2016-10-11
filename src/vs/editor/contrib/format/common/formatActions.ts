/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { editorAction, ServicesAccessor, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import * as modes from 'vs/editor/common/modes';
import { getOnTypeFormattingEdits, getDocumentFormattingEdits, getDocumentRangeFormattingEdits, FormatterConfiguration } from '../common/format';
import { EditOperationsCommand } from './formatCommand';
import { Range } from 'vs/editor/common/core/range';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

import ModeContextKeys = editorCommon.ModeContextKeys;
import EditorContextKeys = editorCommon.EditorContextKeys;

@commonEditorContribution
class FormatOnType implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.autoFormat';

	private editor: editorCommon.ICommonCodeEditor;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: editorCommon.ICommonCodeEditor) {
		this.editor = editor;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelMode(() => this.update()));
		this.callOnDispose.push(modes.OnTypeFormattingEditProviderRegistry.onDidChange(this.update, this));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().contribInfo.formatOnType) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		var model = this.editor.getModel();

		// no support
		var [support] = modes.OnTypeFormattingEditProviderRegistry.ordered(model);
		if (!support || !support.autoFormatTriggerCharacters) {
			return;
		}

		// register typing listeners that will trigger the format
		support.autoFormatTriggerCharacters.forEach(ch => {
			this.callOnModel.push(this.editor.addTypingListener(ch, this.trigger.bind(this, ch)));
		});
	}

	private trigger(ch: string): void {

		if (this.editor.getSelections().length > 1) {
			return;
		}

		var model = this.editor.getModel(),
			position = this.editor.getPosition(),
			canceled = false;

		// install a listener that checks if edits happens before the
		// position on which we format right now. If so, we won't
		// apply the format edits
		var unbind = this.editor.onDidChangeModelRawContent((e: editorCommon.IModelContentChangedEvent) => {
			if (e.changeType === editorCommon.EventType.ModelRawContentChangedFlush) {
				// a model.setValue() was called
				canceled = true;
			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLineChanged) {
				var changedLine = (<editorCommon.IModelContentChangedLineChangedEvent>e).lineNumber;
				canceled = changedLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesInserted) {
				var insertLine = (<editorCommon.IModelContentChangedLinesInsertedEvent>e).fromLineNumber;
				canceled = insertLine <= position.lineNumber;

			} else if (e.changeType === editorCommon.EventType.ModelRawContentChangedLinesDeleted) {
				var deleteLine2 = (<editorCommon.IModelContentChangedLinesDeletedEvent>e).toLineNumber;
				canceled = deleteLine2 <= position.lineNumber;
			}

			if (canceled) {
				// cancel only once
				unbind.dispose();
			}
		});

		let modelOpts = model.getOptions();

		getOnTypeFormattingEdits(model, position, ch, {
			tabSize: modelOpts.tabSize,
			insertSpaces: modelOpts.insertSpaces
		}).then(edits => {

			unbind.dispose();

			if (canceled || arrays.isFalsyOrEmpty(edits)) {
				return;
			}

			this.editor.executeCommand(this.getId(), new EditOperationsCommand(edits, this.editor.getSelection()));

		}, (err) => {
			unbind.dispose();
			throw err;
		});
	}

	public getId(): string {
		return FormatOnType.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

@editorAction
export class FormatAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.format',
			label: nls.localize('formatAction.label', "Format Code"),
			alias: 'Format Code',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasFormattingProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_F,
				linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I }
			},
			menuOpts: {
				group: '1_modification',
				order: 1.3
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): TPromise<void> {

		const formattingPromise = this._format(accessor, editor);

		if (!formattingPromise) {
			return TPromise.as(void 0);
		}

		const editorSelection = editor.getSelection();
		const state = editor.captureState(editorCommon.CodeEditorStateFlag.Value, editorCommon.CodeEditorStateFlag.Position);

		// Receive formatted value from worker
		return formattingPromise.then(edits => {

			if (!state.validate(editor) || !edits || edits.length === 0) {
				return;
			}

			editor.executeCommand(this.id, new EditOperationsCommand(edits, editorSelection));
			editor.focus();
		});
	}

	private _format(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): TPromise<editorCommon.ISingleEditOperation[]> {

		const configurationService = accessor.get(IConfigurationService);
		const choiceService = accessor.get(IChoiceService);
		const config = FormatterConfiguration.get(configurationService);

		return this._tryFormat(editor.getModel(), editor.getSelection(), config).then(undefined, err => {

			if (err !== 'bad_config') {
				return TPromise.wrapError(err);
			}

			const options = [
				nls.localize('fmt.config.ignore', "Use default"),
				// nls.localize('fmt.config.delete', "Use default and remove configuration"),
				nls.localize('fmt.cancel', "Cancel"),
			];

			return choiceService.choose(Severity.Info, nls.localize('formatter.badConfig', "The configured formatter ({0}) isn't available but there is a default formatter", config[editor.getModel().getModeId()]), options).then(idx => {

				if (idx === 0) {
					return this._tryFormat(editor.getModel(), editor.getSelection(), {});
					// } else if (idx === 1) {
					// 	console.warn('TODO - update config!');
					// 	return this._tryFormat(editor.getModel(), editor.getSelection(), {});
				}

			}, err => {
				// nothing
			});
		});
	}

	private _tryFormat(model: editorCommon.IModel, range: Range, config: FormatterConfiguration): TPromise<editorCommon.ISingleEditOperation[]> {

		const {tabSize, insertSpaces} = model.getOptions();

		if (!range.isEmpty()) {
			// format selection if applicable
			if (FormatAction._isBadDocumentRangeFormatterConfig(model, config)) {
				return TPromise.wrapError('bad_config');
			}

			return getDocumentRangeFormattingEdits(model, range, { tabSize, insertSpaces }, config);

		} else {
			// formal full document, make it a special
			// case of format selection when no document
			// formatter is available
			const provider = modes.DocumentFormattingEditProviderRegistry.all(model);
			const all = (<{ name?: string }[]>provider).concat(modes.DocumentRangeFormattingEditProviderRegistry.all(model));
			if (all.length === 0) {
				return;
			}
			const pick = FormatterConfiguration.pick(all, model, config);
			if (!pick) {
				return TPromise.wrapError('bad_config');
			}
			if (all.indexOf(pick) < provider.length) {
				return getDocumentFormattingEdits(model, { tabSize, insertSpaces }, config);
			} else {
				return getDocumentRangeFormattingEdits(model, range, { tabSize, insertSpaces }, config);
			}
		}
	}

	private static _isBadDocumentRangeFormatterConfig(model: editorCommon.IModel, config: FormatterConfiguration): boolean {
		const all = modes.DocumentRangeFormattingEditProviderRegistry.ordered(model);
		return all.length > 0 && !FormatterConfiguration.pick(all, model, config);
	}
}
