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
import type { IMarker, Terminal } from 'xterm';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IQuickInputService, IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ILogService } from 'vs/platform/log/common/log';

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
	private _lastMarker: IMarker | undefined;
	private _lastRowCount: number = 0;
	private _cachedLines: string[] = [];
	private _inProgressUpdate: boolean = false;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: Pick<IXtermTerminal, 'getFont'> & { raw: Terminal },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService
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

		// initialize terminal listeners
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
		this.add(this._xterm.raw.onScroll(async () => {
			if (this._isActive()) {
				await this._updateEditor();
			}
		}));
		this.add(this._xterm.raw.onWriteParsed(async () => {
			// dynamically update the viewport before there's a scroll event
			if (!this._xterm.raw.buffer.active.baseY && this._isActive()) {
				await this._updateEditor();
			}
		}));

		// initialize editor listeners
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
		this._updateEditor();
	}

	private _trackFocus(): void {
		this.add(this._focusTracker.onDidFocus(() => this._focusedContextKey.set(true)));
		this.add(this._focusTracker.onDidBlur(() => this._focusedContextKey.reset()));
	}

	private _isActive(): boolean {
		return this._accessibleBuffer.classList.contains(CssClass.Active);
	}

	private _hide(): void {
		this._accessibleBuffer.classList.remove(CssClass.Active);
		this._xtermElement.classList.remove(CssClass.Hide);
	}

	private async _updateEditor(): Promise<void> {
		if (this._inProgressUpdate) {
			return;
		}
		this._inProgressUpdate = true;
		const model = await this._updateModel();
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
		this._inProgressUpdate = false;
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

	private async _updateModel(): Promise<ITextModel> {
		if (this._lastMarker?.isDisposed) {
			this._cachedLines = [];
		}
		if (this._xterm.raw.buffer.active.length > this._cachedLines.length) {
			this._removeViewportContent();
			this._updateScrollbackContent();
		}
		this._updateViewportContent();
		const model = await this._getTextModel(this._instance.resource.with({ fragment: this._cachedLines.join('\n') }));
		if (!model) {
			throw new Error('Could not create accessible buffer editor model');
		}
		this._editorWidget.setModel(model);
		this._logService.debug('Accessible buffer update complete, cached ', this._cachedLines.length, ' lines');
		this._lastMarker = this._xterm.raw.registerMarker();
		this._lastRowCount = this._xterm.raw.rows;
		return model;
	}

	private _removeViewportContent(): void {
		if (this._cachedLines.length && this._lastMarker?.line) {
			// remove previous viewport content in case it has changed
			for (let i = this._lastMarker.line; i < this._lastMarker.line + this._lastRowCount; i++) {
				this._cachedLines.pop();
			}
			this._logService.debug('Removed ', this._lastRowCount, ' lines from cached lines, now ', this._cachedLines.length, ' lines');
		}
	}

	private _updateViewportContent(): void {
		const buffer = this._xterm.raw.buffer.active;
		if (!buffer) {
			return;
		}
		let currentLine: string = '';
		for (let i = buffer.baseY; i < buffer.baseY + this._lastRowCount ?? this._xterm.raw.rows - 1; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				continue;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === (buffer.baseY + this._lastRowCount ?? this._xterm.raw.rows) - 1) {
				this._cachedLines.push(currentLine.replace(new RegExp(' ', 'g'), '\xA0'));
				currentLine = '';
			}
		}
		this._logService.debug('Viewport content update complete, ', this._cachedLines.length, ' lines');
	}

	private _updateScrollbackContent(): void {
		if (!this._cachedLines) {
			this._cachedLines = [];
		}
		const buffer = this._xterm.raw.buffer.active;
		if (!buffer) {
			return;
		}
		const scrollback: number = this._configurationService.getValue(TerminalSettingId.Scrollback);
		const maxBufferSize = scrollback + this._xterm.raw.rows - 1;
		const end = Math.min(maxBufferSize, buffer.baseY);
		const start = this._lastMarker?.line ? this._lastMarker.line - this._lastRowCount : 0;
		this._logService.debug('Updating scrollback content, start: ', start, ' end: ', end, ' buffer size: ', buffer.length);
		const lines: string[] = [];
		let currentLine: string = '';
		for (let i = start; i < end; i++) {
			const line = buffer.getLine(i);
			if (!line) {
				return;
			}
			const isWrapped = buffer.getLine(i + 1)?.isWrapped;
			currentLine += line.translateToString(!isWrapped);
			if (currentLine && !isWrapped || i === end - 1) {
				lines.push(currentLine.replace(new RegExp(' ', 'g'), '\xA0'));
				currentLine = '';
			}
		}
		this._cachedLines.push(...lines);
		this._logService.debug('Updated scrollback content, now ', this._cachedLines.length, ' lines');
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}
		return this._modelService.createModel(resource.fragment, null, resource, false);
	}
}
