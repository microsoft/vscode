/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IIconLabelValueOptions, IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IKeyboardNavigationLabelProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IDataSource, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuEntryActionViewItem, getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IBreadcrumbsDataSource, IOutline, IOutlineComparator, IOutlineCreator, IOutlineListConfig, IOutlineService, OutlineChangeEvent, OutlineConfigCollapseItemsValues, OutlineConfigKeys, OutlineTarget } from '../../../services/outline/browser/outline.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IEditorPane } from '../../../common/editor.js';
import { CustomEditorInput } from './customEditorInput.js';
import { ICustomEditorOutlineItemDto, ICustomEditorOutlineProviderService } from '../common/customEditorOutlineService.js';
import '../../../contrib/codeEditor/browser/outline/documentSymbolsTree.css'; // reuse outline-element styles

// ----- Outline item wrapper -----

class CustomEditorOutlineEntry {

	readonly children: CustomEditorOutlineEntry[] = [];

	constructor(
		readonly id: string,
		readonly label: string,
		readonly detail: string | undefined,
		readonly tooltip: string | undefined,
		readonly icon: ThemeIcon | undefined,
		readonly contextValue: string | undefined,
		readonly parent: CustomEditorOutlineEntry | undefined,
	) { }
}

// ----- Context keys -----

const CustomEditorOutlineContext = {
	ContextValue: new RawContextKey<string>('customEditorOutlineItem', ''),
};

// ----- Renderer (reuses outline-element CSS from documentSymbolsTree.css) -----

interface ICustomEditorOutlineTemplate {
	readonly container: HTMLElement;
	readonly iconClass: HTMLElement;
	readonly iconLabel: IconLabel;
	readonly actionMenu: HTMLElement;
	readonly elementDisposables: DisposableStore;
}

class CustomEditorOutlineRenderer implements ITreeRenderer<CustomEditorOutlineEntry, FuzzyScore, ICustomEditorOutlineTemplate> {

	readonly templateId = 'CustomEditorOutlineRenderer';

	constructor(
		private readonly _target: OutlineTarget,
		private readonly _resource: URI,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IMenuService private readonly _menuService: IMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	renderTemplate(container: HTMLElement): ICustomEditorOutlineTemplate {
		const elementDisposables = new DisposableStore();
		container.classList.add('outline-element');
		const iconClass = dom.$('.outline-element-icon.inline');
		container.prepend(iconClass);
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const actionMenu = dom.$('.action-menu');
		actionMenu.style.marginLeft = 'auto';
		container.appendChild(actionMenu);
		return { container, iconClass, iconLabel, actionMenu, elementDisposables };
	}

	renderElement(node: ITreeNode<CustomEditorOutlineEntry, FuzzyScore>, _index: number, template: ICustomEditorOutlineTemplate): void {
		const entry = node.element;
		const options: IIconLabelValueOptions = {
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
		};

		template.iconClass.className = '';
		template.iconClass.classList.add('outline-element-icon', 'inline');
		if (entry.icon && this._configurationService.getValue<boolean>(OutlineConfigKeys.icons)) {
			template.iconClass.classList.add('codicon-colored', ...ThemeIcon.asClassNameArray(entry.icon));
		}

		if (entry.tooltip) {
			options.title = entry.tooltip;
		}
		template.iconLabel.setLabel(entry.label, entry.detail, options);

		if (this._target === OutlineTarget.OutlinePane) {
			const scopedContextKeyService = template.elementDisposables.add(this._contextKeyService.createScoped(template.container));
			CustomEditorOutlineContext.ContextValue.bindTo(scopedContextKeyService).set(entry.contextValue ?? '');

			const toolbar = template.elementDisposables.add(new ToolBar(template.actionMenu, this._contextMenuService, {
				actionViewItemProvider: (action, options) => {
					if (action instanceof MenuItemAction && !options.isMenu) {
						return this._instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
					return undefined;
				},
			}));

			const menu = template.elementDisposables.add(this._menuService.createMenu(MenuId.CustomEditorOutlineActionMenu, scopedContextKeyService));
			const menuArg = { id: entry.id, uri: this._resource };

			// same fix as in notebookOutline setupToolbarListeners re #103926
			let dropdownIsVisible = false;
			let deferredUpdate: (() => void) | undefined;

			const actions = getActionBarActions(menu.getActions({ shouldForwardArgs: true, arg: menuArg }), g => /^inline/.test(g));
			toolbar.setActions(actions.primary, actions.secondary);

			template.elementDisposables.add(menu.onDidChange(() => {
				const actions = getActionBarActions(menu.getActions({ shouldForwardArgs: true, arg: menuArg }), g => /^inline/.test(g));
				if (dropdownIsVisible) {
					deferredUpdate = () => toolbar.setActions(actions.primary, actions.secondary);
					return;
				}
				toolbar.setActions(actions.primary, actions.secondary);
			}));

			template.elementDisposables.add(toolbar.onDidChangeDropdownVisibility(visible => {
				dropdownIsVisible = visible;
				if (deferredUpdate && !visible) {
					disposableTimeout(() => {
						deferredUpdate?.();
						deferredUpdate = undefined;
					}, 0, template.elementDisposables);
				}
			}));
		}
	}

	disposeTemplate(templateData: ICustomEditorOutlineTemplate): void {
		templateData.iconLabel.dispose();
		templateData.elementDisposables.dispose();
	}

	disposeElement(_element: ITreeNode<CustomEditorOutlineEntry, FuzzyScore>, _index: number, templateData: ICustomEditorOutlineTemplate): void {
		templateData.elementDisposables.clear();
		dom.clearNode(templateData.actionMenu);
	}
}

// ----- List helpers -----

class CustomEditorOutlineVirtualDelegate implements IListVirtualDelegate<CustomEditorOutlineEntry> {
	getHeight(_element: CustomEditorOutlineEntry): number {
		return 22;
	}
	getTemplateId(_element: CustomEditorOutlineEntry): string {
		return 'CustomEditorOutlineRenderer';
	}
}

class CustomEditorOutlineComparator implements IOutlineComparator<CustomEditorOutlineEntry> {
	compareByPosition(a: CustomEditorOutlineEntry, b: CustomEditorOutlineEntry): number {
		return 0; // Extensions control item order
	}
	compareByType(a: CustomEditorOutlineEntry, b: CustomEditorOutlineEntry): number {
		return 0;
	}
	compareByName(a: CustomEditorOutlineEntry, b: CustomEditorOutlineEntry): number {
		return a.label.localeCompare(b.label);
	}
}

class CustomEditorOutlineAccessibility implements IListAccessibilityProvider<CustomEditorOutlineEntry> {
	getAriaLabel(element: CustomEditorOutlineEntry): string | null {
		return element.label;
	}
	getWidgetAriaLabel(): string {
		return localize('customEditorOutline', "Custom Editor Outline");
	}
}

class CustomEditorOutlineNavigationLabelProvider implements IKeyboardNavigationLabelProvider<CustomEditorOutlineEntry> {
	getKeyboardNavigationLabel(element: CustomEditorOutlineEntry): { toString(): string | undefined } | undefined {
		return element.label;
	}
}

// ----- IOutline implementation -----

class CustomEditorExtensionOutline implements IOutline<CustomEditorOutlineEntry> {

	readonly outlineKind = 'customEditor';

	private readonly _disposables = new DisposableStore();
	private readonly _onDidChange = this._disposables.add(new Emitter<OutlineChangeEvent>());
	readonly onDidChange: Event<OutlineChangeEvent> = this._onDidChange.event;

	private _entries: CustomEditorOutlineEntry[] = [];
	private _activeEntry: CustomEditorOutlineEntry | undefined;
	private _flatMap = new Map<string, CustomEditorOutlineEntry>();
	private _loadCts: CancellationTokenSource | undefined;
	private readonly _resource: URI;
	private readonly _viewType: string;

	readonly config: IOutlineListConfig<CustomEditorOutlineEntry>;

	get isEmpty(): boolean {
		return this._entries.length === 0;
	}

	get activeElement(): CustomEditorOutlineEntry | undefined {
		return this._activeEntry;
	}

	get uri(): URI | undefined {
		return this._resource;
	}

	constructor(
		editorInput: CustomEditorInput,
		target: OutlineTarget,
		@ICustomEditorOutlineProviderService private readonly _providerService: ICustomEditorOutlineProviderService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._resource = editorInput.resource;
		this._viewType = editorInput.viewType;

		const delegate = new CustomEditorOutlineVirtualDelegate();
		const renderers = [instantiationService.createInstance(CustomEditorOutlineRenderer, target, this._resource)];
		const comparator = new CustomEditorOutlineComparator();

		const treeDataSource: IDataSource<this, CustomEditorOutlineEntry> = {
			getChildren: parent => {
				if (parent instanceof CustomEditorOutlineEntry) {
					return parent.children;
				}
				return this._entries;
			}
		};

		const initialCollapse = configurationService.getValue<OutlineConfigCollapseItemsValues>(OutlineConfigKeys.collapseItems);
		const options = {
			collapseByDefault: target === OutlineTarget.Breadcrumbs || (target === OutlineTarget.OutlinePane && initialCollapse === OutlineConfigCollapseItemsValues.Collapsed),
			expandOnlyOnTwistieClick: true,
			multipleSelectionSupport: false,
			accessibilityProvider: new CustomEditorOutlineAccessibility(),
			identityProvider: { getId: (e: CustomEditorOutlineEntry) => e.id },
			keyboardNavigationLabelProvider: new CustomEditorOutlineNavigationLabelProvider(),
		};

		const breadcrumbsDataSource: IBreadcrumbsDataSource<CustomEditorOutlineEntry> = {
			getBreadcrumbElements: () => {
				const result: { element: CustomEditorOutlineEntry; label: string }[] = [];
				let current = this._activeEntry;
				while (current) {
					result.unshift({ element: current, label: current.label });
					current = current.parent;
				}
				return result;
			},
		};

		this.config = {
			breadcrumbsDataSource,
			delegate,
			renderers,
			treeDataSource,
			comparator,
			options,
			quickPickDataSource: {
				getQuickPickElements: () => {
					const result: { element: CustomEditorOutlineEntry; label: string; iconClasses?: string[]; ariaLabel?: string; description?: string }[] = [];
					const walk = (entries: CustomEditorOutlineEntry[]) => {
						for (const entry of entries) {
							result.push({
								element: entry,
								label: entry.label,
								ariaLabel: entry.label,
								description: entry.detail,
								iconClasses: entry.icon ? ThemeIcon.asClassNameArray(entry.icon) : undefined,
							});
							walk(entry.children);
						}
					};
					walk(this._entries);
					return result;
				},
			},
			contextMenuId: MenuId.CustomEditorOutlineContext,
			getContextKeyOverlay: (entry: CustomEditorOutlineEntry) => {
				return [['customEditorOutlineItem', entry.contextValue ?? '']];
			},
			getActionsContext: (entry: CustomEditorOutlineEntry) => {
				return { id: entry.id, uri: this._resource };
			},
			alwaysRevealActiveElement: true,
		};

		// Listen for outline data changes from the extension provider
		this._disposables.add(this._providerService.onDidChangeOutline(this._viewType, this._resource)(() => {
			this._loadItems();
		}));

		// Listen for active item changes from the extension provider
		this._disposables.add(this._providerService.onDidChangeActiveItem(this._viewType, this._resource)(itemId => {
			this._activeEntry = itemId ? this._flatMap.get(itemId) : undefined;
			this._onDidChange.fire({ affectOnlyActiveElement: true });
		}));

		// Initial load
		this._loadItems();
	}

	private async _loadItems(): Promise<void> {
		// Cancel any previous in-flight request to avoid stale responses overwriting newer data
		this._loadCts?.cancel();
		this._loadCts?.dispose();
		const cts = this._loadCts = new CancellationTokenSource();
		try {
			const dtos = await this._providerService.provideOutline(this._viewType, this._resource, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			this._flatMap.clear();
			this._entries = dtos ? this._convertItems(dtos, undefined) : [];

			// Restore active entry from the provider's cached active item
			const activeId = this._providerService.getActiveItemId(this._viewType, this._resource);
			this._activeEntry = activeId ? this._flatMap.get(activeId) : undefined;

			this._onDidChange.fire({});
		} finally {
			if (this._loadCts === cts) {
				this._loadCts = undefined;
			}
			cts.dispose();
		}
	}

	private _convertItems(dtos: ICustomEditorOutlineItemDto[], parent: CustomEditorOutlineEntry | undefined): CustomEditorOutlineEntry[] {
		return dtos.map(dto => {
			const entry = new CustomEditorOutlineEntry(
				dto.id,
				dto.label,
				dto.detail,
				dto.tooltip,
				dto.icon,
				dto.contextValue,
				parent,
			);
			this._flatMap.set(dto.id, entry);
			if (dto.children) {
				entry.children.push(...this._convertItems(dto.children, entry));
			}
			return entry;
		});
	}

	reveal(entry: CustomEditorOutlineEntry, _options: IEditorOptions, _sideBySide: boolean, _select: boolean): void {
		this._providerService.revealItem(this._viewType, this._resource, entry.id);
	}

	preview(_entry: CustomEditorOutlineEntry): IDisposable {
		return toDisposable(() => { });
	}

	captureViewState(): IDisposable {
		return toDisposable(() => { });
	}

	dispose(): void {
		this._loadCts?.cancel();
		this._loadCts?.dispose();
		this._providerService.releaseResource(this._viewType, this._resource);
		this._disposables.dispose();
		this._onDidChange.dispose();
	}
}

// ----- Outline creator -----

class CustomEditorOutlineCreator extends Disposable implements IOutlineCreator<IEditorPane, CustomEditorOutlineEntry> {

	private readonly _registration: MutableDisposable<IDisposable>;

	constructor(
		@IOutlineService private readonly _outlineService: IOutlineService,
		@ICustomEditorOutlineProviderService private readonly _providerService: ICustomEditorOutlineProviderService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._registration = this._register(new MutableDisposable());
		this._registration.value = this._outlineService.registerOutlineCreator(this);

		// When providers are added/removed, re-register so IOutlineService.onDidChange
		// fires and the outline pane re-evaluates canCreateOutline.
		this._register(this._providerService.onDidChange(() => {
			this._registration.value = this._outlineService.registerOutlineCreator(this);
		}));
	}

	matches(candidate: IEditorPane): candidate is IEditorPane {
		if (!(candidate.input instanceof CustomEditorInput)) {
			return false;
		}
		return this._providerService.hasProvider(candidate.input.viewType);
	}

	async createOutline(pane: IEditorPane, target: OutlineTarget, _token: CancellationToken): Promise<IOutline<CustomEditorOutlineEntry> | undefined> {
		const input = pane.input;
		if (!(input instanceof CustomEditorInput)) {
			return undefined;
		}
		if (!this._providerService.hasProvider(input.viewType)) {
			return undefined;
		}
		return this._instantiationService.createInstance(CustomEditorExtensionOutline, input, target);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(CustomEditorOutlineCreator, LifecyclePhase.Eventually);
