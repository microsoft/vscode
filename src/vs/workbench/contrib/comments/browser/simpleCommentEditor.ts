/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOption, IEditorOptions } from '../../../../editor/common/config/editorOptions';
import { EditorAction, EditorContributionInstantiation, EditorExtensionsRegistry, IEditorContributionDescription } from '../../../../editor/browser/editorExtensions';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget';
import { IContextKeyService, RawContextKey, IContextKey } from '../../../../platform/contextkey/common/contextkey';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { ICommandService } from '../../../../platform/commands/common/commands';

// Allowed Editor Contributions:
import { MenuPreventer } from '../../codeEditor/browser/menuPreventer';
import { EditorDictation } from '../../codeEditor/browser/dictation/editorDictation';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2';
import { TabCompletionController } from '../../snippets/browser/tabCompletion';
import { IThemeService } from '../../../../platform/theme/common/themeService';
import { INotificationService } from '../../../../platform/notification/common/notification';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility';
import { ICommentThreadWidget } from '../common/commentThreadWidget';
import { CommentContextKeys } from '../common/commentContextKeys';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser';
import { clamp } from '../../../../base/common/numbers';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/inlineCompletionsController';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController';
import { SelectionClipboardContributionID } from '../../codeEditor/browser/selectionClipboard';
import { MenuId } from '../../../../platform/actions/common/actions';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController2';
import { MarginHoverController } from '../../../../editor/contrib/hover/browser/marginHoverController';

export const ctxCommentEditorFocused = new RawContextKey<boolean>('commentEditorFocused', false);
export const MIN_EDITOR_HEIGHT = 5 * 18;
export const MAX_EDITOR_HEIGHT = 25 * 18;

export interface LayoutableEditor {
	getLayoutInfo(): { height: number };
}

export class SimpleCommentEditor extends CodeEditorWidget {
	private _parentThread: ICommentThreadWidget;
	private _commentEditorFocused: IContextKey<boolean>;
	private _commentEditorEmpty: IContextKey<boolean>;

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		scopedContextKeyService: IContextKeyService,
		parentThread: ICommentThreadWidget,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: <IEditorContributionDescription[]>[
				{ id: MenuPreventer.ID, ctor: MenuPreventer, instantiation: EditorContributionInstantiation.BeforeFirstInteraction },
				{ id: ContextMenuController.ID, ctor: ContextMenuController, instantiation: EditorContributionInstantiation.BeforeFirstInteraction },
				{ id: SuggestController.ID, ctor: SuggestController, instantiation: EditorContributionInstantiation.Eager },
				{ id: SnippetController2.ID, ctor: SnippetController2, instantiation: EditorContributionInstantiation.Lazy },
				{ id: TabCompletionController.ID, ctor: TabCompletionController, instantiation: EditorContributionInstantiation.Eager }, // eager because it needs to define a context key
				{ id: EditorDictation.ID, ctor: EditorDictation, instantiation: EditorContributionInstantiation.Lazy },
				...EditorExtensionsRegistry.getSomeEditorContributions([
					CopyPasteController.ID,
					DropIntoEditorController.ID,
					LinkDetector.ID,
					MessageController.ID,
					ContentHoverController.ID,
					MarginHoverController.ID,
					SelectionClipboardContributionID,
					InlineCompletionsController.ID,
					CodeActionController.ID,
				])
			],
			contextMenuId: MenuId.SimpleEditorContext
		};

		super(domElement, options, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, scopedContextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService);

		this._commentEditorFocused = ctxCommentEditorFocused.bindTo(scopedContextKeyService);
		this._commentEditorEmpty = CommentContextKeys.commentIsEmpty.bindTo(scopedContextKeyService);
		this._commentEditorEmpty.set(!this.getModel()?.getValueLength());
		this._parentThread = parentThread;

		this._register(this.onDidFocusEditorWidget(_ => this._commentEditorFocused.set(true)));

		this._register(this.onDidChangeModelContent(e => this._commentEditorEmpty.set(!this.getModel()?.getValueLength())));
		this._register(this.onDidBlurEditorWidget(_ => this._commentEditorFocused.reset()));
	}

	getParentThread(): ICommentThreadWidget {
		return this._parentThread;
	}

	protected _getActions(): Iterable<EditorAction> {
		return EditorExtensionsRegistry.getEditorActions();
	}

	public static getEditorOptions(configurationService: IConfigurationService): IEditorOptions {
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
				horizontalHasArrows: false,
				alwaysConsumeMouseWheel: false
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
			dropIntoEditor: { enabled: true },
			autoClosingBrackets: configurationService.getValue('editor.autoClosingBrackets'),
			quickSuggestions: false,
			accessibilitySupport: configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport'),
			fontFamily: configurationService.getValue('editor.fontFamily'),
		};
	}
}

export function calculateEditorHeight(parentEditor: LayoutableEditor, editor: ICodeEditor, currentHeight: number): number {
	const layoutInfo = editor.getLayoutInfo();
	const lineHeight = editor.getOption(EditorOption.lineHeight);
	const contentHeight = (editor._getViewModel()?.getLineCount()! * lineHeight); // Can't just call getContentHeight() because it returns an incorrect, large, value when the editor is first created.
	if ((contentHeight > layoutInfo.height) ||
		(contentHeight < layoutInfo.height && currentHeight > MIN_EDITOR_HEIGHT)) {
		const linesToAdd = Math.ceil((contentHeight - layoutInfo.height) / lineHeight);
		const proposedHeight = layoutInfo.height + (lineHeight * linesToAdd);
		return clamp(proposedHeight, MIN_EDITOR_HEIGHT, clamp(parentEditor.getLayoutInfo().height - 90, MIN_EDITOR_HEIGHT, MAX_EDITOR_HEIGHT));
	}
	return currentHeight;
}
