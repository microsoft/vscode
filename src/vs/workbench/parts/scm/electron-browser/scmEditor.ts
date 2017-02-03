/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEditorOptions, IDimension } from 'vs/editor/common/editorCommon';
import { EditorAction, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { MenuPreventer } from 'vs/editor/contrib/multicursor/browser/menuPreventer';
import { SelectionClipboard } from 'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { TabCompletionController } from 'vs/editor/contrib/suggest/browser/tabCompletion';
import { ModesHoverController } from 'vs/editor/contrib/hover/browser/hover';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';

class SCMCodeEditorWidget extends CodeEditorWidget {

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
			TabCompletionController,
			ModesHoverController
		];
	}

	protected _getActions(): EditorAction[] {
		return CommonEditorRegistry.getEditorActions();
	}
}

export const InSCMInputContextKey = new RawContextKey<boolean>('inSCMInput', false);

export class SCMEditor {

	private editor: SCMCodeEditorWidget;
	private disposables: IDisposable[] = [];

	private get editorOptions(): IEditorOptions {
		return {
			wrappingColumn: 0,
			overviewRulerLanes: 0,
			glyphMargin: false,
			lineNumbers: 'off',
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			scrollbar: {
				horizontal: 'hidden'
			},
			lineDecorationsWidth: 0,
			scrollBeyondLastLine: false,
			theme: this.themeService.getColorTheme().id,
			renderLineHighlight: 'none',
			fixedOverflowWidgets: true,
			acceptSuggestionOnEnter: false,
			wordWrap: true
		};
	}

	constructor(
		container: HTMLElement,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ISCMService private scmService: ISCMService
	) {
		const scopedContextKeyService = this.contextKeyService.createScoped(container);
		InSCMInputContextKey.bindTo(scopedContextKeyService).set(true);
		this.disposables.push(scopedContextKeyService);

		const services = new ServiceCollection();
		services.set(IContextKeyService, scopedContextKeyService);
		const scopedInstantiationService = instantiationService.createChild(services);

		this.editor = scopedInstantiationService.createInstance(SCMCodeEditorWidget, container, this.editorOptions);
		this.themeService.onDidColorThemeChange(e => this.editor.updateOptions(this.editorOptions), null, this.disposables);

		this.editor.setModel(this.scmService.inputBoxModel);
	}

	get lineHeight(): number {
		return this.editor.getConfiguration().lineHeight;
	}

	// TODO@joao TODO@alex isn't there a better way to get the number of lines?
	get lineCount(): number {
		const model = this.scmService.inputBoxModel;
		const modelLength = model.getValueLength();
		const lastPosition = model.getPositionAt(modelLength);
		const lastLineTop = this.editor.getTopForPosition(lastPosition.lineNumber, lastPosition.column);
		const viewHeight = lastLineTop + this.lineHeight;

		return viewHeight / this.lineHeight;
	}

	layout(dimension: IDimension): void {
		this.editor.layout(dimension);
	}

	focus(): void {
		this.editor.focus();
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}