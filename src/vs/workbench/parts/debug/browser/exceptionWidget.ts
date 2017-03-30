/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/exceptionWidget';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDebugService, IExceptionInfo } from 'vs/workbench/parts/debug/common/debug';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IThemeService, ITheme } from "vs/platform/theme/common/themeService";
import { Color } from "vs/base/common/color";
import { registerColor } from "vs/platform/theme/common/colorRegistry";
const $ = dom.$;

// theming

export const debugExceptionWidgetBorder = registerColor('debugExceptionWidgetBorder', { dark: '#a31515', light: '#a31515', hc: '#a31515' }, nls.localize('debugExceptionWidgetBorder', 'Exception widget border color.'));
export const debugExceptionWidgetBackground = registerColor('debugExceptionWidgetBackground', { dark: '#a3151540', light: '#a315150d', hc: '#a3151573' }, nls.localize('debugExceptionWidgetBackground', 'Exception widget background color.'));

export class ExceptionWidget extends ZoneWidget {

	private _backgroundColor: Color;

	constructor(editor: ICodeEditor, private exceptionInfo: IExceptionInfo, private lineNumber: number,
		@IContextViewService private contextViewService: IContextViewService,
		@IDebugService private debugService: IDebugService,
		@IThemeService themeService: IThemeService
	) {
		super(editor, { showFrame: true, showArrow: true, frameWidth: 1 });

		this._backgroundColor = Color.white;

		this._applyTheme(themeService.getTheme());
		this._disposables.add(themeService.onThemeChange(this._applyTheme.bind(this)));


		this.create();
		const onDidLayoutChangeScheduler = new RunOnceScheduler(() => this._doLayout(undefined, undefined), 50);
		this._disposables.add(this.editor.onDidLayoutChange(() => onDidLayoutChangeScheduler.schedule()));
		this._disposables.add(onDidLayoutChangeScheduler);
	}

	private _applyTheme(theme: ITheme) {
		this._backgroundColor = theme.getColor(debugExceptionWidgetBackground);
		let frameColor = theme.getColor(debugExceptionWidgetBorder);
		this.style({
			arrowColor: frameColor,
			frameColor: frameColor
		}); // style() will trigger _applyStyles
	}

	protected _applyStyles() {
		if (this.container) {
			this.container.style.backgroundColor = this._backgroundColor.toString();
		}
		super._applyStyles();
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('exception-widget');
		// Set the font size and line height to the one from the editor configuration.
		const fontInfo = this.editor.getConfiguration().fontInfo;
		this.container.style.fontSize = `${fontInfo.fontSize}px`;
		this.container.style.lineHeight = `${fontInfo.lineHeight}px`;

		let title = $('.title');
		switch (this.exceptionInfo.breakMode) {
			case 'never':
				title.textContent = nls.localize('neverException', 'User-handled exception has occurred: {0}', this.exceptionInfo.id);
				break;
			case 'always':
				title.textContent = nls.localize('alwaysException', 'Always-breaking exception has occurred: {0}', this.exceptionInfo.id);
				break;
			case 'unhandled':
				title.textContent = nls.localize('unhandledException', 'Unhandled exception has occurred: {0}', this.exceptionInfo.id);
				break;
			case 'userUnhandled':
				title.textContent = nls.localize('userUnhandledException', 'User-unhandled exception has occurred: {0}', this.exceptionInfo.id);
				break;
			default:
				title.textContent = this.exceptionInfo.id ? nls.localize('exceptionThrownWithId', 'Exception has occurred: {0}', this.exceptionInfo.id) : nls.localize('exceptionThrown', 'Exception has occurred.');
				break;
		}
		dom.append(container, title);

		if (this.exceptionInfo.description) {
			let description = $('.description');
			description.textContent = this.exceptionInfo.description;
			dom.append(container, description);
		}

		if (this.exceptionInfo.details && this.exceptionInfo.details.stackTrace) {
			let stackTrace = $('.stack-trace');
			stackTrace.textContent = this.exceptionInfo.details.stackTrace;
			dom.append(container, stackTrace);
		}
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		// Reload the height with respect to the exception text content and relayout it to match the line count.
		this.container.style.height = 'initial';

		const computedLinesNumber = Math.ceil(this.container.offsetHeight / this.editor.getConfiguration().fontInfo.lineHeight);
		this._relayout(computedLinesNumber);
	}
}
