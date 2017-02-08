/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as editorCommon from 'vs/editor/common/editorCommon';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';

@editorContribution
class CopyRichTextController extends Disposable implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.copyRichText';

	public static get(editor: editorCommon.ICommonCodeEditor): CopyRichTextController {
		return editor.getContribution<CopyRichTextController>(CopyRichTextController.ID);
	}

	private _editor: ICodeEditor;
	private _themeService: IThemeService;
	private _modeService: IModeService;
	private _handler: (event: any) => void;

	constructor(
		editor: ICodeEditor,
		@IModeService modeService: IModeService,
		@IThemeService themeService: IThemeService
	) {
		super();
		this._editor = editor;
		this._themeService = themeService;
		this._modeService = modeService;
		this._handler = (e: ClipboardEvent) => {
			if (e.target instanceof HTMLElement) {
				const target = <HTMLElement>e.target;
				if (target.nodeName && (target.nodeName.toLowerCase() === 'input' || target.nodeName.toLowerCase() === 'textarea')) {
					let richText = e.clipboardData.getData('text/html');
					if (richText) {
						let theme = this._themeService.getColorTheme();
						let globalSettings = theme.settings.filter(s => !s.scope);
						if (globalSettings.length > 0) {
							let backgroundColor = globalSettings[0].settings.background;
							e.clipboardData.setData('text/html', `<style>.monaco-editor-background { background-color: ${backgroundColor} }</style>\n${richText}`);
						}
					}
				}
			}
		};

		window.document.addEventListener('copy', this._handler);
	}

	public getId(): string {
		return CopyRichTextController.ID;
	}

	public dispose(): void {
		window.document.removeEventListener('copy', this._handler);
		super.dispose();
	}
}