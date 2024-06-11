/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from 'vs/base/common/equals';
import { Disposable } from 'vs/base/common/lifecycle';
import { derived, derivedOpts } from 'vs/base/common/observable';
import 'vs/css!./placeholderText';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { observableCodeEditor } from 'vs/editor/browser/observableCodeEditor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ghostTextForeground } from 'vs/editor/common/core/editorColorRegistry';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDeltaDecoration, InjectedTextCursorStops } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { registerColor } from 'vs/platform/theme/common/colorUtils';

/**
 * Use the editor option to set the placeholder text.
*/
export class PlaceholderTextContribution extends Disposable implements IEditorContribution {
	public static get(editor: ICodeEditor): PlaceholderTextContribution {
		return editor.getContribution<PlaceholderTextContribution>(PlaceholderTextContribution.ID)!;
	}

	public static readonly ID = 'editor.contrib.placeholderText';
	private readonly _editorObs = observableCodeEditor(this._editor);

	private readonly _placeholderText = this._editorObs.getOption(EditorOption.placeholder);

	private readonly _decorationOptions = derivedOpts<{ placeholder: string } | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
		const p = this._placeholderText.read(reader);
		if (!p) { return undefined; }
		if (!this._editorObs.valueIsEmpty.read(reader)) { return undefined; }

		return { placeholder: p };
	});

	private readonly _decorations = derived<IModelDeltaDecoration[]>(this, (reader) => {
		const options = this._decorationOptions.read(reader);
		if (!options) { return []; }

		return [{
			range: new Range(1, 1, 1, 1),
			options: {
				description: 'placeholder',
				showIfCollapsed: true,
				after: {
					content: options.placeholder,
					cursorStops: InjectedTextCursorStops.None,
					inlineClassName: 'placeholder-text'
				}
			}
		}];
	});

	constructor(
		private readonly _editor: ICodeEditor,
	) {
		super();

		this._register(this._editorObs.setDecorations(this._decorations));
	}
}

registerEditorContribution(PlaceholderTextContribution.ID, PlaceholderTextContribution, EditorContributionInstantiation.Eager);

registerColor('editor.placeholder.foreground', { dark: ghostTextForeground, light: ghostTextForeground, hcDark: ghostTextForeground, hcLight: ghostTextForeground }, localize('placeholderForeground', 'Foreground color of the placeholder text in the editor.'));
