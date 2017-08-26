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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const MAX_DECORATORS = 500;

@editorContribution
export class ColorController extends Disposable implements IEditorContribution {

	private static ID: string = 'editor.contrib.colorController';

	public static get(editor: ICommonCodeEditor): ColorController {
		return editor.getContribution<ColorController>(ColorController.ID);
	}

	private _isEnabled: boolean;
	private _decorations: string[];
	private _decorationsTypes: { [key: string]: boolean };

	constructor(
		private _editor: ICodeEditor,
		@ICodeEditorService private _codeEditorService: ICodeEditorService,
		@IConfigurationService private _configurationService: IConfigurationService,
	) {
		super();
		this._isEnabled = this.isEnabled();
		this._decorations = [];
		this._decorationsTypes = {};
		this._register(_editor.onDidChangeModel((e) => {
			this._isEnabled = this.isEnabled();
			this.triggerUpdateDecorations();
		}));
		this._register(_editor.onDidChangeModelContent((e) => {
			setTimeout(() => this.triggerUpdateDecorations(), 0);
		}));
		this._register(_configurationService.onDidUpdateConfiguration((e) => {
			let prevIsEnabled = this._isEnabled;
			this._isEnabled = this.isEnabled();
			if (prevIsEnabled !== this._isEnabled) {
				this.triggerUpdateDecorations(true);
			}
		}));
		this._register(_editor.onDidChangeModelLanguage((e) => {
			let prevIsEnabled = this._isEnabled;
			this._isEnabled = this.isEnabled();
			if (prevIsEnabled !== this._isEnabled) {
				this.triggerUpdateDecorations(true);
			}
		}));

		this._register(ColorProviderRegistry.onDidChange((e) => this.triggerUpdateDecorations()));
	}

	isEnabled(): boolean {
		const model = this._editor.getModel();
		if (!model) {
			return false;
		}
		const languageId = model.getLanguageIdentifier();
		// handle deprecated settings. [languageId].colorDecorators.enable
		let deprecatedConfig = this._configurationService.getConfiguration(languageId.language);
		if (deprecatedConfig) {
			let colorDecorators = deprecatedConfig['colorDecorators']; // deprecatedConfig.valueOf('.colorDecorators.enable');
			if (colorDecorators && colorDecorators['enable'] !== undefined) {
				return colorDecorators['enable'];
			}
		}

		return this._editor.getConfiguration().contribInfo.colorDecorators;
	}

	triggerUpdateDecorations(settingsChanges = false) {
		if (!this._isEnabled) {
			if (settingsChanges) {
				// Users turn it off.
				this._editor.changeDecorations((changeAccessor) => {
					this._decorations = changeAccessor.deltaDecorations(this._decorations, []);
				});
				for (let subType in this._decorationsTypes) {
					this._codeEditorService.removeDecorationType(subType);
				}
			}
			return;
		}

		getColors(this._editor.getModel()).then((colorInfos) => {
			let decorations = [];
			let newDecorationsTypes: { [key: string]: boolean } = {};

			for (let i = 0; i < colorInfos.length && decorations.length < MAX_DECORATORS; i++) {
				const { red, green, blue, alpha } = colorInfos[i].color;
				const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
				let subKey = hash(rgba).toString(16);
				let color = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
				let key = 'colorBox-' + subKey;

				if (!this._decorationsTypes[key] && !newDecorationsTypes[key]) {
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
				}

				newDecorationsTypes[key] = true;
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

			for (let subType in this._decorationsTypes) {
				if (!newDecorationsTypes[subType]) {
					this._codeEditorService.removeDecorationType(subType);
				}
			}

			this._editor.changeDecorations((changeAccessor) => {
				this._decorations = changeAccessor.deltaDecorations(this._decorations, decorations);
			});
		});
	}

	getId(): string {
		return ColorController.ID;
	}

	public dispose(): void {
		for (let subType in this._decorationsTypes) {
			this._codeEditorService.removeDecorationType(subType);
		}
		super.dispose();
	}
}