/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import {Dimension, Builder} from 'vs/base/browser/builder';
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorContributionCtor} from 'vs/editor/browser/editorBrowser';
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';
import {IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {EditorOptions} from 'vs/workbench/common/editor';
import {DebugErrorEditorInput} from 'vs/workbench/parts/debug/browser/debugEditorInputs';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';

// Allowed Editor Contributions:
import {MenuPreventer} from 'vs/editor/contrib/multicursor/browser/menuPreventer';
import {SelectionClipboard} from 'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard';
import {ContextMenuController} from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import {SuggestController} from 'vs/editor/contrib/suggest/browser/suggestController';
import {SnippetController} from 'vs/editor/contrib/snippet/common/snippetController';
import {TabCompletionController} from 'vs/editor/contrib/suggest/browser/tabCompletion';

const $ = dom.$;

export class ReplInputEditor extends CodeEditorWidget {
	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService);
	}

	protected _getContributions(): IEditorContributionCtor[] {
		return [
			MenuPreventer,
			SelectionClipboard,
			ContextMenuController,
			SuggestController,
			SnippetController,
			TabCompletionController
		];
	}

	protected _getActions(): EditorAction[] {
		return CommonEditorRegistry.getEditorActions();
	}
}

export class ReplEditor extends CodeEditorWidget {

	protected _getContributions(): IEditorContributionCtor[] {
		// TODO@Isidor check contributions, add find contribution, remove suggest
		return [
			MenuPreventer,
			SelectionClipboard,
			ContextMenuController,
			SuggestController,
			SnippetController,
			TabCompletionController
		];
	}

	protected _getActions(): EditorAction[] {
		return CommonEditorRegistry.getEditorActions();
	}
}

export class DebugErrorEditor extends BaseEditor {
	static ID = 'workbench.editor.debugError';
	private container: HTMLElement;

	constructor(@ITelemetryService telemetryService: ITelemetryService) {
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
