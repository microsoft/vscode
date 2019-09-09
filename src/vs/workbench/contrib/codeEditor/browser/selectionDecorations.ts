/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IModelDeltaDecoration, MinimapPosition } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { editorSelectionBackground, minimapSelection } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId, IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

export class SelectionDecorations extends Disposable implements IEditorContribution {
	private readonly _editor: IActiveCodeEditor;
	private _minimapEnabled: boolean;
	private _decorations: string[] = [];
	private _decorationOptions: ModelDecorationOptions;
	private _selectionListener: IDisposable | undefined;
	private _toDispose: IDisposable[] = [];

	private static readonly ID = 'editor.contrib.selectionDecorations';

	constructor(
		editor: IActiveCodeEditor,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		this._editor = editor;
		this._minimapEnabled = this._editor.getOption(EditorOption.minimap).enabled;
		this._decorationOptions = ModelDecorationOptions.register({
			minimap: {
				color: themeColorFromId(editorSelectionBackground),
				position: MinimapPosition.Inline
			}
		});

		if (this._minimapEnabled) {
			this.registerCursorSelectionListener();
		}

		this._toDispose.push(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.minimap)) {
				this._minimapEnabled = this._editor.getOption(EditorOption.minimap).enabled;
				if (this._minimapEnabled && !this._selectionListener) {
					this.registerCursorSelectionListener();
				}

				if (!this._minimapEnabled && this._selectionListener) {
					this._selectionListener.dispose();
					this._selectionListener = undefined;
				}
			}
		}));

		this._toDispose.push(this.themeService.onThemeChange(_ => {
			this._decorationOptions = ModelDecorationOptions.register({
				minimap: {
					color: themeColorFromId(minimapSelection),
					position: MinimapPosition.Inline
				}
			});

			if (this._minimapEnabled) {
				this.updateDecorations();
			}
		}));
	}

	private updateDecorations(): void {
		this._editor.changeDecorations(accessor => {
			const selections = this._editor.getSelections();
			let newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(selections.length);
			for (let i = 0, len = selections.length; i < len; i++) {
				const selection = selections[i];

				newFindMatchesDecorations[i] = {
					range: selection,
					options: this._decorationOptions
				};
			}
			this._decorations = accessor.deltaDecorations(this._decorations, newFindMatchesDecorations);
		});
	}

	private registerCursorSelectionListener(): void {
		this._selectionListener = this._editor.onDidChangeCursorSelection(_ => this.updateDecorations());
	}

	public getId(): string {
		return SelectionDecorations.ID;
	}

	public dispose(): void {
		this._editor.deltaDecorations(this._decorations, []);
		this._toDispose.forEach(d => d.dispose());
		if (this._selectionListener) {
			this._selectionListener.dispose();
		}
	}
}

registerEditorContribution(SelectionDecorations);
