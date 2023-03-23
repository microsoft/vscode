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
import { ITerminalFont } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal } from 'xterm';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

const enum CssClass {
	Active = 'active',
	Hide = 'hide'
}

export class AccessibleBufferWidget extends DisposableStore {
	private _accessibleBuffer: HTMLElement;
	private _bufferEditor: CodeEditorWidget;
	private _editorContainer: HTMLElement;
	private _font: ITerminalFont;
	private _xtermElement: HTMLElement;
	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _focusTracker: dom.IFocusTracker;
	private _inQuickPick = false;
	private _prependNewLine = false;
	private _bufferToEditorIndex: Map<number, number> = new Map();

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
		this._focusedContextKey = TerminalContextKeys.accessibleBufferFocus.bindTo(this._contextKeyService);
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([LinkDetector.ID, SelectionClipboardContributionID])
		};
		this._font = _xterm.getFont();
		// this will be defined because we await the container opening
		this._xtermElement = _xterm.raw.element!;
		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(),
			lineDecorationsWidth: 6,
			dragAndDrop: true,
			cursorWidth: 1,
			fontSize: this._font.fontSize,
			lineHeight: this._font.charHeight ? this._font.charHeight * this._font.lineHeight : 1,
			fontFamily: this._font.fontFamily,
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
		this._accessibleBuffer = document.createElement('div');
		this._accessibleBuffer.setAttribute('role', 'document');
		this._accessibleBuffer.ariaRoleDescription = localize('terminal.integrated.accessibleBuffer', 'Terminal buffer');
		this._accessibleBuffer.classList.add('accessible-buffer');
		this._editorContainer = document.createElement('div');
		this._bufferEditor = this.add(this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions));
		this._focusTracker = this.add(dom.trackFocus(this._editorContainer));
		this.add(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this.add(this._focusTracker.onDidBlur(() => this._focusedContextKey.reset()));
		this._accessibleBuffer.replaceChildren(this._editorContainer);
		this._xtermElement.insertAdjacentElement('beforebegin', this._accessibleBuffer);
		this.add(Event.runAndSubscribe(this._xterm.raw.onResize, () => this._bufferEditor.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight })));
		this._bufferEditor.onKeyDown((e) => {
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
		});
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.has(TerminalSettingId.FontFamily)) {
				this._font = _xterm.getFont();
			}
		}));
		this.add(this._xterm.raw.onWriteParsed(async () => {
			if (this._accessibleBuffer.classList.contains(CssClass.Active)) {
				await this._updateEditor(true);
			}
		}));
		this.add(this._bufferEditor.onDidFocusEditorText(async () => {
			if (this._inQuickPick) {
				return;
			}
			// if the editor is focused via tab, we need to update the model
			// and show it
			await this._updateEditor();
			this._accessibleBuffer.classList.add(CssClass.Active);
			this._xtermElement.classList.add(CssClass.Hide);
		}));
		this._updateEditor();
	}

	private _hide(): void {
		this._accessibleBuffer.classList.remove(CssClass.Active);
		this._xtermElement.classList.remove(CssClass.Hide);
	}

	private async _updateModel(insertion?: boolean): Promise<ITextModel> {
		let model = this._bufferEditor.getModel();
		const lineCount = model?.getLineCount() ?? 0;
		if (insertion && model && lineCount > this._xterm.raw.rows) {
			const lineNumber = lineCount + 1;
			model.pushEditOperations(null, [{
				range: { startLineNumber: lineNumber, endLineNumber: lineNumber, startColumn: 1, endColumn: 1 }, text: this._getContent(true)
			}], () => []);
		} else {
			model = await this._getTextModel(this._instance.resource.with({ fragment: this._getContent() }));
		}
		if (!model) {
			throw new Error('Could not create accessible buffer editor model');
		}
		this._bufferEditor.setModel(model);
		return model;
	}

	private async _updateEditor(insertion?: boolean): Promise<void> {
		const model = await this._updateModel(insertion);
		if (!model) {
			return;
		}
		const lineNumber = model.getLineCount() - 1;
		const selection = this._bufferEditor.getSelection();
		// If the selection is at the top of the buffer, IE the default when not set, move it to the bottom
		if (selection?.startColumn === 1 && selection.endColumn === 1 && selection.startLineNumber === 1 && selection.endLineNumber === 1) {
			this._bufferEditor.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
		}
		this._bufferEditor.setScrollTop(this._bufferEditor.getScrollHeight());
	}

	async createQuickPick(): Promise<IQuickPick<IQuickPickItem> | undefined> {
		if (!this._focusedContextKey.get()) {
			await this.show();
		}
		this._inQuickPick = true;
		const commands = this._instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
		if (!commands?.length) {
			return;
		}
		const quickPickItems: IQuickPickItem[] = [];
		for (const command of commands) {
			let line = command.marker?.line;
			if (!line || !command.command.length) {
				continue;
			}
			line = this._bufferToEditorIndex.get(line);
			if (!line) {
				continue;
			}
			quickPickItems.push(
				{
					label: localize('terminal.integrated.symbolQuickPick.labelNoExitCode', '{0}', command.command),
					meta: JSON.stringify({ line: line + 1, exitCode: command.exitCode })
				});
		}
		const quickPick = this._quickInputService.createQuickPick<IQuickPickItem>();
		quickPick.onDidAccept(() => {
			const item = quickPick.activeItems[0];
			const model = this._bufferEditor.getModel();
			if (!model || !item.meta) {
				return;
			}
			quickPick.hide();
			const data: { line: number; exitCode: number } = JSON.parse(item.meta);
			this._bufferEditor.setSelection({ startLineNumber: data.line, startColumn: 1, endLineNumber: data.line, endColumn: 1 });
			this._bufferEditor.revealLine(data.line);
			this._inQuickPick = false;
			return;
		});
		quickPick.onDidChangeActive(() => {
			const data = quickPick.activeItems?.[0]?.meta;
			if (data && JSON.parse(data).exitCode) {
				this._audioCueService.playAudioCue(AudioCue.error, true);
			}
		});
		quickPick.items = quickPickItems.reverse();
		return quickPick;
	}

	async show(): Promise<void> {
		await this._updateEditor();
		this._prependNewLine = true;
		this._accessibleBuffer.tabIndex = -1;
		this._bufferEditor.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight });
		this._accessibleBuffer.classList.add(CssClass.Active);
		this._xtermElement.classList.add(CssClass.Hide);
		this._bufferEditor.focus();
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		return this._modelService.createModel(resource.fragment, null, resource, false);
	}

	private _getContent(lastBufferIndex?: boolean): string {
		const buffer = this._xterm?.raw.buffer.active;
		if (!buffer) {
			return '';
		}

		const scrollback: number = this._configurationService.getValue(TerminalSettingId.Scrollback);
		const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
		const end = Math.min(maxBufferSize, buffer.length - 1);
		if (lastBufferIndex) {
			// If the last buffer index is requested, this is as a result of
			// a dynamic addition. Return only the last line to prevent duplication.
			const line = buffer.getLine(end - 1)?.translateToString(false).replace(new RegExp(' ', 'g'), '\xA0');
			const result = line ? (this._prependNewLine ? '\n' : '') + line + '\n' : '';
			this._prependNewLine = false;
			return result;
		}

		this._bufferToEditorIndex = new Map();
		const lines: string[] = [];
		let currentLine: string = '';
		for (let i = 0; i <= end; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			this._bufferToEditorIndex.set(i, lines.length);
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === end - 1) {
				lines.push(currentLine.replace(new RegExp(' ', 'g'), '\xA0'));
				currentLine = '';
			}
		}

		return lines.join('\n');
	}
}
