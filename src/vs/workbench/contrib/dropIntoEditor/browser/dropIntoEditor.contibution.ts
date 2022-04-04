/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IDataTransferItem } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { performSnippetEdit } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { extractEditorsDropData } from 'vs/workbench/browser/dnd';
import { IDataTransfer } from 'vs/workbench/common/dnd';


export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	constructor(
		editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event));
	}

	private async onDropIntoEditor(editor: ICodeEditor, position: IPosition, dragEvent: DragEvent) {
		if (!dragEvent.dataTransfer || !editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const modelVersionNow = model.getVersionId();

		const textEditorDataTransfer: IDataTransfer = new Map<string, IDataTransferItem>();
		for (const item of dragEvent.dataTransfer.items) {
			if (item.kind === 'string') {
				const type = item.type;
				const asStringValue = new Promise<string>(resolve => item.getAsString(resolve));
				textEditorDataTransfer.set(type, {
					asString: () => asStringValue,
					value: undefined
				});
			}
		}

		if (!textEditorDataTransfer.has(Mimes.uriList.toLowerCase())) {
			const editorData = (await this._instantiationService.invokeFunction(extractEditorsDropData, dragEvent))
				.filter(input => input.resource)
				.map(input => input.resource!.toString());

			if (editorData.length) {
				const str = distinct(editorData).join('\n');
				textEditorDataTransfer.set(Mimes.uriList.toLowerCase(), {
					asString: () => Promise.resolve(str),
					value: undefined
				});
			}
		}

		if (textEditorDataTransfer.size === 0) {
			return;
		}

		const ordered = this._languageFeaturesService.documentOnDropEditProvider.ordered(model);
		for (const provider of ordered) {
			const edit = await provider.provideDocumentOnDropEdits(model, position, textEditorDataTransfer, CancellationToken.None);
			if (editor.getModel().getVersionId() !== modelVersionNow) {
				return;
			}

			if (edit) {
				performSnippetEdit(editor, edit);
				return;
			}
		}

		// TODO: default drop behavior
	}
}


registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController);
