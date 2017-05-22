/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditorAction, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';

// Allowed Editor Contributions:
import { MenuPreventer } from 'vs/editor/contrib/multicursor/browser/menuPreventer';
import { SelectionClipboard } from 'vs/editor/contrib/selectionClipboard/electron-browser/selectionClipboard';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { TabCompletionController } from 'vs/workbench/parts/snippets/electron-browser/tabCompletion';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class ReplInputEditor extends CodeEditorWidget {
	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService
	) {
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService, themeService);
	}

	protected _getContributions(): IEditorContributionCtor[] {
		return [
			MenuPreventer,
			SelectionClipboard,
			ContextMenuController,
			SuggestController,
			SnippetController2,
			TabCompletionController,
		];
	}

	protected _getActions(): EditorAction[] {
		return CommonEditorRegistry.getEditorActions();
	}
}
