/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/diffListEditor';
import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IStyleController } from 'vs/base/browser/ui/list/listWidget';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { AccessibilityHelpController } from 'vs/workbench/contrib/codeEditor/browser/accessibility/accessibility';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { TabCompletionController } from 'vs/workbench/contrib/snippets/browser/tabCompletion';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ITextModel } from 'vs/editor/common/model';
import { PixelRatio } from 'vs/base/browser/browser';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';

export const diffEditorWidgetOptions: IDiffEditorConstructionOptions = {
	scrollBeyondLastLine: false,
	scrollbar: {
		verticalScrollbarSize: 14,
		horizontal: 'auto',
		vertical: 'auto',
		useShadows: true,
		verticalHasArrows: false,
		horizontalHasArrows: false,
		alwaysConsumeMouseWheel: false,
	},
	renderLineHighlightOnlyWhenFocus: true,
	overviewRulerLanes: 0,
	overviewRulerBorder: false,
	selectOnLineNumbers: false,
	lineNumbers: 'on',
	lineDecorationsWidth: '2ch',
	fixedOverflowWidgets: true,
	minimap: { enabled: true },
	renderValidationDecorations: 'on',
	renderLineHighlight: 'none',
	glyphMargin: false,
	enableSplitViewResizing: false,
	renderIndicators: true,
	renderMarginRevertIcon: false,
	readOnly: true,
	isInEmbeddedEditor: true,
	renderOverviewRuler: false,
	wordWrap: 'off',
	diffWordWrap: 'off',
	diffAlgorithm: 'smart',
	padding: {
		top: 0,
		bottom: 0
	},
	// overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
	originalEditable: false,
	ignoreTrimWhitespace: false,
	automaticLayout: false,
	dimension: {
		height: 180,
		width: 1000
	}
};

const collapsedIcon = registerIcon('diff-list-editor-resource-collapsed', Codicon.chevronRight, nls.localize('diffListEditorResourceCollapsedIcon', 'Icon to indicate that the resource in the diff list editor is collapsed.'));
const expandedIcon = registerIcon('diff-list-editor-resource-expanded', Codicon.chevronDown, nls.localize('diffListEditorResourceExpandedIcon', 'Icon to indicate that the resource in the diff list editor is expanded.'));

const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
	isSimpleWidget: false,
	contributions: EditorExtensionsRegistry.getSomeEditorContributions([
		MenuPreventer.ID,
		SelectionClipboardContributionID,
		ContextMenuController.ID,
		SuggestController.ID,
		SnippetController2.ID,
		TabCompletionController.ID,
		AccessibilityHelpController.ID
	])
};

export interface IDiffListResource {
	readonly resource: URI;
	readonly original: URI | undefined;
	readonly originalTextModel: ITextModel | undefined;
	readonly modified: URI | undefined;
	readonly modifiedTextModel: ITextModel | undefined;
	expanded: boolean;
}

export interface IDiffListResourceTemplateData {
	readonly resourceHeader: HTMLElement;
	readonly resourceFoldingIndicator: HTMLElement;
	readonly resourceLabel: HTMLElement;
	readonly diffEditorContainer: HTMLElement;
	readonly editorContainer: HTMLElement;
	readonly diffEditor: DiffEditorWidget;
}

export class DiffListDelegate implements IListVirtualDelegate<IDiffListResource> {
	private readonly lineHeight: number;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextModelService protected readonly textModelService: ITextModelService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.lineHeight = BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.value).lineHeight;
	}

	getHeight(element: IDiffListResource): number {
		const originalLineCount = element.originalTextModel?.getLineCount() ?? 0;
		const modifiedLineCount = element.modifiedTextModel?.getLineCount() ?? 0;
		const lineCount = element.expanded ? Math.max(originalLineCount, modifiedLineCount) : 0;

		console.log(element.resource.fsPath, ' - ', (lineCount * this.lineHeight) + 40 + 20);
		return (lineCount * this.lineHeight) + 40 + 20;
	}

	hasDynamicHeight(element: IDiffListResource): boolean {
		return false;
	}

	getTemplateId(element: IDiffListResource): string {
		return DiffListResourceRenderer.TEMPLATE_ID;
	}
}

export class DiffListResourceRenderer implements IListRenderer<IDiffListResource, IDiffListResourceTemplateData>{
	static readonly TEMPLATE_ID = 'resource_diff_side_by_side';
	get templateId(): string { return DiffListResourceRenderer.TEMPLATE_ID; }

	private _editors: DiffEditorWidget[] = [];

	constructor(

		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ILabelService protected readonly labelService: ILabelService
	) { }

	renderTemplate(container: HTMLElement): IDiffListResourceTemplateData {
		const resourceContainer = DOM.append(container, DOM.$('.resource-container'));
		const resourceHeader = DOM.append(resourceContainer, DOM.$('.resource-header'));
		const resourceFoldingIndicator = DOM.append(resourceHeader, DOM.$('.resource-folding-indicator'));
		const resourceLabel = DOM.append(resourceHeader, DOM.$('.resource-label'));
		const diffEditorContainer = DOM.append(resourceContainer, DOM.$('.diff-editor-container'));
		const editorContainer = DOM.append(diffEditorContainer, DOM.$('.editor-container'));

		const diffEditor = this.instantiationService.createInstance(
			DiffEditorWidget,
			editorContainer,
			diffEditorWidgetOptions,
			{
				originalEditor: codeEditorWidgetOptions,
				modifiedEditor: codeEditorWidgetOptions
			});

		return {
			resourceHeader,
			resourceFoldingIndicator,
			resourceLabel,
			diffEditorContainer,
			editorContainer,
			diffEditor
		};
	}

	renderElement(element: IDiffListResource, index: number, templateData: IDiffListResourceTemplateData, height: number | undefined): void {
		this._editors.push(templateData.diffEditor);

		templateData.resourceHeader.classList.toggle('collapsed', !element.expanded);
		templateData.resourceLabel.textContent = this.labelService.getUriLabel(element.resource, { relative: true });
		DOM.reset(templateData.resourceFoldingIndicator, element.expanded ? renderIcon(expandedIcon) : renderIcon(collapsedIcon));

		this.renderDiffEditor(element, index, templateData, height);
	}

	layoutEditors(width: number): void {
		for (const editor of this._editors) {
			editor.layout({ height: editor.getContentHeight(), width: width - 40 - 2 });
		}
	}

	private async renderDiffEditor(element: IDiffListResource, index: number, templateData: IDiffListResourceTemplateData, height: number | undefined): Promise<void> {
		templateData.diffEditor.setModel({
			original: element.originalTextModel!,
			modified: element.modifiedTextModel!
		});

		templateData.diffEditor.layout({
			height: templateData.diffEditor.getContentHeight(),
			width: templateData.resourceHeader.clientWidth,
		});

		templateData.editorContainer.style.height = templateData.diffEditor.getContentHeight() + 'px';
		templateData.diffEditorContainer.style.height = (templateData.diffEditor.getContentHeight() + 5) + 'px';
		templateData.diffEditorContainer.style.display = element.expanded ? 'block' : 'none';
	}

	disposeElement?(element: IDiffListResource, index: number, templateData: IDiffListResourceTemplateData, height: number | undefined): void {
		// throw new Error('Method not implemented.');
	}

	disposeTemplate(templateData: IDiffListResourceTemplateData): void {
		// throw new Error('Method not implemented.');
	}
}

export class DiffList extends WorkbenchList<IDiffListResource> implements IDisposable, IStyleController {
}
