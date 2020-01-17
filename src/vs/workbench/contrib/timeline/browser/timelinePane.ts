/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/timelinePane';
import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IListVirtualDelegate, IIdentityProvider, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { WorkbenchObjectTree, TreeResourceNavigator } from 'vs/platform/list/browser/listService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TimelineItem, ITimelineService } from 'vs/workbench/contrib/timeline/common/timeline';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SideBySideEditor, toResource } from 'vs/workbench/common/editor';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IThemeService, LIGHT, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IViewDescriptorService } from 'vs/workbench/common/views';

type TreeElement = TimelineItem;

export class TimelinePane extends ViewPane {
	static readonly ID = 'timeline';
	static readonly TITLE = nls.localize('timeline', 'Timeline');
	private _tree!: WorkbenchObjectTree<TreeElement, FuzzyScore>;
	private _tokenSource: CancellationTokenSource | undefined;
	private _visibilityDisposables: DisposableStore | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextKeyService protected contextKeyService: IContextKeyService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IEditorService protected editorService: IEditorService,
		@ICommandService protected commandService: ICommandService,
		@ITimelineService protected timelineService: ITimelineService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService);

		const scopedContextKeyService = this._register(this.contextKeyService.createScoped());
		scopedContextKeyService.createKey('view', TimelinePane.ID);
	}

	private onActiveEditorChanged() {
		let uri;

		const editor = this.editorService.activeEditor;
		if (editor) {
			uri = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
		}

		this.updateUri(uri);
	}

	private onProvidersChanged() {
		this.refresh();
	}

	private async refresh() {
		this._tokenSource?.cancel();
		this._tokenSource = new CancellationTokenSource();

		// TODO: Deal with no uri -- use a view title? or keep the last one cached?
		// TODO: Deal with no items -- use a view title?

		let children;
		if (this._uri) {
			const items = await this.timelineService.getTimeline(this._uri, 0, this._tokenSource.token);
			children = items.map(item => ({ element: item }));
		}

		this._tree.setChildren(null, children);
	}

	private _uri: URI | undefined;

	private updateUri(uri: URI | undefined) {
		if (uri?.toString(true) === this._uri?.toString(true)) {
			return;
		}

		this._uri = uri;
		this.refresh();
	}

	focus(): void {
		super.focus();
		this._tree.domFocus();
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this._visibilityDisposables = new DisposableStore();

			this.timelineService.onDidChangeProviders(this.onProvidersChanged, this, this._visibilityDisposables);

			this.editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this, this._visibilityDisposables);
			this.onActiveEditorChanged();
		} else {
			this._visibilityDisposables?.dispose();
		}
	}

	protected layoutBody(height: number, width: number): void {
		this._tree.layout(height, width);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, '.tree-explorer-viewlet-tree-view');
		const treeContainer = document.createElement('div');
		DOM.addClass(treeContainer, 'customview-tree');
		DOM.addClass(treeContainer, 'file-icon-themable-tree');
		DOM.addClass(treeContainer, 'show-file-icons');
		container.appendChild(treeContainer);

		const renderer = this.instantiationService.createInstance(TimelineTreeRenderer);
		this._tree = this.instantiationService.createInstance<
			typeof WorkbenchObjectTree,
			WorkbenchObjectTree<TreeElement, FuzzyScore>
		>(WorkbenchObjectTree, 'TimelinePane', treeContainer, new TimelineListVirtualDelegate(), [renderer], {
			identityProvider: new TimelineIdentityProvider(),
			keyboardNavigationLabelProvider: new TimelineKeyboardNavigationLabelProvider()
		});

		const customTreeNavigator = new TreeResourceNavigator(this._tree, { openOnFocus: false, openOnSelection: false });
		this._register(customTreeNavigator);
		this._register(
			customTreeNavigator.onDidOpenResource(e => {
				if (!e.browserEvent) {
					return;
				}

				const selection = this._tree.getSelection();
				const command = selection.length === 1 ? selection[0]?.command : undefined;
				if (command) {
					this.commandService.executeCommand(command.id, ...(command.arguments || []));
				}
			})
		);
	}
}

export class TimelineElementTemplate {
	static readonly id = 'TimelineElementTemplate';

	constructor(
		readonly container: HTMLElement,
		readonly iconLabel: IconLabel,
		readonly icon: HTMLElement
	) { }
}

export class TimelineIdentityProvider implements IIdentityProvider<TimelineItem> {
	getId(item: TimelineItem): { toString(): string } {
		return `${item.id}|${item.date}`;
	}
}

export class TimelineKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TimelineItem> {
	getKeyboardNavigationLabel(element: TimelineItem): { toString(): string } {
		return element.label;
	}
}

export class TimelineListVirtualDelegate implements IListVirtualDelegate<TimelineItem> {
	getHeight(_element: TimelineItem): number {
		return 22;
	}

	getTemplateId(element: TimelineItem): string {
		return TimelineElementTemplate.id;
	}
}

class TimelineTreeRenderer implements ITreeRenderer<TreeElement, FuzzyScore, TimelineElementTemplate> {
	readonly templateId: string = TimelineElementTemplate.id;

	constructor(@IThemeService private _themeService: IThemeService) { }

	renderTemplate(container: HTMLElement): TimelineElementTemplate {
		DOM.addClass(container, 'custom-view-tree-node-item');
		const icon = DOM.append(container, DOM.$('.custom-view-tree-node-item-icon'));

		const iconLabel = new IconLabel(container, { supportHighlights: true, supportCodicons: true });
		return new TimelineElementTemplate(container, iconLabel, icon);
	}

	renderElement(
		node: ITreeNode<TreeElement, FuzzyScore>,
		index: number,
		template: TimelineElementTemplate,
		height: number | undefined
	): void {
		const { element } = node;

		const icon = this._themeService.getTheme().type === LIGHT ? element.icon : element.iconDark;
		const iconUrl = icon ? URI.revive(icon) : null;

		if (iconUrl) {
			template.icon.className = 'custom-view-tree-node-item-icon';
			template.icon.style.backgroundImage = DOM.asCSSUrl(iconUrl);

		} else {
			let iconClass: string | undefined;
			if (element.themeIcon /*&& !this.isFileKindThemeIcon(element.themeIcon)*/) {
				iconClass = ThemeIcon.asClassName(element.themeIcon);
			}
			template.icon.className = iconClass ? `custom-view-tree-node-item-icon ${iconClass}` : '';
		}

		template.iconLabel.setLabel(element.label, element.description, {
			title: element.detail,
			matches: createMatches(node.filterData)
		});
	}

	disposeTemplate(template: TimelineElementTemplate): void {
		template.iconLabel.dispose();
	}
}
