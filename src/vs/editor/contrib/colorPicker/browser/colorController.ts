/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from 'vs/base/common/lifecycle';
import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { getColors } from '../common/color';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { hash } from 'vs/base/common/hash';
import { ColorProviderRegistry } from 'vs/editor/common/modes';
import { RGBA } from 'vs/base/common/color';

const MAX_DECORATORS = 500;

@editorContribution
export class ColorController extends Disposable implements IEditorContribution {

	private static ID: string = 'editor.contrib.colorController';

	public static get(editor: ICommonCodeEditor): ColorController {
		return editor.getContribution<ColorController>(ColorController.ID);
	}

	private _decorations: string[];
	constructor(
		private _editor: ICodeEditor,
		@ICodeEditorService private _codeEditorService: ICodeEditorService
	) {
		super();
		this._decorations = [];
		this._register(_editor.onDidChangeModel((e) => this.triggerUpdateDecorations()));
		this._register(_editor.onDidChangeModelContent((e) => this.triggerUpdateDecorations()));
		this._register(_editor.onDidChangeModelLanguage((e) => this.triggerUpdateDecorations()));
		this._register(_editor.onDidChangeConfiguration((e) => this.triggerUpdateDecorations()));
		this._register(ColorProviderRegistry.onDidChange((e) => this.triggerUpdateDecorations()));
		this.triggerUpdateDecorations();
	}

	triggerUpdateDecorations(settingsChanges = false) {
		getColors(this._editor.getModel()).then((colorInfos) => {
			let decorations = [];

			for (let i = 0; i < colorInfos.length && decorations.length < MAX_DECORATORS; i++) {
				if (!colorInfos[i].renderDecorator) {
					continue;
				}
				const { red, green, blue, alpha } = colorInfos[i].color;
				const rgba = new RGBA(red * 255, green * 255, blue * 255, alpha * 255);
				let subKey = hash(rgba).toString(16);
				let color = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
				let key = 'colorBox-' + subKey;
				this._codeEditorService.registerDecorationType(key, {
					before: {
						contentText: ' ',
						border: 'solid 0.1em #000',
						margin: '0.1em 0.2em 0 0.2em',
						width: '0.8em',
						height: '0.8em',
						backgroundColor: color
					},
					dark: {
						before: {
							border: 'solid 0.1em #eee'
						}
					}
				});
				decorations.push({
					range: {
						startLineNumber: colorInfos[i].range.startLineNumber,
						startColumn: colorInfos[i].range.startColumn,
						endLineNumber: colorInfos[i].range.endLineNumber,
						endColumn: colorInfos[i].range.endColumn
					},
					options: this._codeEditorService.resolveDecorationOptions(key, true)
				});
			}

			this._editor.changeDecorations((changeAccessor) => {
				this._decorations = changeAccessor.deltaDecorations(this._decorations, decorations);
			});
		});
	}

	getId(): string {
		return ColorController.ID;
	}
}