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
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal } from 'xterm';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { withNullAsUndefined } from 'vs/base/common/types';
import { BufferContentTracker } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/bufferContentTracker';
import { ILogService } from 'vs/platform/log/common/log';
import { IEditorViewState } from 'vs/editor/common/editorCommon';

export const enum NavigationType {
	Next = 'next',
	Previous = 'previous'
}

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

	private _listeners: IDisposable[] = [];
	private _isUpdating: boolean = false;
	private _pendingUpdates = 0;

	private _bufferTracker: BufferContentTracker;

	private _cursorPosition: { lineNumber: number; column: number } | undefined;

	constructor(
		private readonly _instance: Pick<ITerminalInstance, 'capabilities' | 'onDidRequestFocus' | 'resource'>,
		private readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._xtermElement = _xterm.raw.element!;
		this._bufferTracker = this._instantiationService.createInstance(BufferContentTracker, _xterm);
		this._accessibleBuffer = document.createElement('div');
		this._accessibleBuffer.setAttribute('role', 'document');
		this._accessibleBuffer.ariaRoleDescription = localize('terminal.integrated.accessibleBuffer', 'Terminal buffer');
		this._accessibleBuffer.classList.add('accessible-buffer');
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
		this._accessibleBuffer.replaceChildren(this._editorContainer);
		this._xtermElement.insertAdjacentElement('beforebegin', this._accessibleBuffer);

		this._focusTracker = this.add(dom.trackFocus(this._editorContainer));
		this._focusedContextKey = TerminalContextKeys.accessibleBufferFocus.bindTo(this._contextKeyService);
		this.add(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this.add(this._focusTracker.onDidBlur(() => this._focusedContextKey.reset()));

		this.add(Event.runAndSubscribe(this._xterm.raw.onResize, () => this._layout()));
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.has(TerminalSettingId.FontFamily) || e.affectedKeys.has(TerminalSettingId.FontSize) || e.affectedKeys.has(TerminalSettingId.LineHeight) || e.affectedKeys.has(TerminalSettingId.LetterSpacing)) {
				const font = this._xterm.getFont();
				this._editorWidget.updateOptions({ fontFamily: font.fontFamily, fontSize: font.fontSize, lineHeight: font.charHeight ? font.charHeight * font.lineHeight : 1, letterSpacing: font.letterSpacing });
			}
		}));
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
			this._terminalService.setActiveInstance(this._instance as ITerminalInstance);
			if (this._accessibleBuffer.classList.contains(CssClass.Active)) {
				// the user has focused the editor via mouse or
				// Go to Command was run so we've already updated the editor
				return;
			}
			// if the editor is focused via tab, we need to update the model
			// and show it
			this._registerListeners();
			await this._updateEditor();
			this._accessibleBuffer.classList.add(CssClass.Active);
			this._xtermElement.classList.add(CssClass.Hide);
		}));

		this._updateEditor();
	}

	override dispose(): void {
		this._disposeListeners();
		super.dispose();
	}

	async show(): Promise<void> {
		this._registerListeners();
		await this._updateEditor();
		this._accessibleBuffer.tabIndex = -1;
		this._layout();
		this._accessibleBuffer.classList.add(CssClass.Active);
		this._xtermElement.classList.add(CssClass.Hide);
		this._editorWidget.focus();
	}

	navigateToCommand(type: NavigationType): void {
		const currentLine = this._editorWidget.getPosition()?.lineNumber || this._getDefaultCursorPosition()?.lineNumber;
		const commands = this._getCommandsWithEditorLine();
		if (!commands?.length || !currentLine) {
			return;
		}

		const filteredCommands = type === NavigationType.Previous ? commands.filter(c => c.lineNumber < currentLine).sort((a, b) => b.lineNumber - a.lineNumber) : commands.filter(c => c.lineNumber > currentLine).sort((a, b) => a.lineNumber - b.lineNumber);
		if (!filteredCommands.length) {
			return;
		}
		this._cursorPosition = { lineNumber: filteredCommands[0].lineNumber, column: 1 };
		this._resetPosition();
	}

	private _getEditorLineForCommand(command: ITerminalCommand): number | undefined {
		let line = command.marker?.line;
		if (line === undefined || !command.command.length || line < 0) {
			return;
		}
		line = this._bufferTracker.bufferToEditorLineMapping.get(line);
		if (!line) {
			return;
		}
		return line + 1;
	}

	private _getCommandsWithEditorLine(): ICommandWithEditorLine[] | undefined {
		const commands = this._instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
		if (!commands?.length) {
			return;
		}
		const result: ICommandWithEditorLine[] = [];
		for (const command of commands) {
			const lineNumber = this._getEditorLineForCommand(command);
			if (!lineNumber) {
				continue;
			}
			result.push({ command, lineNumber });
		}
		return result;
	}

	async createQuickPick(): Promise<IQuickPick<IAccessibleBufferQuickPickItem> | undefined> {
		this._cursorPosition = withNullAsUndefined(this._editorWidget.getPosition());
		const commands = this._getCommandsWithEditorLine();
		if (!commands) {
			return;
		}
		const quickPickItems: IAccessibleBufferQuickPickItem[] = [];
		for (const { command, lineNumber } of commands) {
			const line = this._getEditorLineForCommand(command);
			if (!line) {
				continue;
			}
			quickPickItems.push(
				{
					label: localize('terminal.integrated.symbolQuickPick.labelNoExitCode', '{0}', command.command),
					lineNumber,
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
			this._resetPosition();
			quickPick.dispose();
		});
		quickPick.onDidAccept(() => {
			const item = quickPick.activeItems[0];
			const model = this._editorWidget.getModel();
			if (!model) {
				return;
			}
			if (!item && this._cursorPosition) {
				this._resetPosition();
			} else {
				this._cursorPosition = { lineNumber: item.lineNumber, column: 1 };
			}
			this._editorWidget.focus();
			return;
		});
		quickPick.items = quickPickItems.reverse();
		return quickPick;
	}

	private _resetPosition(): void {
		this._cursorPosition = this._cursorPosition ?? this._getDefaultCursorPosition();
		if (!this._cursorPosition) {
			return;
		}
		this._editorWidget.setPosition(this._cursorPosition);
		this._editorWidget.setScrollPosition({ scrollTop: this._editorWidget.getTopForLineNumber(this._cursorPosition.lineNumber) });
	}

	private _hide(): void {
		this._disposeListeners();
		this._accessibleBuffer.classList.remove(CssClass.Active);
		this._xtermElement.classList.remove(CssClass.Hide);
	}

	private async _updateEditor(dataChanged?: boolean): Promise<void> {
		if (this._isUpdating) {
			this._pendingUpdates++;
			return;
		}
		this._isUpdating = true;
		const model = await this._updateModel(dataChanged);
		if (!model) {
			return;
		}
		this._isUpdating = false;
		if (this._pendingUpdates) {
			this._logService.debug('TerminalAccessibleBuffer._updateEditor: pending updates', this._pendingUpdates);
			this._pendingUpdates--;
			await this._updateEditor(dataChanged);
		}
	}

	private _layout(): void {
		this._bufferTracker.reset();
		this._editorWidget.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight });
	}

	private _registerListeners(): void {
		this._xterm.raw.onWriteParsed(async () => {
			if (this._xterm.raw.buffer.active.baseY === 0) {
				await this._updateEditor(true);
			}
		});
		const onRequestUpdateEditor = Event.latch(this._xterm.raw.onScroll);
		this._listeners.push(onRequestUpdateEditor(async () => await this._updateEditor(true)));
		this._listeners.push(this._instance.onDidRequestFocus(() => this._editorWidget.focus()));
	}

	private _disposeListeners(): void {
		for (const listener of this._listeners) {
			listener.dispose();
		}
	}

	async getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}

	private _getDefaultCursorPosition(): { lineNumber: number; column: number } | undefined {
		const modelLineCount = this._editorWidget.getModel()?.getLineCount();
		return modelLineCount ? { lineNumber: modelLineCount, column: 1 } : undefined;
	}

	private async _updateModel(dataChanged?: boolean): Promise<ITextModel> {
		const linesBefore = this._bufferTracker.lines.length;
		this._bufferTracker.update();
		const linesAfter = this._bufferTracker.lines.length;
		const modelChanged = linesBefore !== linesAfter;

		// Save the view state before the update if it was set by the user
		let savedViewState: IEditorViewState | undefined;
		if (dataChanged) {
			savedViewState = withNullAsUndefined(this._editorWidget.saveViewState());
		}

		let model = this._editorWidget.getModel();
		const text = this._bufferTracker.lines.join('\n');
		if (model) {
			model.setValue(text);
		} else {
			model = await this.getTextModel(this._instance.resource.with({ fragment: text }));
		}
		this._editorWidget.setModel(model);

		// If the model changed due to new data, restore the view state
		// If the model changed due to a refresh or the cursor is a the top, set to the bottom of the buffer
		// Otherwise, don't change the position
		const positionTopOfBuffer = this._editorWidget.getPosition()?.lineNumber === 1 && this._editorWidget.getPosition()?.column === 1;
		if (savedViewState) {
			this._editorWidget.restoreViewState(savedViewState);
		} else if (modelChanged || positionTopOfBuffer) {
			const defaultPosition = this._getDefaultCursorPosition();
			if (defaultPosition) {
				this._editorWidget.setPosition(defaultPosition);
				this._editorWidget.setScrollPosition({ scrollTop: this._editorWidget.getTopForLineNumber(defaultPosition.lineNumber) });
			}
		}
		return model!;
	}
}

interface ICommandWithEditorLine { command: ITerminalCommand; lineNumber: number }

