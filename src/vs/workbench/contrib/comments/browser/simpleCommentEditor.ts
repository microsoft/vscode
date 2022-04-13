/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { EditorAction, EditorExtensionsRegistry, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';

// Allowed Editor Contributions:
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { TabCompletionController } from 'vs/workbench/contrib/snippets/browser/tabCompletion';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export const ctxCommentEditorFocused = new RawContextKey<boolean>('commentEditorFocused', false);


export class SimpleCommentEditor extends CodeEditorWidget {
	private _parentThread: ICommentThreadWidget;
	private _commentEditorFocused: IContextKey<boolean>;
	private _commentEditorEmpty: IContextKey<boolean>;

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		parentThread: ICommentThreadWidget,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: <IEditorContributionDescription[]>[
				{ id: MenuPreventer.ID, ctor: MenuPreventer },
				{ id: ContextMenuController.ID, ctor: ContextMenuController },
				{ id: SuggestController.ID, ctor: SuggestController },
				{ id: SnippetController2.ID, ctor: SnippetController2 },
				{ id: TabCompletionController.ID, ctor: TabCompletionController },
			]
		};

		super(domElement, options, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService);

		this._commentEditorFocused = ctxCommentEditorFocused.bindTo(contextKeyService);
		this._commentEditorEmpty = CommentContextKeys.commentIsEmpty.bindTo(contextKeyService);
		this._commentEditorEmpty.set(!this.getValue());
		this._parentThread = parentThread;

		this._register(this.onDidFocusEditorWidget(_ => this._commentEditorFocused.set(true)));

		this._register(this.onDidChangeModelContent(e => this._commentEditorEmpty.set(!this.getValue())));
		this._register(this.onDidBlurEditorWidget(_ => this._commentEditorFocused.reset()));
	}

	getParentThread(): ICommentThreadWidget {
		return this._parentThread;
	}

	protected _getActions(): EditorAction[] {
		return EditorExtensionsRegistry.getEditorActions();
	}

	public static getEditorOptions(): IEditorOptions {
		return {
			wordWrap: 'on',
			glyphMargin: false,
			lineNumbers: 'off',
			folding: false,
			selectOnLineNumbers: false,
			scrollbar: {
				vertical: 'visible',
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			lineDecorationsWidth: 0,
			scrollBeyondLastLine: false,
			renderLineHighlight: 'none',
			fixedOverflowWidgets: true,
			acceptSuggestionOnEnter: 'smart',
			minimap: {
				enabled: false
			},
			quickSuggestions: false
		};
	}
}
