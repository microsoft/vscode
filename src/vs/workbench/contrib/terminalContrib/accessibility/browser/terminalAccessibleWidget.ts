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
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal } from 'xterm';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

const enum CssClass {
	Active = 'active',
	Hide = 'hide'
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
	private readonly _focusTracker: dom.IFocusTracker;

	constructor(
		className: string,
		protected readonly _instance: Pick<ITerminalInstance, 'capabilities' | 'onDidRequestFocus' | 'resource'>,
		protected readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._xtermElement = _xterm.raw.element!;
		this._element = document.createElement('div');
		this._element.setAttribute('role', 'document');
		this._element.classList.add(className);
		this._editorContainer = document.createElement('div');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([LinkDetector.ID, SelectionClipboardContributionID, 'editor.contrib.selectionAnchorController'])
		};
		const font = _xterm.getFont();
		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(),
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
			accessibilitySupport: this._configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport'),
			cursorBlinking: this._configurationService.getValue('terminal.integrated.cursorBlinking'),
			readOnly: true
		};
		this._editorWidget = this.add(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
		this._element.replaceChildren(this._editorContainer);
		this._xtermElement.insertAdjacentElement('beforebegin', this._element);

		this._focusTracker = this.add(dom.trackFocus(this._editorContainer));
		this._focusedContextKey = TerminalContextKeys.accessibleBufferFocus.bindTo(this._contextKeyService);
		this.add(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this.add(this._focusTracker.onDidBlur(() => this._focusedContextKey.reset()));

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
					this._xterm.raw.focus();
					break;
				case KeyCode.Tab:
					// On tab or shift+tab, hide the accessible buffer and perform the default tab
					// behavior
					this._hide();
					break;
			}
		}));
		this.add(this._editorWidget.onDidFocusEditorText(async () => {
			this._terminalService.setActiveInstance(this._instance as ITerminalInstance);
			if (this.element.classList.contains(CssClass.Active)) {
				// the user has focused the editor via mouse or
				// Go to Command was run so we've already updated the editor
				return;
			}
			// if the editor is focused via tab, we need to update the model
			// and show it
			this.registerListeners?.();
			await this.updateEditor();
			this.element.classList.add(CssClass.Active);
		}));
	}

	abstract registerListeners?(): void;

	layout(): void {
		this._editorWidget.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight });
	}

	abstract updateEditor(): Promise<void>;

	async show(): Promise<void> {
		this.registerListeners?.();
		await this.updateEditor();
		this.element.tabIndex = -1;
		this.layout();
		this.element.classList.add(CssClass.Active);
		this._xtermElement.classList.add(CssClass.Hide);
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

	private _hide(): void {
		this._disposeListeners();
		this.element.classList.remove(CssClass.Active);
		this._xtermElement.classList.remove(CssClass.Hide);
	}

	async getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
}
