/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { ITitleControlDimensions, IToolbarActions, TitleControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { IEditorGroupsAccessor, IEditorGroupView, IEditorGroupTitleHeight } from 'vs/workbench/browser/parts/editor/editor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { BreadcrumbsControl } from 'vs/workbench/browser/parts/editor/breadcrumbsControl';
import { IFileService } from 'vs/platform/files/common/files';
import { assertIsDefined } from 'vs/base/common/types';
import { RunOnceScheduler } from 'vs/base/common/async';
import { equals } from 'vs/base/common/objects';
import { UNLOCK_GROUP_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { TabBarControl, equalsEditorInputLabel } from 'vs/workbench/browser/parts/editor/tabBarControl';
import { IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';

interface ITabsTitleControlLayoutOptions {

	/**
	 * Whether to force revealing the active tab, even when
	 * the dimensions have not changed. This can be the case
	 * when a tab was made active and needs to be revealed.
	 */
	forceRevealActiveTab?: true;
}

interface IScheduledTabsTitleControlLayout extends IDisposable {

	/**
	 * Associated options with the layout call.
	 */
	options?: ITabsTitleControlLayoutOptions;
}

export class TabsTitleControl extends TitleControl {

	private titleContainer: HTMLElement | undefined;

	private tabBarControl: TabBarControl | undefined;

	private dimensions: ITitleControlDimensions & { used?: Dimension } = {
		container: Dimension.None,
		available: Dimension.None
	};

	private readonly layoutScheduler = this._register(new MutableDisposable<IScheduledTabsTitleControlLayout>());


	constructor(
		parent: HTMLElement,
		accessor: IEditorGroupsAccessor,
		group: IEditorGroupView,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IMenuService menuService: IMenuService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IEditorResolverService editorResolverService: IEditorResolverService
	) {
		super(parent, accessor, group, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, menuService, quickInputService, themeService, configurationService, fileService, editorResolverService);
	}

	protected override create(parent: HTMLElement): void {
		super.create(parent);

		this.titleContainer = parent;

		// Editor Toolbar Container TODO: editorToolbarContainer with call back createEditorActionsToolBar
		const editorToolbarContainer = document.createElement('div');
		editorToolbarContainer.classList.add('editor-actions');

		// Editor Actions Toolbar
		this.createEditorActionsToolBar(editorToolbarContainer);

		// Editor Tabs Container TODO: add container as parent to be added as child...
		this.tabBarControl = this.instantiationService.createInstance(TabBarControl, this.accessor, this.group, editorToolbarContainer, this.enableGroupDragging.bind(this), this.onContextMenu.bind(this), this.doFillResourceDataTransfers.bind(this), () => this.titleHeight);
		this.titleContainer.appendChild(this.tabBarControl.tabsAndActionsContainer);

		// React to decorations changing for our resource labels
		this._register(this.tabBarControl.tabResourceLabels.onDidChangeDecorations(() => this.doHandleDecorationsChange()));

		// Breadcrumbs
		const breadcrumbsContainer = document.createElement('div');
		breadcrumbsContainer.classList.add('tabs-breadcrumbs');
		this.titleContainer.appendChild(breadcrumbsContainer);
		this.createBreadcrumbsControl(breadcrumbsContainer, { showFileIcons: true, showSymbolIcons: true, showDecorationColors: false, showPlaceholder: true });
	}

	private doHandleDecorationsChange(): void {

		// A change to decorations potentially has an impact on the size of tabs
		// so we need to trigger a layout in that case to adjust things
		this.layout(this.dimensions);
	}

	protected override updateEditorActionsToolbar(): void {
		super.updateEditorActionsToolbar();

		// Changing the actions in the toolbar can have an impact on the size of the
		// tab container, so we need to layout the tabs to make sure the active is visible
		this.layout(this.dimensions);
	}

	openEditor(editor: EditorInput): void {
		this.handleOpenedEditors();
	}

	openEditors(editors: EditorInput[]): void {
		this.handleOpenedEditors();
	}

	private handleOpenedEditors(): void {
		const tabBarControl = assertIsDefined(this.tabBarControl);
		for (let i = tabBarControl.tabsContainer.children.length; i < this.group.count; i++) {
			tabBarControl.createTab(i);
		}

		// Make sure to recompute tab labels and detect
		// if a label change occurred that requires a
		// redraw of tabs and update of breadcrumbs.

		const activeEditorChanged = this.didActiveEditorChange();
		const oldActiveTabLabel = tabBarControl.activeTabLabel;
		const oldTabLabelsLength = tabBarControl.tabLabels.length;
		tabBarControl.computeTabLabels();

		// Redraw and update in these cases
		if (
			activeEditorChanged ||													// active editor changed
			oldTabLabelsLength !== tabBarControl.tabLabels.length ||							// number of tabs changed
			!equalsEditorInputLabel(oldActiveTabLabel, tabBarControl.activeTabLabel)	// active editor label changed
		) {
			this.redraw({ forceRevealActiveTab: true });
			this.breadcrumbsControl?.update();
		}

		// Otherwise only layout for revealing in tabs and breadcrumbs
		else {
			this.layout(this.dimensions, { forceRevealActiveTab: true });
			this.breadcrumbsControl?.revealLast();
		}
	}

	private didActiveEditorChange(): boolean {
		const tabBarControl = assertIsDefined(this.tabBarControl);
		return tabBarControl.didActiveEditorChange();
	}

	beforeCloseEditor(editor: EditorInput): void {
		this.tabBarControl?.beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {
		// There are tabs to show
		if (this.group.activeEditor) {

			// Remove tabs that got closed
			this.tabBarControl?.removeClosedTabs();

			// A removal of a label requires to recompute all labels
			this.tabBarControl?.computeTabLabels();

			// Redraw all tabs
			this.redraw({ forceRevealActiveTab: true });
		}

		// No tabs to show
		else {
			this.tabBarControl?.removeAllTabs();
			this.clearEditorActionsToolbar();

			this.breadcrumbsControl?.update();
		}
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number): void {
		this.tabBarControl?.moveEditor(editor, fromIndex, targetIndex);

		// Moving an editor requires a layout to keep the active editor visible
		this.layout(this.dimensions, { forceRevealActiveTab: true });
	}

	pinEditor(editor: EditorInput): void {
		const tabBarControl = assertIsDefined(this.tabBarControl);
		tabBarControl.redrawTabLabel(editor);
	}

	stickEditor(editor: EditorInput): void {
		this.doHandleStickyEditorChange(editor);
	}

	unstickEditor(editor: EditorInput): void {
		this.doHandleStickyEditorChange(editor);
	}

	private doHandleStickyEditorChange(editor: EditorInput): void {
		// Update tab
		this.tabBarControl?.redrawTab(editor);

		// Sticky change has an impact on each tab's border because
		// it potentially moves the border to the last pinned tab
		this.tabBarControl?.redrawAllTabBorders();

		// A change to the sticky state requires a layout to keep the active editor visible
		this.layout(this.dimensions, { forceRevealActiveTab: true });
	}

	setActive(isGroupActive: boolean): void {
		this.tabBarControl?.setActive(isGroupActive);

		// Activity has an impact on the toolbar, so we need to update and layout
		this.updateEditorActionsToolbar();
		this.layout(this.dimensions, { forceRevealActiveTab: true });
	}

	private updateEditorLabelScheduler = this._register(new RunOnceScheduler(() => this.doUpdateEditorLabels(), 0));

	updateEditorLabel(editor: EditorInput): void {

		// Update all labels to account for changes to tab labels
		// Since this method may be called a lot of times from
		// individual editors, we collect all those requests and
		// then run the update once because we have to update
		// all opened tabs in the group at once.
		this.updateEditorLabelScheduler.schedule();
	}

	updateEditorDirty(editor: EditorInput): void {
		this.tabBarControl?.updateEditorDirty(editor);
	}

	override updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		super.updateOptions(oldOptions, newOptions);

		// A change to a label format options requires to recompute all labels
		if (oldOptions.labelFormat !== newOptions.labelFormat) {
			this.tabBarControl?.computeTabLabels();
		}

		// Update tabs scrollbar sizing
		if (oldOptions.titleScrollbarSizing !== newOptions.titleScrollbarSizing) {
			this.tabBarControl?.updateTabsScrollbarSizing();
		}

		// Update tabs sizing
		if (
			oldOptions.tabSizingFixedMinWidth !== newOptions.tabSizingFixedMinWidth ||
			oldOptions.tabSizingFixedMaxWidth !== newOptions.tabSizingFixedMaxWidth ||
			oldOptions.tabSizing !== newOptions.tabSizing
		) {
			this.tabBarControl?.updateTabSizing(true);
		}

		// Redraw tabs when other options change
		if (
			oldOptions.labelFormat !== newOptions.labelFormat ||
			oldOptions.tabCloseButton !== newOptions.tabCloseButton ||
			oldOptions.tabSizing !== newOptions.tabSizing ||
			oldOptions.pinnedTabSizing !== newOptions.pinnedTabSizing ||
			oldOptions.showIcons !== newOptions.showIcons ||
			oldOptions.hasIcons !== newOptions.hasIcons ||
			oldOptions.highlightModifiedTabs !== newOptions.highlightModifiedTabs ||
			oldOptions.wrapTabs !== newOptions.wrapTabs ||
			!equals(oldOptions.decorations, newOptions.decorations)
		) {
			this.tabBarControl?.redraw();

			// Update Editor Actions Toolbar
			this.updateEditorActionsToolbar();
		}
	}

	override updateStyles(): void {
		const tabBarControl = assertIsDefined(this.tabBarControl);
		tabBarControl.redraw();

		// Update Editor Actions Toolbar
		this.updateEditorActionsToolbar();
	}

	private redraw(options?: ITabsTitleControlLayoutOptions): void {
		this.tabBarControl?.redraw();
		// Ensure the active tab is always revealed
		this.layout(this.dimensions, options);
	}

	protected override prepareEditorActions(editorActions: IToolbarActions): IToolbarActions {
		const isGroupActive = this.accessor.activeGroup === this.group;

		// Active: allow all actions
		if (isGroupActive) {
			return editorActions;
		}

		// Inactive: only show "Unlock" and secondary actions
		else {
			return {
				primary: editorActions.primary.filter(action => action.id === UNLOCK_GROUP_COMMAND_ID),
				secondary: editorActions.secondary
			};
		}
	}

	getHeight(): IEditorGroupTitleHeight {
		const showsBreadcrumbs = this.breadcrumbsControl && !this.breadcrumbsControl.isHidden();

		// Return quickly if our used dimensions are known
		if (this.dimensions.used) {
			return {
				total: this.dimensions.used.height,
				offset: showsBreadcrumbs ? this.dimensions.used.height - BreadcrumbsControl.HEIGHT : this.dimensions.used.height
			};
		}

		// Otherwise compute via browser APIs
		else {
			return this.computeHeight();
		}
	}

	private computeHeight(): IEditorGroupTitleHeight {
		const tabBarControl = assertIsDefined(this.tabBarControl);
		let total = tabBarControl.computeHeight();

		const offset = total;

		// Account for breadcrumbs if visible
		if (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden()) {
			total += BreadcrumbsControl.HEIGHT; // Account for breadcrumbs if visible
		}

		return { total, offset };
	}

	layout(dimensions: ITitleControlDimensions, options?: ITabsTitleControlLayoutOptions): Dimension {

		// Remember dimensions that we get
		Object.assign(this.dimensions, dimensions);

		// The layout of tabs can be an expensive operation because we access DOM properties
		// that can result in the browser doing a full page layout to validate them. To buffer
		// this a little bit we try at least to schedule this work on the next animation frame.
		if (!this.layoutScheduler.value) {
			const scheduledLayout = scheduleAtNextAnimationFrame(() => {
				this.doLayout(this.dimensions, this.layoutScheduler.value?.options /* ensure to pick up latest options */);

				this.layoutScheduler.clear();
			});

			this.layoutScheduler.value = { options, dispose: () => scheduledLayout.dispose() };
		}

		// Make sure to keep options updated
		if (options?.forceRevealActiveTab) {
			this.layoutScheduler.value.options = {
				...this.layoutScheduler.value.options,
				forceRevealActiveTab: true
			};
		}

		// First time layout: compute the dimensions and store it
		if (!this.dimensions.used) {
			this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight().total);
		}

		return this.dimensions.used;
	}

	private doLayout(dimensions: ITitleControlDimensions, options?: ITabsTitleControlLayoutOptions): void {
		const tabBarControl = assertIsDefined(this.tabBarControl);

		// Only layout if we have valid tab index and dimensions
		const activeTabAndIndex = this.group.activeEditor ? tabBarControl.getTabAndIndex(this.group.activeEditor) : undefined;
		if (activeTabAndIndex && dimensions.container !== Dimension.None && dimensions.available !== Dimension.None) {

			// Breadcrumbs
			this.doLayoutBreadcrumbs(dimensions);

			// Tabs
			const [activeTab, activeIndex] = activeTabAndIndex;
			tabBarControl.doLayoutTabs(activeTab, activeIndex, dimensions, options);
		}

		// Remember the dimensions used in the control so that we can
		// return it fast from the `layout` call without having to
		// compute it over and over again
		const oldDimension = this.dimensions.used;
		const newDimension = this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight().total);

		// In case the height of the title control changed from before
		// (currently only possible if wrapping changed on/off), we need
		// to signal this to the outside via a `relayout` call so that
		// e.g. the editor control can be adjusted accordingly.
		if (oldDimension && oldDimension.height !== newDimension.height) {
			this.group.relayout();
		}
	}

	protected handleBreadcrumbsEnablementChange(): void {
		this.group.relayout(); // relayout when breadcrumbs are enable/disabled
	}

	private doLayoutBreadcrumbs(dimensions: ITitleControlDimensions): void {
		if (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden()) {
			this.breadcrumbsControl.layout(new Dimension(dimensions.container.width, BreadcrumbsControl.HEIGHT));
		}
	}

	private doUpdateEditorLabels(): void {
		// A change to a label requires to recompute all labels
		this.tabBarControl?.computeTabLabels();

		// As such we need to redraw each label
		this.tabBarControl?.redrawAllTabs();

		// A change to a label requires a layout to keep the active editor visible
		this.layout(this.dimensions);
	}

	override dispose(): void {
		super.dispose();
		this.tabBarControl?.dispose();
	}
}
