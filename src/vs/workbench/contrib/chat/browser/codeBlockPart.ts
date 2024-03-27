/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codeBlockPart';

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { EDITOR_FONT_DEFAULTS, EditorOption, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { IResolvedTextEditorModel, ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { BracketMatchingController } from 'vs/editor/contrib/bracketMatching/browser/bracketMatching';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { GotoDefinitionAtPositionEditorContribution } from 'vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition';
import { HoverController } from 'vs/editor/contrib/hover/browser/hover';
import { ViewportSemanticTokensContribution } from 'vs/editor/contrib/semanticTokens/browser/viewportSemanticTokens';
import { SmartSelectController } from 'vs/editor/contrib/smartSelect/browser/smartSelect';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IChatRendererDelegate } from 'vs/workbench/contrib/chat/browser/chatListRenderer';
import { ChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatOptions';
import { IChatResponseViewModel, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IMarkdownVulnerability } from '../common/annotations';
import { TabFocus } from 'vs/editor/browser/config/tabFocus';

const $ = dom.$;

export interface ICodeBlockData {
	readonly codeBlockIndex: number;
	readonly element: unknown;

	readonly textModel: Promise<IResolvedTextEditorModel>;
	readonly languageId: string;

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

		this.contextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this.contextKeyService]));
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
		const editorScopedInstantiationService = scopedInstantiationService.createChild(new ServiceCollection([IContextKeyService, editorScopedService]));
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
				HoverController.ID,
				GotoDefinitionAtPositionEditorContribution.ID,
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

	async render(data: ICodeBlockData, width: number, editable: boolean | undefined) {
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

		this.layout(width);
		if (editable) {
			this._register(this.editor.onDidFocusEditorWidget(() => TabFocus.setTabFocusMode(true)));
			this._register(this.editor.onDidBlurEditorWidget(() => TabFocus.setTabFocusMode(false)));
		}
		this.editor.updateOptions({ ariaLabel: localize('chat.codeBlockLabel', "Code block {0}", data.codeBlockIndex + 1), readOnly: !editable });

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
		HoverController.get(this.editor)?.hideContentHover();
	}

	private async updateEditor(data: ICodeBlockData): Promise<void> {
		const textModel = (await data.textModel).textEditorModel;
		this.editor.setModel(textModel);
		if (data.range) {
			this.editor.setSelection(data.range);
			this.editor.revealRangeInCenter(data.range, ScrollType.Immediate);
		}

		this.toolbar.context = {
			code: textModel.getTextBuffer().getValueInRange(data.range ?? textModel.getFullModelRange(), EndOfLinePreference.TextDefined),
			codeBlockIndex: data.codeBlockIndex,
			element: data.element,
			languageId: textModel.getLanguageId()
		} satisfies ICodeBlockActionContext;
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
