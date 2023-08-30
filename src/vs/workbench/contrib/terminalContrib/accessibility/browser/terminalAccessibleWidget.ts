/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal } from 'xterm';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';
import { localize } from 'vs/nls';

const enum ClassName {
	Active = 'active',
	Hide = 'hide',
	Widget = 'terminal-accessible-widget'
}

export abstract class TerminalAccessibleWidget extends DisposableStore {

	private _element: HTMLElement;
	get element(): HTMLElement { return this._element; }
	private _editorWidget: CodeEditorWidget;
	protected get editorWidget(): CodeEditorWidget { return this._editorWidget; }
	private _editorContainer: HTMLElement;
	private _xtermElement: HTMLElement;

	protected _listeners: IDisposable[] = [];

	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _focusedLastLineContextKey: IContextKey<boolean>;
	private readonly _focusTracker?: dom.IFocusTracker;

	constructor(
		private readonly _className: string,
		protected readonly _instance: Pick<ITerminalInstance, 'shellType' | 'capabilities' | 'onDidRequestFocus' | 'resource'>,
		protected readonly _xterm: Pick<IXtermTerminal, 'shellIntegration' | 'getFont'> & { raw: Terminal },
		rawFocusContextKey: RawContextKey<boolean>,
		rawFocusLastLineContextKey: RawContextKey<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService protected readonly _contextKeyService: IContextKeyService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._xtermElement = _xterm.raw.element!;
		this._element = document.createElement('div');
		this._element.setAttribute('role', 'document');
		this._element.classList.add(_className);
		this._element.classList.add(ClassName.Widget);
		this._editorContainer = document.createElement('div');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeActionController.ID)
		};
		const font = _xterm.getFont();
		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(this._configurationService),
			lineDecorationsWidth: 6,
			dragAndDrop: true,
			cursorWidth: 1,
			fontSize: font.fontSize,
			lineHeight: font.charHeight ? font.charHeight * font.lineHeight : 1,
			letterSpacing: font.letterSpacing,
			fontFamily: font.fontFamily,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: true },
			readOnly: true,
			ariaLabel: localize('terminalAccessibleBuffer', "Terminal Buffer")
		};
		this._editorWidget = this.add(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
		this._element.replaceChildren(this._editorContainer);
		this._xtermElement.insertAdjacentElement('beforebegin', this._element);

		this._focusTracker = this.add(dom.trackFocus(this._editorContainer));
		this._focusedContextKey = rawFocusContextKey.bindTo(this._contextKeyService);
		this._focusedLastLineContextKey = rawFocusLastLineContextKey.bindTo(this._contextKeyService);
		this.add(this._focusTracker.onDidFocus(() => {
			this._focusedContextKey?.set(true);
			this._focusedLastLineContextKey?.set(this._editorWidget.getSelection()?.positionLineNumber === this._editorWidget.getModel()?.getLineCount());
		}));
		this.add(this._focusTracker.onDidBlur(() => {
			this._focusedContextKey?.reset();
			this._focusedLastLineContextKey?.reset();
		}));
		this._editorWidget.onDidChangeCursorPosition(() => {
			console.log(this._editorWidget.getSelection()?.positionLineNumber === this._editorWidget.getModel()?.getLineCount());
			this._focusedLastLineContextKey?.set(this._editorWidget.getSelection()?.positionLineNumber === this._editorWidget.getModel()?.getLineCount());
		});

		this.add(Event.runAndSubscribe(this._xterm.raw.onResize, () => this.layout()));
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.has(TerminalSettingId.FontFamily) || e.affectedKeys.has(TerminalSettingId.FontSize) || e.affectedKeys.has(TerminalSettingId.LineHeight) || e.affectedKeys.has(TerminalSettingId.LetterSpacing)) {
				const font = this._xterm.getFont();
				this._editorWidget.updateOptions({ fontFamily: font.fontFamily, fontSize: font.fontSize, lineHeight: font.charHeight ? font.charHeight * font.lineHeight : 1, letterSpacing: font.letterSpacing });
			}
		}));
		this.add(this._editorWidget.onKeyDown((e) => {
			switch (e.keyCode) {
				case KeyCode.Escape:
					// On escape, hide the accessible buffer and force focus onto the terminal
					this.hide(true);
					break;
			}
		}));
		this.add(this._editorWidget.onDidFocusEditorText(async () => {
			this._terminalService.setActiveInstance(this._instance as ITerminalInstance);
			this._xtermElement.classList.add(ClassName.Hide);
		}));
		this.add(this._editorWidget.onDidBlurEditorText(async () => this.hide()));
	}

	registerListeners(): void {
		this._listeners.push(this._instance.onDidRequestFocus(() => this.editorWidget.focus()));
	}

	layout(): void {
		this._editorWidget.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight });
	}

	abstract updateEditor(): Promise<void>;

	async show(): Promise<void> {
		this.registerListeners();
		await this.updateEditor();
		this.element.tabIndex = -1;
		this.layout();
		this.element.classList.add(ClassName.Active);
		this._xtermElement.classList.add(ClassName.Hide);
		this.editorWidget.focus();
	}

	override dispose(): void {
		this._disposeListeners();
		super.dispose();
	}

	private _disposeListeners(): void {
		for (const listener of this._listeners) {
			listener.dispose();
		}
	}

	hide(focusXterm?: boolean): void {
		this._disposeListeners();
		this.element.classList.remove(ClassName.Active);
		this._xtermElement.classList.remove(ClassName.Hide);
		if (focusXterm) {
			this._xterm.raw.focus();
		}
	}

	async getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(`${this._className}-${resource.fragment}`, null, resource, false);
	}
}
