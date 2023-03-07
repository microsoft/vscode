/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { ITerminalFont } from 'vs/workbench/contrib/terminal/common/terminal';
import { IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { Terminal } from 'xterm';

const enum AccessibleBufferConstants {
	Scheme = 'terminal-accessible-buffer'
}

export class AccessibleBufferWidget extends DisposableStore {
	public static ID: string = AccessibleBufferConstants.Scheme;
	private _accessibleBuffer: HTMLElement;
	private _bufferEditor: CodeEditorWidget;
	private _editorContainer: HTMLElement;
	private _commandFinishedDisposable: IDisposable | undefined;
	private _refreshSelection: boolean = true;
	private _registered: boolean = false;
	private _lastContentLength: number = 0;
	private _lastBufferLine: number = 0;
	private _font: ITerminalFont;
	private _xtermElement: HTMLElement;
	private _content: string = '';

	constructor(
		private readonly _xterm: IXtermTerminal & { raw: Terminal },
		private readonly _capabilities: ITerminalCapabilityStore,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([LinkDetector.ID, SelectionClipboardContributionID])
		};
		this._font = _xterm.getFont();
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
		const elt = _xterm.raw.element;
		if (elt) {
			elt.insertAdjacentElement('beforebegin', this._accessibleBuffer);
		}
		this._editorContainer = document.createElement('div');
		this._bufferEditor = this._instantiationService.createInstance(CodeEditorWidget, this._editorContainer, editorOptions, codeEditorWidgetOptions);
		this.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectedKeys.has(TerminalSettingId.FontFamily)) {
				this._font = _xterm.getFont();
			}
		}));
		this.add(this._xterm.raw.onData(() => {
			if (this._accessibleBuffer.classList.contains('active')) {
				this._refreshSelection = true;
				this._refresh();
			}
		}));
	}

	private _hide(): void {
		this._accessibleBuffer.classList.remove('active');
		this._xtermElement.classList.remove('hide');
		this._xterm.raw.focus();
	}

	private async _updateContent(refresh?: boolean): Promise<ITextModel> {
		const sb = new StringBuilder(10000);
		if (refresh) {
			sb.appendString(this._content);
			sb.appendString(this._getContent(this._lastBufferLine));
		} else {
			const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
			sb.appendString(!!commandDetection ? this._getShellIntegrationContent() : this._getContent());
		}
		this._content = sb.build();
		const model = await this._getTextModel(URI.from({ scheme: AccessibleBufferConstants.Scheme, fragment: this._content }));
		if (model) {
			this._bufferEditor.setModel(model);
		} else {
			throw new Error('Could not create model');
		}
		return model;
	}

	private async _refresh(): Promise<void> {
		const model = await this._updateContent(true);
		const lineNumber = model.getLineCount() - 1;
		if (this._lastContentLength !== this._content.length || this._refreshSelection) {
			this._bufferEditor.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
			this._bufferEditor.setScrollTop(this._bufferEditor.getScrollHeight());
			this._refreshSelection = false;
			this._lastContentLength = this._content.length;
		}
		this._accessibleBuffer.replaceChildren(this._editorContainer);
		this._bufferEditor.focus();
	}

	async show(): Promise<void> {
		if (!this._registered) {
			this._registerListeners();
		}
		await this._refresh();
		this._accessibleBuffer.tabIndex = -1;
		this._accessibleBuffer.classList.add('active');
		this._xtermElement.classList.add('hide');
	}

	private _registerListeners(): void {
		const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
		this._bufferEditor.layout({ width: this._xtermElement.clientWidth, height: this._xtermElement.clientHeight });
		this._bufferEditor.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Escape || e.keyCode === KeyCode.Tab) {
				this._hide();
			}
		});
		if (commandDetection) {
			this._commandFinishedDisposable = commandDetection.onCommandFinished(() => this._refreshSelection = true);
			this.add(this._commandFinishedDisposable);
		}
		this._registered = true;
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		return this._modelService.createModel(resource.fragment, null, resource, false);
	}

	private _getShellIntegrationContent(): string {
		const commands = this._capabilities.get(TerminalCapability.CommandDetection)?.commands;
		const sb = new StringBuilder(10000);
		if (!commands?.length) {
			return this._getContent();
		}
		for (const command of commands) {
			sb.appendString(command.command.replace(new RegExp(' ', 'g'), '\xA0'));
			if (command.exitCode !== 0) {
				sb.appendString(` exited with code ${command.exitCode}`);
			}
			sb.appendString('\n');
			sb.appendString(command.getOutput()?.replace(new RegExp(' ', 'g'), '\xA0') || '');
		}
		return sb.build();
	}

	private _getContent(startLine?: number): string {
		const lines: string[] = [];
		let currentLine: string = '';
		const buffer = this._xterm?.raw.buffer.active;
		if (!buffer) {
			return '';
		}
		const end = buffer.length;
		for (let i = startLine ?? 0; i < end; i++) {
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
		this._lastBufferLine = end;
		return lines.join('\n');
	}
}
