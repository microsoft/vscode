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
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalFont, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
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
	private _font: ITerminalFont;
	private _xtermElement: HTMLElement;

	constructor(
		private readonly _xterm: IXtermTerminal & { raw: Terminal },
		private readonly _processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
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
	}

	private _hide(): void {
		this._accessibleBuffer.classList.remove('active');
		this._xtermElement.classList.remove('hide');
		this._xterm.raw.focus();
	}

	async show(): Promise<void> {
		const commandDetection = this._processManager.capabilities.get(TerminalCapability.CommandDetection);
		const fragment = !!commandDetection ? this._getShellIntegrationContent() : this._getAllContent();
		const model = await this._getTextModel(URI.from({ scheme: AccessibleBufferConstants.Scheme, fragment }));
		if (model) {
			this._bufferEditor.setModel(model);
		}
		if (!this._registered) {
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
		this._xtermElement.tabIndex = 0;
		this._accessibleBuffer.classList.add('active');
		this._xtermElement.classList.add('hide');
		if (this._lastContentLength !== fragment.length || this._refreshSelection) {
			let lineNumber = 1;
			const lineCount = model?.getLineCount();
			if (lineCount && model) {
				lineNumber = commandDetection ? lineCount - 1 : lineCount > 2 ? lineCount - 2 : 1;
			}
			this._bufferEditor.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 });
			this._bufferEditor.setScrollTop(this._bufferEditor.getScrollHeight());
			this._refreshSelection = false;
			this._lastContentLength = fragment.length;
		}
		this._accessibleBuffer.replaceChildren(this._editorContainer);
		this._bufferEditor.focus();
	}

	private async _getTextModel(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		return this._modelService.createModel(resource.fragment, null, resource, false);
	}

	private _getShellIntegrationContent(): string {
		const commands = this._processManager.capabilities.get(TerminalCapability.CommandDetection)?.commands;
		const sb = new StringBuilder(10000);
		if (!commands?.length) {
			return this._getAllContent();
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

	private _getAllContent(): string {
		const lines: string[] = [];
		let currentLine: string = '';
		const buffer = this._xterm?.raw.buffer.active;
		if (!buffer) {
			return '';
		}
		const end = buffer.length;
		for (let i = 0; i < end; i++) {
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
}
