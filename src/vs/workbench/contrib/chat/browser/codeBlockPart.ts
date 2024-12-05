/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './codeBlockPart.css';

import * as dom from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { combinedDisposable, Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { IDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { EDITOR_FONT_DEFAULTS, EditorOption, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { EndOfLinePreference, ITextModel } from '../../../../editor/common/model.js';
import { TextModelText } from '../../../../editor/common/model/textModelText.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { DefaultModelSHA1Computer } from '../../../../editor/common/services/modelService.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { BracketMatchingController } from '../../../../editor/contrib/bracketMatching/browser/bracketMatching.js';
import { ColorDetector } from '../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { GotoDefinitionAtPositionEditorContribution } from '../../../../editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { ViewportSemanticTokensContribution } from '../../../../editor/contrib/semanticTokens/browser/viewportSemanticTokens.js';
import { SmartSelectController } from '../../../../editor/contrib/smartSelect/browser/smartSelect.js';
import { WordHighlighterContribution } from '../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ResourceLabel } from '../../../browser/labels.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { InspectEditorTokensController } from '../../codeEditor/browser/inspectEditorTokens/inspectEditorTokens.js';
import { MenuPreventer } from '../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../codeEditor/browser/selectionClipboard.js';
import { getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { IMarkdownVulnerability } from '../common/annotations.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IChatResponseModel, IChatTextEditGroup } from '../common/chatModel.js';
import { IChatResponseViewModel, isResponseVM } from '../common/chatViewModel.js';
import { ChatTreeItem } from './chat.js';
import { IChatRendererDelegate } from './chatListRenderer.js';
import { ChatEditorOptions } from './chatOptions.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { AsyncIterableObject } from '../../../../base/common/async.js';
import { InlineChatController } from '../../inlineChat/browser/inlineChatController.js';

const $ = dom.$;

export interface ICodeBlockData {
	readonly codeBlockIndex: number;
	readonly element: unknown;

	readonly textModel: Promise<ITextModel>;
	readonly languageId: string;

	readonly codemapperUri?: URI;

	readonly vulns?: readonly IMarkdownVulnerability[];
	readonly range?: Range;

	readonly parentContextKeyService?: IContextKeyService;
	readonly hideToolbar?: boolean;
}

/**
 * Special markdown code block language id used to render a local file.
 *
 * The text of the code path should be a {@link LocalFileCodeBlockData} json object.
 */
export const localFileLanguageId = 'vscode-local-file';


export function parseLocalFileData(text: string) {

	interface RawLocalFileCodeBlockData {
		readonly uri: UriComponents;
		readonly range?: IRange;
	}

	let data: RawLocalFileCodeBlockData;
	try {
		data = JSON.parse(text);
	} catch (e) {
		throw new Error('Could not parse code block local file data');
	}

	let uri: URI;
	try {
		uri = URI.revive(data?.uri);
	} catch (e) {
		throw new Error('Invalid code block local file data URI');
	}

	let range: IRange | undefined;
	if (data.range) {
		// Note that since this is coming from extensions, position are actually zero based and must be converted.
		range = new Range(data.range.startLineNumber + 1, data.range.startColumn + 1, data.range.endLineNumber + 1, data.range.endColumn + 1);
	}

	return { uri, range };
}

export interface ICodeBlockActionContext {
	code: string;
	codemapperUri?: URI;
	languageId?: string;
	codeBlockIndex: number;
	element: unknown;
}

const defaultCodeblockPadding = 10;
export class CodeBlockPart extends Disposable {
	protected readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	public readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	public readonly editor: CodeEditorWidget;
	protected readonly toolbar: MenuWorkbenchToolBar;
	private readonly contextKeyService: IContextKeyService;

	public readonly element: HTMLElement;

	private readonly vulnsButton: Button;
	private readonly vulnsListElement: HTMLElement;

	private currentCodeBlockData: ICodeBlockData | undefined;
	private currentScrollWidth = 0;

	private isDisposed = false;

	private resourceContextKey: ResourceContextKey;

	constructor(
		private readonly options: ChatEditorOptions,
		readonly menuId: MenuId,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModelService protected readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();
		this.element = $('.interactive-result-code-block');

		this.resourceContextKey = this._register(instantiationService.createInstance(ResourceContextKey));
		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService])));
		const editorElement = dom.append(this.element, $('.interactive-result-editor'));
		this.editor = this.createEditor(scopedInstantiationService, editorElement, {
			...getSimpleEditorOptions(this.configurationService),
			readOnly: true,
			lineNumbers: 'off',
			selectOnLineNumbers: true,
			scrollBeyondLastLine: false,
			lineDecorationsWidth: 8,
			dragAndDrop: false,
			padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
			mouseWheelZoom: false,
			scrollbar: {
				vertical: 'hidden',
				alwaysConsumeMouseWheel: false
			},
			definitionLinkOpensInPeek: false,
			gotoLocation: {
				multiple: 'goto',
				multipleDeclarations: 'goto',
				multipleDefinitions: 'goto',
				multipleImplementations: 'goto',
			},
			ariaLabel: localize('chat.codeBlockHelp', 'Code block'),
			overflowWidgetsDomNode,
			...this.getEditorOptionsFromConfig(),
		});

		const toolbarElement = dom.append(this.element, $('.interactive-result-code-block-toolbar'));
		const editorScopedService = this.editor.contextKeyService.createScoped(toolbarElement);
		const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
		this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarElement, menuId, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));

		const vulnsContainer = dom.append(this.element, $('.interactive-result-vulns'));
		const vulnsHeaderElement = dom.append(vulnsContainer, $('.interactive-result-vulns-header', undefined));
		this.vulnsButton = this._register(new Button(vulnsHeaderElement, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined,
			supportIcons: true
		}));

		this.vulnsListElement = dom.append(vulnsContainer, $('ul.interactive-result-vulns-list'));

		this._register(this.vulnsButton.onDidClick(() => {
			const element = this.currentCodeBlockData!.element as IChatResponseViewModel;
			element.vulnerabilitiesListExpanded = !element.vulnerabilitiesListExpanded;
			this.vulnsButton.label = this.getVulnerabilitiesLabel();
			this.element.classList.toggle('chat-vulnerabilities-collapsed', !element.vulnerabilitiesListExpanded);
			this._onDidChangeContentHeight.fire();
			// this.updateAriaLabel(collapseButton.element, referencesLabel, element.usedReferencesExpanded);
		}));

		this._register(this.toolbar.onDidChangeDropdownVisibility(e => {
			toolbarElement.classList.toggle('force-visibility', e);
		}));

		this._configureForScreenReader();
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
				this._configureForScreenReader();
			}
		}));

		this._register(this.options.onDidChange(() => {
			this.editor.updateOptions(this.getEditorOptionsFromConfig());
		}));

		this._register(this.editor.onDidScrollChange(e => {
			this.currentScrollWidth = e.scrollWidth;
		}));
		this._register(this.editor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._onDidChangeContentHeight.fire();
			}
		}));
		this._register(this.editor.onDidBlurEditorWidget(() => {
			this.element.classList.remove('focused');
			WordHighlighterContribution.get(this.editor)?.stopHighlighting();
			this.clearWidgets();
		}));
		this._register(this.editor.onDidFocusEditorWidget(() => {
			this.element.classList.add('focused');
			WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
		}));

		// Parent list scrolled
		if (delegate.onDidScroll) {
			this._register(delegate.onDidScroll(e => {
				this.clearWidgets();
			}));
		}
	}

	override dispose() {
		this.isDisposed = true;
		super.dispose();
	}

	get uri(): URI | undefined {
		return this.editor.getModel()?.uri;
	}

	private createEditor(instantiationService: IInstantiationService, parent: HTMLElement, options: Readonly<IEditorConstructionOptions>): CodeEditorWidget {
		return this._register(instantiationService.createInstance(CodeEditorWidget, parent, options, {
			isSimpleWidget: false,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				MenuPreventer.ID,
				SelectionClipboardContributionID,
				ContextMenuController.ID,

				WordHighlighterContribution.ID,
				ViewportSemanticTokensContribution.ID,
				BracketMatchingController.ID,
				SmartSelectController.ID,
				ContentHoverController.ID,
				GlyphHoverController.ID,
				MessageController.ID,
				GotoDefinitionAtPositionEditorContribution.ID,
				ColorDetector.ID,
				LinkDetector.ID,

				InspectEditorTokensController.ID,
			])
		}));
	}

	focus(): void {
		this.editor.focus();
	}

	private updatePaddingForLayout() {
		// scrollWidth = "the width of the content that needs to be scrolled"
		// contentWidth = "the width of the area where content is displayed"
		const horizontalScrollbarVisible = this.currentScrollWidth > this.editor.getLayoutInfo().contentWidth;
		const scrollbarHeight = this.editor.getLayoutInfo().horizontalScrollbarHeight;
		const bottomPadding = horizontalScrollbarVisible ?
			Math.max(defaultCodeblockPadding - scrollbarHeight, 2) :
			defaultCodeblockPadding;
		this.editor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
	}

	private _configureForScreenReader(): void {
		const toolbarElt = this.toolbar.getElement();
		if (this.accessibilityService.isScreenReaderOptimized()) {
			toolbarElt.style.display = 'block';
			toolbarElt.ariaLabel = this.configurationService.getValue(AccessibilityVerbositySettingId.Chat) ? localize('chat.codeBlock.toolbarVerbose', 'Toolbar for code block which can be reached via tab') : localize('chat.codeBlock.toolbar', 'Code block toolbar');
		} else {
			toolbarElt.style.display = '';
		}
	}

	private getEditorOptionsFromConfig(): IEditorOptions {
		return {
			wordWrap: this.options.configuration.resultEditor.wordWrap,
			fontLigatures: this.options.configuration.resultEditor.fontLigatures,
			bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
			fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ?
				EDITOR_FONT_DEFAULTS.fontFamily :
				this.options.configuration.resultEditor.fontFamily,
			fontSize: this.options.configuration.resultEditor.fontSize,
			fontWeight: this.options.configuration.resultEditor.fontWeight,
			lineHeight: this.options.configuration.resultEditor.lineHeight,
		};
	}

	layout(width: number): void {
		const contentHeight = this.getContentHeight();
		const editorBorder = 2;
		this.editor.layout({ width: width - editorBorder, height: contentHeight });
		this.updatePaddingForLayout();
	}

	private getContentHeight() {
		if (this.currentCodeBlockData?.range) {
			const lineCount = this.currentCodeBlockData.range.endLineNumber - this.currentCodeBlockData.range.startLineNumber + 1;
			const lineHeight = this.editor.getOption(EditorOption.lineHeight);
			return lineCount * lineHeight;
		}
		return this.editor.getContentHeight();
	}

	async render(data: ICodeBlockData, width: number) {
		this.currentCodeBlockData = data;
		if (data.parentContextKeyService) {
			this.contextKeyService.updateParent(data.parentContextKeyService);
		}

		if (this.options.configuration.resultEditor.wordWrap === 'on') {
			// Initialize the editor with the new proper width so that getContentHeight
			// will be computed correctly in the next call to layout()
			this.layout(width);
		}

		await this.updateEditor(data);
		if (this.isDisposed) {
			return;
		}

		this.layout(width);
		this.editor.updateOptions({ ariaLabel: localize('chat.codeBlockLabel', "Code block {0}", data.codeBlockIndex + 1) });

		if (data.hideToolbar) {
			dom.hide(this.toolbar.getElement());
		} else {
			dom.show(this.toolbar.getElement());
		}

		if (data.vulns?.length && isResponseVM(data.element)) {
			dom.clearNode(this.vulnsListElement);
			this.element.classList.remove('no-vulns');
			this.element.classList.toggle('chat-vulnerabilities-collapsed', !data.element.vulnerabilitiesListExpanded);
			dom.append(this.vulnsListElement, ...data.vulns.map(v => $('li', undefined, $('span.chat-vuln-title', undefined, v.title), ' ' + v.description)));
			this.vulnsButton.label = this.getVulnerabilitiesLabel();
		} else {
			this.element.classList.add('no-vulns');
		}
	}

	reset() {
		this.clearWidgets();
	}

	private clearWidgets() {
		ContentHoverController.get(this.editor)?.hideContentHover();
		GlyphHoverController.get(this.editor)?.hideContentHover();
	}

	private async updateEditor(data: ICodeBlockData): Promise<void> {
		const textModel = await data.textModel;
		this.editor.setModel(textModel);
		if (data.range) {
			this.editor.setSelection(data.range);
			this.editor.revealRangeInCenter(data.range, ScrollType.Immediate);
		}

		this.toolbar.context = {
			code: textModel.getTextBuffer().getValueInRange(data.range ?? textModel.getFullModelRange(), EndOfLinePreference.TextDefined),
			codeBlockIndex: data.codeBlockIndex,
			element: data.element,
			languageId: textModel.getLanguageId(),
			codemapperUri: data.codemapperUri,
		} satisfies ICodeBlockActionContext;
		this.resourceContextKey.set(textModel.uri);
	}

	private getVulnerabilitiesLabel(): string {
		if (!this.currentCodeBlockData || !this.currentCodeBlockData.vulns) {
			return '';
		}

		const referencesLabel = this.currentCodeBlockData.vulns.length > 1 ?
			localize('vulnerabilitiesPlural', "{0} vulnerabilities", this.currentCodeBlockData.vulns.length) :
			localize('vulnerabilitiesSingular', "{0} vulnerability", 1);
		const icon = (element: IChatResponseViewModel) => element.vulnerabilitiesListExpanded ? Codicon.chevronDown : Codicon.chevronRight;
		return `${referencesLabel} $(${icon(this.currentCodeBlockData.element as IChatResponseViewModel).id})`;
	}
}

export class ChatCodeBlockContentProvider extends Disposable implements ITextModelContentProvider {

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeChatCodeBlock, this));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		return this._modelService.createModel('', null, resource);
	}
}

//

export interface ICodeCompareBlockActionContext {
	readonly element: IChatResponseViewModel;
	readonly diffEditor: IDiffEditor;
	readonly edit: IChatTextEditGroup;
}

export interface ICodeCompareBlockDiffData {
	modified: ITextModel;
	original: ITextModel;
	originalSha1: string;
}

export interface ICodeCompareBlockData {
	readonly element: ChatTreeItem;

	readonly edit: IChatTextEditGroup;

	readonly diffData: Promise<ICodeCompareBlockDiffData | undefined>;

	readonly parentContextKeyService?: IContextKeyService;
	// readonly hideToolbar?: boolean;
}


// long-lived object that sits in the DiffPool and that gets reused
export class CodeCompareBlockPart extends Disposable {
	protected readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	public readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	private readonly contextKeyService: IContextKeyService;
	private readonly diffEditor: DiffEditorWidget;
	private readonly resourceLabel: ResourceLabel;
	private readonly toolbar: MenuWorkbenchToolBar;
	readonly element: HTMLElement;
	private readonly messageElement: HTMLElement;

	private readonly _lastDiffEditorViewModel = this._store.add(new MutableDisposable());
	private currentScrollWidth = 0;

	constructor(
		private readonly options: ChatEditorOptions,
		readonly menuId: MenuId,
		delegate: IChatRendererDelegate,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModelService protected readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILabelService private readonly labelService: ILabelService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.element = $('.interactive-result-code-block');
		this.element.classList.add('compare');

		this.messageElement = dom.append(this.element, $('.message'));
		this.messageElement.setAttribute('role', 'status');
		this.messageElement.tabIndex = 0;

		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this.contextKeyService],
			[IEditorProgressService, new class implements IEditorProgressService {
				_serviceBrand: undefined;
				show(_total: unknown, _delay?: unknown) {
					return emptyProgressRunner;
				}
				async showWhile(promise: Promise<unknown>, _delay?: number): Promise<void> {
					await promise;
				}
			}],
		)));
		const editorHeader = dom.append(this.element, $('.interactive-result-header.show-file-icons'));
		const editorElement = dom.append(this.element, $('.interactive-result-editor'));
		this.diffEditor = this.createDiffEditor(scopedInstantiationService, editorElement, {
			...getSimpleEditorOptions(this.configurationService),
			lineNumbers: 'on',
			selectOnLineNumbers: true,
			scrollBeyondLastLine: false,
			lineDecorationsWidth: 12,
			dragAndDrop: false,
			padding: { top: defaultCodeblockPadding, bottom: defaultCodeblockPadding },
			mouseWheelZoom: false,
			scrollbar: {
				vertical: 'hidden',
				alwaysConsumeMouseWheel: false
			},
			definitionLinkOpensInPeek: false,
			gotoLocation: {
				multiple: 'goto',
				multipleDeclarations: 'goto',
				multipleDefinitions: 'goto',
				multipleImplementations: 'goto',
			},
			ariaLabel: localize('chat.codeBlockHelp', 'Code block'),
			overflowWidgetsDomNode,
			...this.getEditorOptionsFromConfig(),
		});

		this.resourceLabel = this._register(scopedInstantiationService.createInstance(ResourceLabel, editorHeader, { supportIcons: true }));

		const editorScopedService = this.diffEditor.getModifiedEditor().contextKeyService.createScoped(editorHeader);
		const editorScopedInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService])));
		this.toolbar = this._register(editorScopedInstantiationService.createInstance(MenuWorkbenchToolBar, editorHeader, menuId, {
			menuOptions: {
				shouldForwardArgs: true
			}
		}));

		this._configureForScreenReader();
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this._configureForScreenReader()));
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectedKeys.has(AccessibilityVerbositySettingId.Chat)) {
				this._configureForScreenReader();
			}
		}));

		this._register(this.options.onDidChange(() => {
			this.diffEditor.updateOptions(this.getEditorOptionsFromConfig());
		}));

		this._register(this.diffEditor.getModifiedEditor().onDidScrollChange(e => {
			this.currentScrollWidth = e.scrollWidth;
		}));
		this._register(this.diffEditor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this._onDidChangeContentHeight.fire();
			}
		}));
		this._register(this.diffEditor.getModifiedEditor().onDidBlurEditorWidget(() => {
			this.element.classList.remove('focused');
			WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.stopHighlighting();
			this.clearWidgets();
		}));
		this._register(this.diffEditor.getModifiedEditor().onDidFocusEditorWidget(() => {
			this.element.classList.add('focused');
			WordHighlighterContribution.get(this.diffEditor.getModifiedEditor())?.restoreViewState(true);
		}));


		// Parent list scrolled
		if (delegate.onDidScroll) {
			this._register(delegate.onDidScroll(e => {
				this.clearWidgets();
			}));
		}
	}

	get uri(): URI | undefined {
		return this.diffEditor.getModifiedEditor().getModel()?.uri;
	}

	private createDiffEditor(instantiationService: IInstantiationService, parent: HTMLElement, options: Readonly<IEditorConstructionOptions>): DiffEditorWidget {
		const widgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: false,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				MenuPreventer.ID,
				SelectionClipboardContributionID,
				ContextMenuController.ID,

				WordHighlighterContribution.ID,
				ViewportSemanticTokensContribution.ID,
				BracketMatchingController.ID,
				SmartSelectController.ID,
				ContentHoverController.ID,
				GlyphHoverController.ID,
				GotoDefinitionAtPositionEditorContribution.ID,
			])
		};

		return this._register(instantiationService.createInstance(DiffEditorWidget, parent, {
			scrollbar: { useShadows: false, alwaysConsumeMouseWheel: false, ignoreHorizontalScrollbarInContentHeight: true, },
			renderMarginRevertIcon: false,
			diffCodeLens: false,
			scrollBeyondLastLine: false,
			stickyScroll: { enabled: false },
			originalAriaLabel: localize('original', 'Original'),
			modifiedAriaLabel: localize('modified', 'Modified'),
			diffAlgorithm: 'advanced',
			readOnly: false,
			isInEmbeddedEditor: true,
			useInlineViewWhenSpaceIsLimited: true,
			experimental: {
				useTrueInlineView: true,
			},
			renderSideBySideInlineBreakpoint: 300,
			renderOverviewRuler: false,
			compactMode: true,
			hideUnchangedRegions: { enabled: true, contextLineCount: 1 },
			renderGutterMenu: false,
			lineNumbersMinChars: 1,
			...options
		}, { originalEditor: widgetOptions, modifiedEditor: widgetOptions }));
	}

	focus(): void {
		this.diffEditor.focus();
	}

	private updatePaddingForLayout() {
		// scrollWidth = "the width of the content that needs to be scrolled"
		// contentWidth = "the width of the area where content is displayed"
		const horizontalScrollbarVisible = this.currentScrollWidth > this.diffEditor.getModifiedEditor().getLayoutInfo().contentWidth;
		const scrollbarHeight = this.diffEditor.getModifiedEditor().getLayoutInfo().horizontalScrollbarHeight;
		const bottomPadding = horizontalScrollbarVisible ?
			Math.max(defaultCodeblockPadding - scrollbarHeight, 2) :
			defaultCodeblockPadding;
		this.diffEditor.updateOptions({ padding: { top: defaultCodeblockPadding, bottom: bottomPadding } });
	}

	private _configureForScreenReader(): void {
		const toolbarElt = this.toolbar.getElement();
		if (this.accessibilityService.isScreenReaderOptimized()) {
			toolbarElt.style.display = 'block';
			toolbarElt.ariaLabel = this.configurationService.getValue(AccessibilityVerbositySettingId.Chat) ? localize('chat.codeBlock.toolbarVerbose', 'Toolbar for code block which can be reached via tab') : localize('chat.codeBlock.toolbar', 'Code block toolbar');
		} else {
			toolbarElt.style.display = '';
		}
	}

	private getEditorOptionsFromConfig(): IEditorOptions {
		return {
			wordWrap: this.options.configuration.resultEditor.wordWrap,
			fontLigatures: this.options.configuration.resultEditor.fontLigatures,
			bracketPairColorization: this.options.configuration.resultEditor.bracketPairColorization,
			fontFamily: this.options.configuration.resultEditor.fontFamily === 'default' ?
				EDITOR_FONT_DEFAULTS.fontFamily :
				this.options.configuration.resultEditor.fontFamily,
			fontSize: this.options.configuration.resultEditor.fontSize,
			fontWeight: this.options.configuration.resultEditor.fontWeight,
			lineHeight: this.options.configuration.resultEditor.lineHeight,
		};
	}

	layout(width: number): void {
		const editorBorder = 2;

		const toolbar = dom.getTotalHeight(this.toolbar.getElement());
		const content = this.diffEditor.getModel()
			? this.diffEditor.getContentHeight()
			: dom.getTotalHeight(this.messageElement);

		const dimension = new dom.Dimension(width - editorBorder, toolbar + content);
		this.element.style.height = `${dimension.height}px`;
		this.element.style.width = `${dimension.width}px`;
		this.diffEditor.layout(dimension.with(undefined, content - editorBorder));
		this.updatePaddingForLayout();
	}


	async render(data: ICodeCompareBlockData, width: number, token: CancellationToken) {
		if (data.parentContextKeyService) {
			this.contextKeyService.updateParent(data.parentContextKeyService);
		}

		if (this.options.configuration.resultEditor.wordWrap === 'on') {
			// Initialize the editor with the new proper width so that getContentHeight
			// will be computed correctly in the next call to layout()
			this.layout(width);
		}

		await this.updateEditor(data, token);

		this.layout(width);
		this.diffEditor.updateOptions({ ariaLabel: localize('chat.compareCodeBlockLabel', "Code Edits") });

		this.resourceLabel.element.setFile(data.edit.uri, {
			fileKind: FileKind.FILE,
			fileDecorations: { colors: true, badges: false }
		});
	}

	reset() {
		this.clearWidgets();
	}

	private clearWidgets() {
		ContentHoverController.get(this.diffEditor.getOriginalEditor())?.hideContentHover();
		ContentHoverController.get(this.diffEditor.getModifiedEditor())?.hideContentHover();
		GlyphHoverController.get(this.diffEditor.getOriginalEditor())?.hideContentHover();
		GlyphHoverController.get(this.diffEditor.getModifiedEditor())?.hideContentHover();
	}

	private async updateEditor(data: ICodeCompareBlockData, token: CancellationToken): Promise<void> {

		if (!isResponseVM(data.element)) {
			return;
		}

		const isEditApplied = Boolean(data.edit.state?.applied ?? 0);

		ChatContextKeys.editApplied.bindTo(this.contextKeyService).set(isEditApplied);

		this.element.classList.toggle('no-diff', isEditApplied);

		if (isEditApplied) {
			assertType(data.edit.state?.applied);

			const uriLabel = this.labelService.getUriLabel(data.edit.uri, { relative: true, noPrefix: true });

			let template: string;
			if (data.edit.state.applied === 1) {
				template = localize('chat.edits.1', "Applied 1 change in [[``{0}``]]", uriLabel);
			} else if (data.edit.state.applied < 0) {
				template = localize('chat.edits.rejected', "Edits in [[``{0}``]] have been rejected", uriLabel);
			} else {
				template = localize('chat.edits.N', "Applied {0} changes in [[``{1}``]]", data.edit.state.applied, uriLabel);
			}

			const message = renderFormattedText(template, {
				renderCodeSegments: true,
				actionHandler: {
					callback: () => {
						this.openerService.open(data.edit.uri, { fromUserGesture: true, allowCommands: false });
					},
					disposables: this._store,
				}
			});

			dom.reset(this.messageElement, message);
		}

		const diffData = await data.diffData;

		if (!isEditApplied && diffData) {
			const viewModel = this.diffEditor.createViewModel({
				original: diffData.original,
				modified: diffData.modified
			});

			await viewModel.waitForDiff();

			if (token.isCancellationRequested) {
				return;
			}

			const listener = Event.any(diffData.original.onWillDispose, diffData.modified.onWillDispose)(() => {
				// this a bit weird and basically duplicates https://github.com/microsoft/vscode/blob/7cbcafcbcc88298cfdcd0238018fbbba8eb6853e/src/vs/editor/browser/widget/diffEditor/diffEditorWidget.ts#L328
				// which cannot call `setModel(null)` without first complaining
				this.diffEditor.setModel(null);
			});
			this.diffEditor.setModel(viewModel);
			this._lastDiffEditorViewModel.value = combinedDisposable(listener, viewModel);

		} else {
			this.diffEditor.setModel(null);
			this._lastDiffEditorViewModel.value = undefined;
			this._onDidChangeContentHeight.fire();
		}

		this.toolbar.context = {
			edit: data.edit,
			element: data.element,
			diffEditor: this.diffEditor,
		} satisfies ICodeCompareBlockActionContext;
	}
}

export class DefaultChatTextEditor {

	private readonly _sha1 = new DefaultModelSHA1Computer();

	constructor(
		@ITextModelService private readonly modelService: ITextModelService,
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IDialogService private readonly dialogService: IDialogService,
	) { }

	async apply(response: IChatResponseModel | IChatResponseViewModel, item: IChatTextEditGroup, diffEditor: IDiffEditor | undefined): Promise<void> {

		if (!response.response.value.includes(item)) {
			// bogous item
			return;
		}

		if (item.state?.applied) {
			// already applied
			return;
		}

		if (!diffEditor) {
			for (const candidate of this.editorService.listDiffEditors()) {
				if (!candidate.getContainerDomNode().isConnected) {
					continue;
				}
				const model = candidate.getModel();
				if (!model || !isEqual(model.original.uri, item.uri) || model.modified.uri.scheme !== Schemas.vscodeChatCodeCompareBlock) {
					diffEditor = candidate;
					break;
				}
			}
		}

		const edits = diffEditor
			? await this._applyWithDiffEditor(diffEditor, item)
			: await this._apply(item);

		response.setEditApplied(item, edits);
	}

	private async _applyWithDiffEditor(diffEditor: IDiffEditor, item: IChatTextEditGroup) {
		const model = diffEditor.getModel();
		if (!model) {
			return 0;
		}

		const diff = diffEditor.getDiffComputationResult();
		if (!diff || diff.identical) {
			return 0;
		}


		if (!await this._checkSha1(model.original, item)) {
			return 0;
		}

		const modified = new TextModelText(model.modified);
		const edits = diff.changes2.map(i => i.toRangeMapping().toTextEdit(modified).toSingleEditOperation());

		model.original.pushStackElement();
		model.original.pushEditOperations(null, edits, () => null);
		model.original.pushStackElement();

		return edits.length;
	}

	private async _apply(item: IChatTextEditGroup) {
		const ref = await this.modelService.createModelReference(item.uri);
		try {

			if (!await this._checkSha1(ref.object.textEditorModel, item)) {
				return 0;
			}

			ref.object.textEditorModel.pushStackElement();
			let total = 0;
			for (const group of item.edits) {
				const edits = group.map(TextEdit.asEditOperation);
				ref.object.textEditorModel.pushEditOperations(null, edits, () => null);
				total += edits.length;
			}
			ref.object.textEditorModel.pushStackElement();
			return total;

		} finally {
			ref.dispose();
		}
	}

	private async _checkSha1(model: ITextModel, item: IChatTextEditGroup) {
		if (item.state?.sha1 && this._sha1.computeSHA1(model) && this._sha1.computeSHA1(model) !== item.state.sha1) {
			const result = await this.dialogService.confirm({
				message: localize('interactive.compare.apply.confirm', "The original file has been modified."),
				detail: localize('interactive.compare.apply.confirm.detail', "Do you want to apply the changes anyway?"),
			});

			if (!result.confirmed) {
				return false;
			}
		}
		return true;
	}

	discard(response: IChatResponseModel | IChatResponseViewModel, item: IChatTextEditGroup) {
		if (!response.response.value.includes(item)) {
			// bogous item
			return;
		}

		if (item.state?.applied) {
			// already applied
			return;
		}

		response.setEditApplied(item, -1);
	}

	async preview(response: IChatResponseModel | IChatResponseViewModel, item: IChatTextEditGroup) {
		if (item.state?.applied) {
			// already applied
			return false;
		}

		if (!response.response.value.includes(item)) {
			// bogous item
			return false;
		}

		const firstEdit = item.edits[0]?.[0];
		if (!firstEdit) {
			return false;
		}
		const textEdits = AsyncIterableObject.fromArray(item.edits);

		const editorToApply = await this.editorService.openCodeEditor({ resource: item.uri }, null);
		if (editorToApply) {
			const inlineChatController = InlineChatController.get(editorToApply);
			if (inlineChatController) {
				const tokenSource = new CancellationTokenSource();
				editorToApply.revealLineInCenterIfOutsideViewport(firstEdit.range.startLineNumber);
				const promise = inlineChatController.reviewEdits(firstEdit.range, textEdits, tokenSource.token);
				response.setEditApplied(item, 1);
				promise.finally(() => {
					tokenSource.dispose();
				});
				return true;
			}
		}
		return false;
	}
}
