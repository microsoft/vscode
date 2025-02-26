/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/exceptionWidget.css';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IExceptionInfo, IDebugSession, IDebugEditorContribution, EDITOR_CONTRIBUTION_ID } from '../common/debug.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IThemeService, IColorTheme, IThemeChangeEvent } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Color } from '../../../../base/common/color.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DebugLinkHoverBehavior, LinkDetector } from './linkDetector.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../base/common/actions.js';
import { widgetClose } from '../../../../platform/theme/common/iconRegistry.js';
const $ = dom.$;

// theming

const debugExceptionWidgetBorder = registerColor('debugExceptionWidget.border', '#a31515', nls.localize('debugExceptionWidgetBorder', 'Exception widget border color.'));
const debugExceptionWidgetBackground = registerColor('debugExceptionWidget.background', { dark: '#420b0d', light: '#f1dfde', hcDark: '#420b0d', hcLight: '#f1dfde' }, nls.localize('debugExceptionWidgetBackground', 'Exception widget background color.'));

export class ExceptionWidget extends ZoneWidget {

	private backgroundColor: Color | undefined;

	constructor(
		editor: ICodeEditor,
		private exceptionInfo: IExceptionInfo,
		private debugSession: IDebugSession | undefined,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(editor, { showFrame: true, showArrow: true, isAccessible: true, frameWidth: 1, className: 'exception-widget-container' });

		this.applyTheme(themeService.getColorTheme());
		this._disposables.add(themeService.onDidColorThemeChange(this.onDidColorThemeChange.bind(this)));

		this.create();
		const onDidLayoutChangeScheduler = new RunOnceScheduler(() => this._doLayout(undefined, undefined), 50);
		this._disposables.add(this.editor.onDidLayoutChange(() => onDidLayoutChangeScheduler.schedule()));
		this._disposables.add(onDidLayoutChangeScheduler);
	}

	private onDidColorThemeChange(e: IThemeChangeEvent): void {
		this.applyTheme(e.theme);
	}

	private applyTheme(theme: IColorTheme): void {
		this.backgroundColor = theme.getColor(debugExceptionWidgetBackground);
		const frameColor = theme.getColor(debugExceptionWidgetBorder);
		this.style({
			arrowColor: frameColor,
			frameColor: frameColor
		}); // style() will trigger _applyStyles
	}

	protected override _applyStyles(): void {
		if (this.container) {
			this.container.style.backgroundColor = this.backgroundColor ? this.backgroundColor.toString() : '';
		}
		super._applyStyles();
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('exception-widget');
		// Set the font size and line height to the one from the editor configuration.
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		container.style.fontSize = `${fontInfo.fontSize}px`;
		container.style.lineHeight = `${fontInfo.lineHeight}px`;
		container.tabIndex = 0;
		const title = $('.title');
		const label = $('.label');
		dom.append(title, label);
		const actions = $('.actions');
		dom.append(title, actions);
		label.textContent = this.exceptionInfo.id ? nls.localize('exceptionThrownWithId', 'Exception has occurred: {0}', this.exceptionInfo.id) : nls.localize('exceptionThrown', 'Exception has occurred.');
		let ariaLabel = label.textContent;

		const actionBar = new ActionBar(actions);
		actionBar.push(new Action('editor.closeExceptionWidget', nls.localize('close', "Close"), ThemeIcon.asClassName(widgetClose), true, async () => {
			const contribution = this.editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID);
			contribution?.closeExceptionWidget();
		}), { label: false, icon: true });

		dom.append(container, title);

		if (this.exceptionInfo.description) {
			const description = $('.description');
			description.textContent = this.exceptionInfo.description;
			ariaLabel += ', ' + this.exceptionInfo.description;
			dom.append(container, description);
		}

		if (this.exceptionInfo.details && this.exceptionInfo.details.stackTrace) {
			const stackTrace = $('.stack-trace');
			const linkDetector = this.instantiationService.createInstance(LinkDetector);
			const linkedStackTrace = linkDetector.linkify(this.exceptionInfo.details.stackTrace, true, this.debugSession ? this.debugSession.root : undefined, undefined, { type: DebugLinkHoverBehavior.Rich, store: this._disposables });
			stackTrace.appendChild(linkedStackTrace);
			dom.append(container, stackTrace);
			ariaLabel += ', ' + this.exceptionInfo.details.stackTrace;
		}
		container.setAttribute('aria-label', ariaLabel);
	}

	protected override _doLayout(_heightInPixel: number | undefined, _widthInPixel: number | undefined): void {
		// Reload the height with respect to the exception text content and relayout it to match the line count.
		this.container!.style.height = 'initial';

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const arrowHeight = Math.round(lineHeight / 3);
		const computedLinesNumber = Math.ceil((this.container!.offsetHeight + arrowHeight) / lineHeight);

		this._relayout(computedLinesNumber);
	}

	focus(): void {
		// Focus into the container for accessibility purposes so the exception and stack trace gets read
		this.container?.focus();
	}

	override hasFocus(): boolean {
		if (!this.container) {
			return false;
		}

		return dom.isAncestorOfActiveElement(this.container);
	}
}
