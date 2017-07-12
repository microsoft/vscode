/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import * as dom from 'vs/base/browser/dom';
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import collections = require('vs/base/common/collections');
import { $ } from 'vs/base/browser/builder';
import { Widget } from 'vs/base/browser/ui/widget';
import { IExpression, splitGlobAware } from 'vs/base/common/glob';
import { Checkbox } from 'vs/base/browser/ui/checkbox/checkbox';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { MessageType, InputBox, IInputValidator } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import CommonEvent, { Emitter } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachCheckboxStyler } from 'vs/platform/theme/common/styler';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export interface IOptions {
	placeholder?: string;
	width?: number;
	validation?: IInputValidator;
	ariaLabel?: string;
}

export class PatternInputWidget extends Widget {

	static OPTION_CHANGE: string = 'optionChange';

	public inputFocusTracker: dom.IFocusTracker;

	protected onOptionChange: (event: Event) => void;
	private width: number;
	private placeholder: string;
	private ariaLabel: string;

	private pattern: Checkbox;

	private domNode: HTMLElement;
	private inputNode: HTMLInputElement;
	protected inputBox: InputBox;

	private _onSubmit = this._register(new Emitter<boolean>());
	public onSubmit: CommonEvent<boolean> = this._onSubmit.event;

	constructor(parent: HTMLElement, private contextViewProvider: IContextViewProvider, protected themeService: IThemeService, options: IOptions = Object.create(null)) {
		super();
		this.onOptionChange = null;
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.ariaLabel = options.ariaLabel || nls.localize('defaultLabel', "input");

		this.pattern = null;
		this.domNode = null;
		this.inputNode = null;
		this.inputBox = null;

		this.render();

		parent.appendChild(this.domNode);
	}

	public dispose(): void {
		super.dispose();
		this.pattern.dispose();
		if (this.inputFocusTracker) {
			this.inputFocusTracker.dispose();
		}
	}

	public on(eventType: string, handler: (event: Event) => void): PatternInputWidget {
		switch (eventType) {
			case 'keydown':
			case 'keyup':
				$(this.inputBox.inputElement).on(eventType, handler);
				break;
			case PatternInputWidget.OPTION_CHANGE:
				this.onOptionChange = handler;
				break;
		}
		return this;
	}

	public setWidth(newWidth: number): void {
		this.width = newWidth;
		this.domNode.style.width = this.width + 'px';
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value: string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}

	public getGlob(): { expression?: IExpression, searchPaths?: string[] } {
		const pattern = this.getValue();
		const isGlobPattern = this.isGlobPattern();

		if (!pattern) {
			return {};
		}

		let exprSegments: string[];
		let searchPaths: string[];
		if (isGlobPattern) {
			const segments = splitGlobAware(pattern, ',')
				.filter(s => !!s.length);

			const groups = this.groupByPathsAndExprSegments(segments);
			searchPaths = groups.searchPaths;
			exprSegments = groups.exprSegments;
		} else {
			const segments = pattern.split(',')
				.filter(s => !!s.length);

			const groups = this.groupByPathsAndExprSegments(segments);
			searchPaths = groups.searchPaths;
			exprSegments = groups.exprSegments
				.map(p => {
					if (p[0] === '.') {
						p = '*' + p; // convert ".js" to "*.js"
					}

					return strings.format('{{0}/**,**/{1}}', p, p); // convert foo to {foo/**,**/foo} to cover files and folders
				});
		}

		const expression = exprSegments.reduce((glob, cur) => { glob[cur] = true; return glob; }, Object.create(null));
		return { expression, searchPaths };
	}

	private groupByPathsAndExprSegments(segments: string[]) {
		const isSearchPath = (segment: string) => {
			// A segment is a search path if it is an absolute path or starts with ./
			return paths.isAbsolute(segment) || strings.startsWith(segment, './');
		};

		const groups = collections.groupBy(segments,
			segment => isSearchPath(segment) ? 'searchPaths' : 'exprSegments');
		groups.searchPaths = groups.searchPaths || [];
		groups.exprSegments = groups.exprSegments || [];

		return groups;
	}

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public inputHasFocus(): boolean {
		return this.inputBox.hasFocus();
	}

	public isGlobPattern(): boolean {
		return this.pattern.checked;
	}

	public setIsGlobPattern(value: boolean): void {
		this.pattern.checked = value;
	}

	private setInputWidth(): void {
		this.inputBox.width = this.width - this.getSubcontrolsWidth();
	}

	protected getSubcontrolsWidth(): number {
		return this.pattern.width();
	}

	private render(): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		$(this.domNode).addClass('monaco-findInput');

		this.inputBox = new InputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.ariaLabel || '',
			validationOptions: {
				validation: null,
				showMessage: true
			}
		});
		this._register(attachInputBoxStyler(this.inputBox, this.themeService));
		this.inputFocusTracker = dom.trackFocus(this.inputBox.inputElement);
		this.onkeyup(this.inputBox.inputElement, (keyboardEvent) => this.onInputKeyUp(keyboardEvent));

		this.pattern = new Checkbox({
			actionClassName: 'pattern',
			title: nls.localize('patternDescription', "Use Glob Patterns"),
			isChecked: false,
			onChange: (viaKeyboard) => {
				this.onOptionChange(null);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}

				if (this.isGlobPattern()) {
					this.showGlobHelp();
				} else {
					this.inputBox.hideMessage();
				}
			}
		});
		this._register(attachCheckboxStyler(this.pattern, this.themeService));

		$(this.pattern.domNode).on('mouseover', () => {
			if (this.isGlobPattern()) {
				this.showGlobHelp();
			}
		});

		$(this.pattern.domNode).on(['mouseleave', 'mouseout'], () => {
			this.inputBox.hideMessage();
		});

		let controls = document.createElement('div');
		controls.className = 'controls';
		this.renderSubcontrols(controls);

		this.domNode.appendChild(controls);
		this.setInputWidth();
	}

	protected renderSubcontrols(controlsDiv: HTMLDivElement): void {
		controlsDiv.appendChild(this.pattern.domNode);
	}

	private showGlobHelp(): void {
		this.inputBox.showMessage({
			type: MessageType.INFO,
			formatContent: true,
			content: nls.localize('patternHelpInclude',
				"The pattern to match. e.g. **\\*\\*/*.js** to match all JavaScript files or **myFolder/\\*\\*** to match that folder with all children.\n\n**Reference**:\n**\\*** matches 0 or more characters\n**?** matches 1 character\n**\\*\\*** matches zero or more directories\n**[a-z]** matches a range of characters\n**{a,b}** matches any of the patterns)"
			)
		}, true);
	}

	private onInputKeyUp(keyboardEvent: IKeyboardEvent) {
		switch (keyboardEvent.keyCode) {
			case KeyCode.Enter:
				this._onSubmit.fire();
				return;
			default:
				return;
		}
	}
}

export class ExcludePatternInputWidget extends PatternInputWidget {

	constructor(parent: HTMLElement, contextViewProvider: IContextViewProvider, themeService: IThemeService, private telemetryService: ITelemetryService, options: IOptions = Object.create(null)) {
		super(parent, contextViewProvider, themeService, options);
	}

	private useIgnoreFilesBox: Checkbox;
	private useExcludeSettingsBox: Checkbox;

	public dispose(): void {
		super.dispose();
		this.useIgnoreFilesBox.dispose();
		this.useExcludeSettingsBox.dispose();
	}

	public useExcludeSettings(): boolean {
		return this.useExcludeSettingsBox.checked;
	}

	public setUseExcludeSettings(value: boolean) {
		this.useExcludeSettingsBox.checked = value;
	}

	public useIgnoreFiles(): boolean {
		return this.useIgnoreFilesBox.checked;
	}

	public setUseIgnoreFiles(value: boolean): void {
		this.useIgnoreFilesBox.checked = value;
	}

	protected getSubcontrolsWidth(): number {
		return super.getSubcontrolsWidth() + this.useIgnoreFilesBox.width() + this.useExcludeSettingsBox.width();
	}

	protected renderSubcontrols(controlsDiv: HTMLDivElement): void {
		this.useIgnoreFilesBox = new Checkbox({
			actionClassName: 'useIgnoreFiles',
			title: nls.localize('useIgnoreFilesDescription', "Use Ignore Files"),
			isChecked: false,
			onChange: (viaKeyboard) => {
				this.telemetryService.publicLog('search.useIgnoreFiles.toggled');
				this.onOptionChange(null);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
			}
		});
		this._register(attachCheckboxStyler(this.useIgnoreFilesBox, this.themeService));

		this.useExcludeSettingsBox = new Checkbox({
			actionClassName: 'useExcludeSettings',
			title: nls.localize('useExcludeSettingsDescription', "Use Exclude Settings"),
			isChecked: false,
			onChange: (viaKeyboard) => {
				this.telemetryService.publicLog('search.useExcludeSettings.toggled');
				this.onOptionChange(null);
				if (!viaKeyboard) {
					this.inputBox.focus();
				}
			}
		});
		this._register(attachCheckboxStyler(this.useExcludeSettingsBox, this.themeService));

		controlsDiv.appendChild(this.useIgnoreFilesBox.domNode);
		controlsDiv.appendChild(this.useExcludeSettingsBox.domNode);
		super.renderSubcontrols(controlsDiv);
	}
}