/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';

import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { TerminalEditorInput } from 'vs/workbench/contrib/editorTerminals/editorInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import type { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

const PADDING = 5;

export class TerminalEditor extends BaseEditor {
	static readonly ID = 'vs.workbench.contrib.eitorTerminals.editor';

	private container: HTMLElement | undefined;
	private dimension: DOM.Dimension | undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(TerminalEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = document.createElement('div');
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.style.boxSizing = 'border-box';
		this.container.style.padding = PADDING + 'px';

		parent.appendChild(this.container);
	}

	layout(dimension: DOM.Dimension): void {
		this.dimension = dimension;
		this.terminalInstance?.layout({ width: dimension.width - 2 * PADDING, height: dimension.height - 2 * PADDING });
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.terminalInstance?.setVisible(visible);
	}

	private get terminalInput(): TerminalEditorInput | undefined {
		return this.input as TerminalEditorInput;
	}

	private get terminalInstance(): ITerminalInstance | undefined {
		return this.terminalInput?.terminalInstance;
	}

	clearInput() {
		this.terminalInput?.release();
		super.clearInput();
	}

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		if (this.container === undefined) {
			throw new Error('No Container');
		}

		if (this.input !== undefined) {
			throw new Error('Input should be undefined');
		}

		await super.setInput(input, options, token);
		this.container.innerHTML = '';

		const terminalInput: TerminalEditorInput | undefined = this.terminalInput;
		if (terminalInput !== undefined && terminalInput.used) {
			this.container.innerHTML = 'The terminal can\'t be opened two times in different editors';
			return;
		} else {
			terminalInput?.use();
		}

		let target = document.createElement('div');
		this.container.appendChild(target);

		this.terminalInstance?.attachToElement(target);
		if (this.dimension !== undefined) {
			this.terminalInstance?.layout(this.dimension);
		}
		this.terminalInstance?.setVisible(this.isVisible());
	}

	focus(): void {
		this.terminalInstance?.focusWhenReady();
	}

	dispose() {
		this.terminalInput?.release();
		super.dispose();
	}
}
