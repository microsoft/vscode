/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import { Dimension, Builder } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { EditorOptions } from 'vs/workbench/common/editor';
import { DebugErrorEditorInput } from 'vs/workbench/parts/debug/browser/debugEditorInputs';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
const $ = dom.$;

export class DebugErrorEditor extends BaseEditor {
	static ID = 'workbench.editor.debugError';
	private container: HTMLElement;

	constructor( @ITelemetryService telemetryService: ITelemetryService) {
		super(DebugErrorEditor.ID, telemetryService);
	}

	public createEditor(parent: Builder): void {
		this.container = dom.append(parent.getHTMLElement(), $('.debug-error-editor'));
	}

	public layout(dimension: Dimension): void {
		this.container.style.width = `${dimension.width}px`;
		this.container.style.height = `${dimension.height}px`;
	}

	public setInput(input: DebugErrorEditorInput, options: EditorOptions): TPromise<void> {
		this.container.textContent = input.value;
		return super.setInput(input, options);
	}
}
