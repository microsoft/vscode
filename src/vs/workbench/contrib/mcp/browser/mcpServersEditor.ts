/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mcpServersEditor.css';
import { localize } from '../../../../nls.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { IPreferencesEditorPane } from '../../preferences/browser/preferencesEditorRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService, WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { DefaultStyleController } from '../../../../base/browser/ui/list/listWidget.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { editorBackground, focusBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { settingsHeaderForeground, settingsHeaderHoverForeground } from '../../preferences/common/settingsEditorColorRegistry.js';
import { ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Orientation, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { preferencesSashBorder } from '../../preferences/browser/preferencesIcons.js';
import { McpServersView } from './mcpServersView.js';
import { IMcpWorkbenchService } from '../common/mcpTypes.js';

type TocSeparator = { id: 'separator'; label: '' };
type TocEntry = { id: string; label: string } | TocSeparator;

export class McpServersEditorPane extends Themable implements IPreferencesEditorPane {

	static readonly ID: string = 'workbench.preferences.mcpServers';
	static readonly TITLE: string = localize('mcpServersEditorTitle', "MCP Servers");

	private readonly element: HTMLElement;
	private readonly splitView: SplitView<number>;
	private readonly tocTree: WorkbenchObjectTree<TocEntry>;
	private readonly serversView: McpServersView;
	private query: string | undefined = undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IListService private readonly listService: IListService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(themeService);
		this.element = DOM.$('.mcp-servers-editor');

		const sidebarView = DOM.append(this.element, DOM.$('.sidebar-view'));
		const sidebarContainer = DOM.append(sidebarView, DOM.$('.sidebar-container'));

		const contentsView = DOM.append(this.element, DOM.$('.contents-view'));
		const contentsContainer = DOM.append(contentsView, DOM.$('.contents-container'));
		this.serversView = this._register(this.instantiationService.createInstance(McpServersView, contentsContainer));

		this.splitView = new SplitView(this.element, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: true
		});

		this.tocTree = this.createTocTree(sidebarContainer);
		this.splitView.addView({
			onDidChange: Event.None,
			element: sidebarView,
			minimumSize: 150,
			maximumSize: 250,
			layout: (width, _, height) => {
				sidebarView.style.width = `${width}px`;
				if (height) {
					this.tocTree.getHTMLElement().style.height = `${height}px`;
					this.tocTree.layout(height, width);
				}
			}
		}, 300, undefined, true);

		this.splitView.addView({
			onDidChange: Event.None,
			element: contentsView,
			minimumSize: 500,
			maximumSize: Number.POSITIVE_INFINITY,
			layout: (width, _, height) => {
				contentsView.style.width = `${width}px`;
				contentsView.style.height = `${height}px`;
				if (height) {
					this.serversView.layout(new DOM.Dimension(width, height));
				}
			}
		}, Sizing.Distribute, undefined, true);

		this.updateStyles();

		this.updateMcpServerList();
		this._register(this.tocTree.onDidChangeSelection(() => this.updateMcpServerList()));
	}

	getDomNode(): HTMLElement {
		return this.element;
	}

	layout(dimension: DOM.Dimension): void {
		this.element.style.marginTop = `14px`;
		const height = dimension.height - 14;
		this.splitView.layout(dimension.width, height);
		this.splitView.el.style.height = `${height}px`;
	}

	search(query: string): void {
		this.query = query;
		this.updateMcpServerList();
	}

	override updateStyles(): void {
		const borderColor = this.theme.getColor(preferencesSashBorder)!;
		this.splitView?.style({ separatorBorder: borderColor });
	}

	private async updateMcpServerList(): Promise<void> {
		const selected = this.tocTree.getSelection();
		let servers;
		if (selected[0]?.id === 'user') {
			servers = await this.mcpWorkbenchService.queryLocal();
		} else {
			servers = await this.mcpWorkbenchService.queryGallery({ text: this.query });
		}
		this.serversView.setElements(servers);
	}

	private createTocTree(parent: HTMLElement): WorkbenchObjectTree<TocEntry> {
		const element = DOM.append(parent, DOM.$('.mcp-servers-toc'));
		const tocTree = new WorkbenchObjectTree<TocEntry>(
			'McpServersToC',
			element,
			{
				getHeight: () => 22,
				getTemplateId: (element) => { return element.id === 'separator' ? TocSeparatorRenderer.TEMPLATE_ID : TocEntryRenderer.TEMPLATE_ID; },
			},
			[new TocEntryRenderer(), new TocSeparatorRenderer()],
			{
				identityProvider: {
					getId: (e) => e.id,
				},
				accessibilityProvider: {
					getAriaLabel: (e) => e.label,
					getWidgetAriaLabel: () => localize('mcpServersEditorAriaLabel', "MCP Servers Editor"),
				},
				openOnSingleClick: true,
				multipleSelectionSupport: false,
				styleController: id => new DefaultStyleController(domStylesheetsJs.createStyleSheet(this.element), id),
				collapseByDefault: true,
				horizontalScrolling: false,
				hideTwistiesOfChildlessElements: true,
				renderIndentGuides: RenderIndentGuides.None
			},
			this.instantiationService,
			this.contextKeyService,
			this.listService,
			this.configurationService
		);

		tocTree.style(getListStyles({
			listBackground: editorBackground,
			listFocusOutline: focusBorder,
			listActiveSelectionBackground: editorBackground,
			listActiveSelectionForeground: settingsHeaderForeground,
			listFocusAndSelectionBackground: editorBackground,
			listFocusAndSelectionForeground: settingsHeaderForeground,
			listFocusBackground: editorBackground,
			listFocusForeground: settingsHeaderHoverForeground,
			listHoverForeground: settingsHeaderHoverForeground,
			listHoverBackground: editorBackground,
			listInactiveSelectionBackground: editorBackground,
			listInactiveSelectionForeground: settingsHeaderForeground,
			listInactiveFocusBackground: editorBackground,
			listInactiveFocusOutline: editorBackground,
			treeIndentGuidesStroke: undefined,
			treeInactiveIndentGuidesStroke: undefined
		}));

		tocTree.setChildren(null, [
			{ element: { id: 'popular', label: localize('popular', "Popular") } },
			{
				element: { id: 'category', label: localize('category', "Categories"), },
				children: [
					{ element: { id: 'AI', label: localize('AI', "AI") }, },
					{ element: { id: 'Azure', label: localize('Azure', "Azure") }, },
					{ element: { id: 'Data Science', label: localize('Data Science', "Data Science") }, },
					{ element: { id: 'Debuggers', label: localize('Debuggers', "Debuggers") }, },
					{ element: { id: 'Developer Tools', label: localize('Developer Tools', "Developer Tools") }, },
					{ element: { id: 'Machine Learning', label: localize('Machine Learning', "Machine Learning") }, },
					{ element: { id: 'Notebooks', label: localize('Notebooks', "Notebooks") }, },
					{ element: { id: 'SCM', label: localize('SCM', "SCM") }, },
					{ element: { id: 'Testing', label: localize('Testing', "Testing") }, },
					{ element: { id: 'Other', label: localize('Other', "Other") }, },
				]
			},
			{
				element: { id: 'installed', label: localize('installed', "Installed") },
				children: [
					{ element: { id: 'user', label: localize('user', "User") } },
					{ element: { id: 'workspace', label: localize('workspace', "Workspace") } },
				]
			}
		]);

		return tocTree;
	}
}

interface ITocEntryTemplateData {
	readonly label: HTMLElement;
}

class TocEntryRenderer implements ITreeRenderer<TocEntry, void, ITocEntryTemplateData> {
	static readonly TEMPLATE_ID = 'tocEntry';

	readonly templateId: string = TocEntryRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): ITocEntryTemplateData {
		const label = DOM.append(container, DOM.$('.toc-entry-label'));
		return { label };
	}

	renderElement(item: ITreeNode<TocEntry, void>, index: number, templateData: ITocEntryTemplateData, height: number | undefined): void {
		templateData.label.textContent = item.element.label;
	}

	disposeTemplate(): void {
	}

}

class TocSeparatorRenderer implements ITreeRenderer<TocSeparator, void, void> {
	static readonly TEMPLATE_ID = 'tocSeparator';

	readonly templateId: string = TocSeparatorRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): void {
		DOM.append(container, DOM.$('.toc-separator'));
	}

	renderElement(item: ITreeNode<TocSeparator, void>, index: number, templateData: void, height: number | undefined): void {
	}

	disposeTemplate(): void {
	}

}
