/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal } from 'xterm';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { withNullAsUndefined } from 'vs/base/common/types';

const enum CssClass {
	Active = 'active',
	Hide = 'hide'
}

interface IAccessibleBufferQuickPickItem extends IQuickPickItem {
	lineNumber: number;
	exitCode?: number;
}

export class AccessibleBufferWidget extends DisposableStore {
	private _accessibleBuffer: HTMLElement;
	private _editorWidget: CodeEditorWidget;
	private _editorContainer: HTMLElement;
	private _xtermElement: HTMLElement;
	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _focusTracker: dom.IFocusTracker;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._xtermElement = _xterm.raw.element!;
		this._accessibleBuffer = document.createElement('div');
		this._accessibleBuffer.setAttribute('role', 'document');
		this._accessibleBuffer.ariaRoleDescription = localize('terminal.integrated.accessibleBuffer', 'Terminal buffer');
		this._accessibleBuffer.classList.add('accessible-buffer');
		this._editorContainer = document.createElement('div');
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([LinkDetector.ID, SelectionClipboardContributionID])
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
		this._accessibleBuffer.replaceChildren(this._editorContainer);
		this._xtermElement.insertAdjacentElement('beforebegin', this._accessibleBuffer);

		this._focusTracker = this.add(dom.trackFocus(this._editorContainer));
		this._focusedContextKey = TerminalContextKeys.accessibleBufferFocus.bindTo(this._contextKeyService);
		this._trackFocus();

		this._initializeTerminalListeners();
		this._initializeEditorListeners();
		this._updateEditor();
	}

	private _trackFocus(): void {
		this.add(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this.add(this._focusTracker.onDidBlur(() => this._focusedContextKey.reset()));
	}

	private _initializeEditorListeners(): void {
		this.add(this._editorWidget.onKeyDown((e) => {
			switch (e.keyCode) {
				case KeyCode.Tab:
					// On tab or shift+tab, hide the accessible buffer and perform the default tab
					// behavior
					this._hide();
					break;
				case KeyCode.Escape:
					// On escape, hide the accessible buffer and force focus onto the terminal
					this._hide();
					this._xterm.raw.focus();
					break;
			}
		}));
		this.add(this._editorWidget.onDidFocusEditorText(async () => {
			if (this._isActive()) {
				// the user has focused the editor via mouse or
				// Go to Command was run so we've already updated the editor
				return;
			}
			// if the editor is focused via tab, we need to update the model
			// and show it
			await this._updateEditor();
			this._accessibleBuffer.classList.add(CssClass.Active);
			this._xtermElement.classList.add(CssClass.Hide);
		}));
	}

	private _initializeTerminalListeners(): void {
		this.add(this._instance.onDidRequestFocus(() => {
			if (this._isActive()) {
				this._editorWidget.focus();
			}
		}));
		this.add(Event.runAndSubscribe(this._xterm.raw.onResize, () => this._layout()));
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.has(TerminalSettingId.FontFamily) || e.affectedKeys.has(TerminalSettingId.FontSize) || e.affectedKeys.has(TerminalSettingId.LineHeight) || e.affectedKeys.has(TerminalSettingId.LetterSpacing)) {
				const font = this._xterm.getFont();
				this._editorWidget.updateOptions({ fontFamily: font.fontFamily, fontSize: font.fontSize, lineHeight: font.charHeight ? font.charHeight * font.lineHeight : 1, letterSpacing: font.letterSpacing });
			}
		}));
		this.add(this._xterm.raw.onWriteParsed(async () => {
			if (this._isActive()) {
				await this._updateEditor(true);
			}
		}));
	}

	private _isActive(): boolean {
		return this._accessibleBuffer.classList.contains(CssClass.Active);
	}

	private _hide(): void {
		this._accessibleBuffer.classList.remove(CssClass.Active);
		this._xtermElement.classList.remove(CssClass.Hide);
	}

	private async _updateModel(insertion?: boolean): Promise<ITextModel> {
		let model = this._editorWidget.getModel();
		const lineCount = model?.getLineCount() ?? 0;
		if (insertion && model && lineCount > this._xterm.raw.rows) {
			const lineNumber = lineCount + 1;
			model.pushEditOperations(null, [{
				range: { startLineNumber: lineNumber, endLineNumber: lineNumber, startColumn: 1, endColumn: 1 }, text: this._getContent(1)
			}], () => []);
		} else {
			model = await this._getTextModel(this._instance.resource.with({ fragment: this._getContent() }));
		}
		if (!model) {
			throw new Error('Could not create accessible buffer editor model');
		}
		this._editorWidget.setModel(model);
		return model;
	}

	private async _updateEditor(insertion?: boolean): Promise<void> {
		const model = await this._updateModel(insertion);
		if (!model) {
			return;
		}
		const lineNumber = model.getLineCount() - 1;
		const selection = this._editorWidget.getSelection();
		// If the selection is at the top of the buffer, IE the default when not set, move it to the bottom
		if (selection?.startColumn === 1 && selection.endColumn === 1 && selection.startLineNumber === 1 && selection.endLineNumber === 1) {
			this._editorWidget.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
		}
		this._editorWidget.setScrollTop(this._editorWidget.getScrollHeight());
	}

	async createQuickPick(): Promise<IQuickPick<IAccessibleBufferQuickPickItem> | undefined> {
		let currentPosition = withNullAsUndefined(this._editorWidget.getPosition());
		const commands = this._instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
		if (!commands?.length) {
			return;
		}
		const quickPickItems: IAccessibleBufferQuickPickItem[] = [];
		for (const command of commands) {
			const line = command.marker?.line;
			if (!line || !command.command.length) {
				continue;
			}
			quickPickItems.push(
				{
					label: localize('terminal.integrated.symbolQuickPick.labelNoExitCode', '{0}', command.command),
					lineNumber: line + 1,
					exitCode: command.exitCode
				});
		}
		const quickPick = this._quickInputService.createQuickPick<IAccessibleBufferQuickPickItem>();
		quickPick.canSelectMany = false;
		quickPick.onDidChangeActive(() => {
			const activeItem = quickPick.activeItems[0];
			if (activeItem.exitCode) {
				this._audioCueService.playAudioCue(AudioCue.error, true);
			}
			this._editorWidget.revealLine(activeItem.lineNumber, 0);
		});
		quickPick.onDidHide(() => {
			if (currentPosition) {
				this._editorWidget.setPosition(currentPosition);
				this._editorWidget.revealLineInCenter(currentPosition.lineNumber);
			}
			quickPick.dispose();
		});
		quickPick.onDidAccept(() => {
			const item = quickPick.activeItems[0];
			const model = this._editorWidget.getModel();
			if (!model) {
				return;
			}
			if (!item && currentPosition) {
				// reset
				this._editorWidget.setPosition(currentPosition);
			} else {
				this._editorWidget.setSelection({ startLineNumber: item.lineNumber, startColumn: 1, endLineNumber: item.lineNumber, endColumn: 1 });
				currentPosition = this._editorWidget.getSelection()?.getPosition();
			}
			this._editorWidget.focus();
			return;
		});
		quickPick.items = quickPickItems.reverse();
		return quickPick;
	}

	private _layout(): void {
		this._editorWidget.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight });
	}

	async show(): Promise<void> {
		await this._updateEditor();
		this._accessibleBuffer.tabIndex = -1;
		this._layout();
		this._accessibleBuffer.classList.add(CssClass.Active);
		this._xtermElement.classList.add(CssClass.Hide);
		this._editorWidget.focus();
	}

	private _getContent(startIndex?: number): string {
		const buffer = this._xterm.raw.buffer.active;
		if (!buffer) {
			return '';
		}

		const scrollback: number = this._configurationService.getValue(TerminalSettingId.Scrollback);
		const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
		const end = Math.min(maxBufferSize, buffer.length - 1);
		if (startIndex) {
			// If the last buffer index is requested, this is as a result of
			// a dynamic addition. Return only the last line to prevent duplication.
			const line = buffer.getLine(end - 1)?.translateToString(false).replace(new RegExp(' ', 'g'), '\xA0');
			const result = line ? line + '\n' : '';
			return result;
		}

		const lines: string[] = [];
		let currentLine: string = '';
		for (let i = 0; i <= end; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === end - 1) {
				lines.push(currentLine.replace(new RegExp(' ', 'g'), '\xA0'));
				currentLine = '';
			}
		}

		return lines.join('\n');
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
}
