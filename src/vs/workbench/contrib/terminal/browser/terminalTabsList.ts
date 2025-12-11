/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalInstance, ITerminalService, ITerminalEditingService, TerminalDataTransfers } from './terminal.js';
import { localize } from '../../../../nls.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { TerminalCommandId } from '../common/terminal.js';
import { ITerminalBackend, TerminalLocation, TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action } from '../../../../base/common/actions.js';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import Severity from '../../../../base/common/severity.js';
import { Disposable, DisposableStore, dispose, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IListDragAndDrop, IListDragOverReaction, IListRenderer, ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../base/browser/ui/list/list.js';
import { DataTransfers, IDragAndDropData } from '../../../../base/browser/dnd.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { ElementsDragAndDropData, ListViewTargetSector, NativeDragAndDropData } from '../../../../base/browser/ui/list/listView.js';
import { URI } from '../../../../base/common/uri.js';
import { getColorClass, getIconId, getUriClasses } from './terminalIcon.js';
import { IEditableData } from '../../../common/views.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { CodeDataTransfers, containsDragType, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IProcessDetails } from '../../../../platform/terminal/common/terminalProcess.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from './terminalUri.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { getColorForSeverity } from './terminalStatusList.js';
import { TerminalContextActionRunner } from './terminalContextMenu.js';
import type { IHoverAction } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { TerminalStorageKeys } from '../common/terminalStorageKeys.js';
import { isObject } from '../../../../base/common/types.js';

const $ = DOM.$;

export const enum TerminalTabsListSizes {
	TabHeight = 22,
	NarrowViewWidth = 46,
	WideViewMinimumWidth = 80,
	DefaultWidth = 120,
	MidpointViewWidth = (TerminalTabsListSizes.NarrowViewWidth + TerminalTabsListSizes.WideViewMinimumWidth) / 2,
	ActionbarMinimumWidth = 105,
	MaximumWidth = 500
}

export class TerminalTabList extends WorkbenchList<ITerminalInstance> {
	private _decorationsProvider: TabDecorationsProvider | undefined;
	private _terminalTabsSingleSelectedContextKey: IContextKey<boolean>;
	private _isSplitContextKey: IContextKey<boolean>;

	constructor(
		container: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditingService private readonly _terminalEditingService: ITerminalEditingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDecorationsService decorationsService: IDecorationsService,
		@IThemeService private readonly _themeService: IThemeService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super('TerminalTabsList', container,
			{
				getHeight: () => TerminalTabsListSizes.TabHeight,
				getTemplateId: () => 'terminal.tabs'
			},
			[instantiationService.createInstance(TerminalTabsRenderer, container, instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER), () => this.getSelectedElements())],
			{
				horizontalScrolling: false,
				supportDynamicHeights: false,
				selectionNavigation: true,
				identityProvider: {
					getId: e => e?.instanceId
				},
				accessibilityProvider: instantiationService.createInstance(TerminalTabsAccessibilityProvider),
				smoothScrolling: _configurationService.getValue<boolean>('workbench.list.smoothScrolling'),
				multipleSelectionSupport: true,
				paddingBottom: TerminalTabsListSizes.TabHeight,
				dnd: instantiationService.createInstance(TerminalTabsDragAndDrop),
				openOnSingleClick: true
			},
			contextKeyService,
			listService,
			_configurationService,
			instantiationService,
		);

		const instanceDisposables: IDisposable[] = [
			this._terminalGroupService.onDidChangeInstances(() => this.refresh()),
			this._terminalGroupService.onDidChangeGroups(() => this.refresh()),
			this._terminalGroupService.onDidShow(() => this.refresh()),
			this._terminalGroupService.onDidChangeInstanceCapability(() => this.refresh()),
			this._terminalService.onAnyInstanceTitleChange(() => this.refresh()),
			this._terminalService.onAnyInstanceIconChange(() => this.refresh()),
			this._terminalService.onAnyInstancePrimaryStatusChange(() => this.refresh()),
			this._terminalService.onDidChangeConnectionState(() => this.refresh()),
			this._themeService.onDidColorThemeChange(() => this.refresh()),
			this._terminalGroupService.onDidChangeActiveInstance(e => {
				if (e) {
					const i = this._terminalGroupService.instances.indexOf(e);
					this.setSelection([i]);
					this.reveal(i);
				}
				this.refresh();
			}),
			this._storageService.onDidChangeValue(StorageScope.APPLICATION, TerminalStorageKeys.TabsShowDetailed, this.disposables)(() => this.refresh()),
		];

		// Dispose of instance listeners on shutdown to avoid extra work and so tabs don't disappear
		// briefly
		this.disposables.add(lifecycleService.onWillShutdown(e => {
			dispose(instanceDisposables);
			instanceDisposables.length = 0;
		}));
		this.disposables.add(toDisposable(() => {
			dispose(instanceDisposables);
			instanceDisposables.length = 0;
		}));

		this.disposables.add(this.onMouseDblClick(async e => {
			if (!e.element) {
				e.browserEvent.preventDefault();
				e.browserEvent.stopPropagation();
				const instance = await this._terminalService.createTerminal({ location: TerminalLocation.Panel });
				this._terminalGroupService.setActiveInstance(instance);
				await instance.focusWhenReady();
				return;
			}

			if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element.instanceId) {
				return;
			}

			if (this._getFocusMode() === 'doubleClick' && this.getFocus().length === 1) {
				e.element.focus(true);
			}
		}));

		// on left click, if focus mode = single click, focus the element
		// unless multi-selection is in progress
		this.disposables.add(this.onMouseClick(async e => {
			if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element?.instanceId) {
				return;
			}

			if (e.browserEvent.altKey && e.element) {
				await this._terminalService.createTerminal({ location: { parentTerminal: e.element } });
			} else if (this._getFocusMode() === 'singleClick') {
				if (this.getSelection().length <= 1) {
					e.element?.focus(true);
				}
			}
		}));

		// on right click, set the focus to that element
		// unless multi-selection is in progress
		this.disposables.add(this.onContextMenu(e => {
			if (!e.element) {
				this.setSelection([]);
				return;
			}
			const selection = this.getSelectedElements();
			if (!selection || !selection.find(s => e.element === s)) {
				this.setFocus(e.index !== undefined ? [e.index] : []);
			}
		}));

		this._terminalTabsSingleSelectedContextKey = TerminalContextKeys.tabsSingularSelection.bindTo(contextKeyService);
		this._isSplitContextKey = TerminalContextKeys.splitTerminalTabFocused.bindTo(contextKeyService);

		this.disposables.add(this.onDidChangeSelection(e => this._updateContextKey()));
		this.disposables.add(this.onDidChangeFocus(() => this._updateContextKey()));

		this.disposables.add(this.onDidOpen(async e => {
			const instance = e.element;
			if (!instance) {
				return;
			}
			this._terminalGroupService.setActiveInstance(instance);
			if (!e.editorOptions.preserveFocus) {
				await instance.focusWhenReady();
			}
		}));
		if (!this._decorationsProvider) {
			this._decorationsProvider = this.disposables.add(instantiationService.createInstance(TabDecorationsProvider));
			this.disposables.add(decorationsService.registerDecorationsProvider(this._decorationsProvider));
		}
		this.refresh();
	}

	private _getFocusMode(): 'singleClick' | 'doubleClick' {
		return this._configurationService.getValue<'singleClick' | 'doubleClick'>(TerminalSettingId.TabsFocusMode);
	}

	refresh(cancelEditing: boolean = true): void {
		if (cancelEditing && this._terminalEditingService.isEditable(undefined)) {
			this.domFocus();
		}

		this.splice(0, this.length, this._terminalGroupService.instances.slice());
	}

	focusHover(): void {
		const instance = this.getSelectedElements()[0];
		if (!instance) {
			return;
		}

		this._hoverService.showInstantHover({
			...getInstanceHoverInfo(instance, this._storageService),
			target: this.getHTMLElement(),
			trapFocus: true
		}, true);
	}

	private _updateContextKey() {
		this._terminalTabsSingleSelectedContextKey.set(this.getSelectedElements().length === 1);
		const instance = this.getFocusedElements();
		this._isSplitContextKey.set(instance.length > 0 && this._terminalGroupService.instanceIsSplit(instance[0]));
	}
}

class TerminalTabsRenderer implements IListRenderer<ITerminalInstance, ITerminalTabEntryTemplate> {
	templateId = 'terminal.tabs';

	constructor(
		private readonly _container: HTMLElement,
		private readonly _labels: ResourceLabels,
		private readonly _getSelection: () => ITerminalInstance[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditingService private readonly _terminalEditingService: ITerminalEditingService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IListService private readonly _listService: IListService,
		@IStorageService private readonly _storageService: IStorageService,
		@IThemeService private readonly _themeService: IThemeService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
	}

	renderTemplate(container: HTMLElement): ITerminalTabEntryTemplate {
		const element = DOM.append(container, $('.terminal-tabs-entry'));
		const context: { hoverActions?: IHoverAction[] } = {};
		const templateDisposables = new DisposableStore();

		const label = templateDisposables.add(this._labels.create(element, {
			supportHighlights: true,
			supportDescriptionHighlights: true,
			supportIcons: true,
			hoverDelegate: {
				delay: 0,
				showHover: options => {
					return this._hoverService.showDelayedHover({
						...options,
						actions: context.hoverActions,
						target: element,
						appearance: {
							showPointer: true
						},
						position: {
							hoverPosition: this._terminalConfigurationService.config.tabs.location === 'left' ? HoverPosition.RIGHT : HoverPosition.LEFT
						}
					}, { groupId: 'terminal-tabs-list' });
				}
			}
		}));

		const actionsContainer = DOM.append(label.element, $('.actions'));



		const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
			actionRunner: templateDisposables.add(new TerminalContextActionRunner()),
			actionViewItemProvider: (action, options) =>
				action instanceof MenuItemAction
					? templateDisposables.add(this._instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }))
					: undefined
		}));

		return {
			element,
			label,
			actionBar,
			context,
			elementDisposables: new DisposableStore(),
			templateDisposables
		};
	}

	shouldHideText(): boolean {
		return this._container ? this.getContainerWidthCachedForTask() < TerminalTabsListSizes.MidpointViewWidth : false;
	}

	shouldHideActionBar(): boolean {
		return this._container ? this.getContainerWidthCachedForTask() <= TerminalTabsListSizes.ActionbarMinimumWidth : false;
	}

	private _cachedContainerWidth = -1;
	getContainerWidthCachedForTask(): number {
		if (this._cachedContainerWidth === -1) {
			this._cachedContainerWidth = this._container.clientWidth;
			queueMicrotask(() => this._cachedContainerWidth = -1);
		}
		return this._cachedContainerWidth;
	}

	renderElement(instance: ITerminalInstance, index: number, template: ITerminalTabEntryTemplate): void {
		const hasText = !this.shouldHideText();

		const group = this._terminalGroupService.getGroupForInstance(instance);
		if (!group) {
			throw new Error(`Could not find group for instance "${instance.instanceId}"`);
		}

		template.element.classList.toggle('has-text', hasText);
		template.element.classList.toggle('is-active', this._terminalGroupService.activeInstance === instance);

		let prefix: string = '';
		if (group.terminalInstances.length > 1) {
			const terminalIndex = group.terminalInstances.indexOf(instance);
			if (terminalIndex === 0) {
				prefix = `┌ `;
			} else if (terminalIndex === group.terminalInstances.length - 1) {
				prefix = `└ `;
			} else {
				prefix = `├ `;
			}
		}

		const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
		template.context.hoverActions = hoverInfo.actions;

		const iconId = this._instantiationService.invokeFunction(getIconId, instance);
		const hasActionbar = !this.shouldHideActionBar();
		let label: string = '';
		if (!hasText) {
			const primaryStatus = instance.statusList.primary;
			// Don't show ignore severity
			if (primaryStatus && primaryStatus.severity > Severity.Ignore) {
				label = `${prefix}$(${primaryStatus.icon?.id || iconId})`;
			} else {
				label = `${prefix}$(${iconId})`;
			}
		} else {
			this.fillActionBar(instance, template);
			label = prefix;
			// Only add the title if the icon is set, this prevents the title jumping around for
			// example when launching with a ShellLaunchConfig.name and no icon
			if (instance.icon) {
				label += `$(${iconId}) ${instance.title}`;
			}
		}

		if (!hasActionbar) {
			template.actionBar.clear();
		}

		// Kill terminal on middle click
		template.elementDisposables.add(DOM.addDisposableListener(template.element, DOM.EventType.AUXCLICK, e => {
			e.stopImmediatePropagation();
			if (e.button === 1/*middle*/) {
				this._terminalService.safeDisposeTerminal(instance);
			}
		}));

		const extraClasses: string[] = [];
		const colorClass = getColorClass(instance);
		if (colorClass) {
			extraClasses.push(colorClass);
		}
		const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
		if (uriClasses) {
			extraClasses.push(...uriClasses);
		}

		template.label.setResource({
			resource: instance.resource,
			name: label,
			description: hasText ? instance.description : undefined
		}, {
			fileDecorations: {
				colors: true,
				badges: hasText
			},
			title: {
				markdown: hoverInfo.content,
				markdownNotSupportedFallback: undefined
			},
			extraClasses
		});
		const editableData = this._terminalEditingService.getEditableData(instance);
		template.label.element.classList.toggle('editable-tab', !!editableData);
		if (editableData) {
			// eslint-disable-next-line no-restricted-syntax
			template.elementDisposables.add(this._renderInputBox(template.label.element.querySelector('.monaco-icon-label-container')!, instance, editableData));
			template.actionBar.clear();
		}
	}

	private _renderInputBox(container: HTMLElement, instance: ITerminalInstance, editableData: IEditableData): IDisposable {

		const value = instance.title || '';

		const inputBox = new InputBox(container, this._contextViewService, {
			validationOptions: {
				validation: (value) => {
					const message = editableData.validationMessage(value);
					if (!message || message.severity !== Severity.Error) {
						return null;
					}

					return {
						content: message.content,
						formatContent: true,
						type: MessageType.ERROR
					};
				}
			},
			ariaLabel: localize('terminalInputAriaLabel', "Type terminal name. Press Enter to confirm or Escape to cancel."),
			inputBoxStyles: defaultInputBoxStyles
		});
		inputBox.element.style.height = '22px';
		inputBox.value = value;
		inputBox.focus();
		inputBox.select({ start: 0, end: value.length });

		const done = createSingleCallFunction((success: boolean, finishEditing: boolean) => {
			inputBox.element.style.display = 'none';
			const value = inputBox.value;
			dispose(toDispose);
			inputBox.element.remove();
			if (finishEditing) {
				editableData.onFinish(value, success);
			}
		});

		const showInputBoxNotification = () => {
			if (inputBox.isInputValid()) {
				const message = editableData.validationMessage(inputBox.value);
				if (message) {
					inputBox.showMessage({
						content: message.content,
						formatContent: true,
						type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
					});
				} else {
					inputBox.hideMessage();
				}
			}
		};
		showInputBoxNotification();

		const toDispose = [
			inputBox,
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				e.stopPropagation();
				if (e.equals(KeyCode.Enter)) {
					done(inputBox.isInputValid(), true);
				} else if (e.equals(KeyCode.Escape)) {
					done(false, true);
				}
			}),
			DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e: IKeyboardEvent) => {
				showInputBoxNotification();
			}),
			DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
				done(inputBox.isInputValid(), true);
			})
		];

		return toDisposable(() => {
			done(false, false);
		});
	}

	disposeElement(instance: ITerminalInstance, index: number, templateData: ITerminalTabEntryTemplate): void {
		templateData.elementDisposables.clear();
		templateData.actionBar.clear();
	}

	disposeTemplate(templateData: ITerminalTabEntryTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}

	fillActionBar(instance: ITerminalInstance, template: ITerminalTabEntryTemplate): void {
		// If the instance is within the selection, split all selected
		const actions = [
			template.elementDisposables.add(new Action(TerminalCommandId.SplitActiveTab, terminalStrings.split.short, ThemeIcon.asClassName(Codicon.splitHorizontal), true, async () => {
				this._runForSelectionOrInstance(instance, async e => {
					this._terminalService.createTerminal({ location: { parentTerminal: e } });
				});
			})),
		];
		if (instance.shellLaunchConfig.tabActions) {
			for (const action of instance.shellLaunchConfig.tabActions) {
				actions.push(template.elementDisposables.add(new Action(action.id, action.label, action.icon ? ThemeIcon.asClassName(action.icon) : undefined, true, async () => {
					this._runForSelectionOrInstance(instance, e => this._commandService.executeCommand(action.id, instance));
				})));
			}
		}
		actions.push(template.elementDisposables.add(new Action(TerminalCommandId.KillActiveTab, terminalStrings.kill.short, ThemeIcon.asClassName(Codicon.trashcan), true, async () => {
			this._runForSelectionOrInstance(instance, e => this._terminalService.safeDisposeTerminal(e));
		})));
		// TODO: Cache these in a way that will use the correct instance
		template.actionBar.clear();
		for (const action of actions) {
			template.actionBar.push(action, { icon: true, label: false, keybinding: this._keybindingService.lookupKeybinding(action.id)?.getLabel() });
		}
	}

	private _runForSelectionOrInstance(instance: ITerminalInstance, callback: (instance: ITerminalInstance) => void) {
		const selection = this._getSelection();
		if (selection.includes(instance)) {
			for (const s of selection) {
				if (s) {
					callback(s);
				}
			}
		} else {
			callback(instance);
		}
		this._terminalGroupService.focusTabs();
		this._listService.lastFocusedList?.focusNext();
	}
}

interface ITerminalTabEntryTemplate {
	readonly element: HTMLElement;
	readonly label: IResourceLabel;
	readonly actionBar: ActionBar;
	context: {
		hoverActions?: IHoverAction[];
	};
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}


class TerminalTabsAccessibilityProvider implements IListAccessibilityProvider<ITerminalInstance> {
	constructor(
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
	) { }

	getWidgetAriaLabel(): string {
		return localize('terminal.tabs', "Terminal tabs");
	}

	getAriaLabel(instance: ITerminalInstance): string {
		let ariaLabel: string = '';
		const tab = this._terminalGroupService.getGroupForInstance(instance);
		if (tab && tab.terminalInstances?.length > 1) {
			const terminalIndex = tab.terminalInstances.indexOf(instance);
			ariaLabel = localize({
				key: 'splitTerminalAriaLabel',
				comment: [
					`The terminal's ID`,
					`The terminal's title`,
					`The terminal's split number`,
					`The terminal group's total split number`
				]
			}, "Terminal {0} {1}, split {2} of {3}", instance.instanceId, instance.title, terminalIndex + 1, tab.terminalInstances.length);
		} else {
			ariaLabel = localize({
				key: 'terminalAriaLabel',
				comment: [
					`The terminal's ID`,
					`The terminal's title`
				]
			}, "Terminal {0} {1}", instance.instanceId, instance.title);
		}
		return ariaLabel;
	}
}

class TerminalTabsDragAndDrop extends Disposable implements IListDragAndDrop<ITerminalInstance> {
	private _autoFocusInstance: ITerminalInstance | undefined;
	private _autoFocusDisposable: IDisposable = Disposable.None;
	private _primaryBackend: ITerminalBackend | undefined;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditingService private readonly _terminalEditingService: ITerminalEditingService,
		@IListService private readonly _listService: IListService,
	) {
		super();
		this._primaryBackend = this._terminalService.getPrimaryBackend();
	}

	getDragURI(instance: ITerminalInstance): string | null {
		if (this._terminalEditingService.getEditingTerminal()?.instanceId === instance.instanceId) {
			return null;
		}

		return instance.resource.toString();
	}

	getDragLabel?(elements: ITerminalInstance[], originalEvent: DragEvent): string | undefined {
		return elements.length === 1 ? elements[0].title : undefined;
	}

	onDragLeave() {
		this._autoFocusInstance = undefined;
		this._autoFocusDisposable.dispose();
		this._autoFocusDisposable = Disposable.None;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		if (!originalEvent.dataTransfer) {
			return;
		}
		const dndData: unknown = data.getData();
		if (!Array.isArray(dndData)) {
			return;
		}
		// Attach terminals type to event
		const terminals = (dndData as unknown[]).filter(isTerminalInstance);
		if (terminals.length > 0) {
			originalEvent.dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify(terminals.map(e => e.resource.toString())));
		}
	}

	onDragOver(data: IDragAndDropData, targetInstance: ITerminalInstance | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | IListDragOverReaction {
		if (data instanceof NativeDragAndDropData) {
			if (!containsDragType(originalEvent, DataTransfers.FILES, DataTransfers.RESOURCES, TerminalDataTransfers.Terminals, CodeDataTransfers.FILES)) {
				return false;
			}
		}

		const didChangeAutoFocusInstance = this._autoFocusInstance !== targetInstance;
		if (didChangeAutoFocusInstance) {
			this._autoFocusDisposable.dispose();
			this._autoFocusInstance = targetInstance;
		}

		if (!targetInstance && !containsDragType(originalEvent, TerminalDataTransfers.Terminals)) {
			return data instanceof ElementsDragAndDropData;
		}

		if (didChangeAutoFocusInstance && targetInstance) {
			this._autoFocusDisposable = disposableTimeout(() => {
				this._terminalService.setActiveInstance(targetInstance);
				this._autoFocusInstance = undefined;
			}, 500, this._store);
		}

		return {
			feedback: targetIndex ? [targetIndex] : undefined,
			accept: true,
			effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over }
		};
	}

	async drop(data: IDragAndDropData, targetInstance: ITerminalInstance | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): Promise<void> {
		this._autoFocusDisposable.dispose();
		this._autoFocusInstance = undefined;

		let sourceInstances: ITerminalInstance[] | undefined;
		const promises: Promise<IProcessDetails | undefined>[] = [];
		const resources = getTerminalResourcesFromDragEvent(originalEvent);
		if (resources) {
			for (const uri of resources) {
				const instance = this._terminalService.getInstanceFromResource(uri);
				if (instance) {
					if (Array.isArray(sourceInstances)) {
						sourceInstances.push(instance);
					} else {
						sourceInstances = [instance];
					}
					this._terminalService.moveToTerminalView(instance);
				} else if (this._primaryBackend) {
					const terminalIdentifier = parseTerminalUri(uri);
					if (terminalIdentifier.instanceId) {
						promises.push(this._primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
					}
				}
			}
		}

		if (promises.length) {
			let processes = await Promise.all(promises);
			processes = processes.filter(p => p !== undefined);
			let lastInstance: ITerminalInstance | undefined;
			for (const attachPersistentProcess of processes) {
				lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
			}
			if (lastInstance) {
				this._terminalService.setActiveInstance(lastInstance);
			}
			return;
		}

		if (sourceInstances === undefined) {
			if (!(data instanceof ElementsDragAndDropData)) {
				this._handleExternalDrop(targetInstance, originalEvent);
				return;
			}

			const draggedElement = data.getData();
			if (!draggedElement || !Array.isArray(draggedElement)) {
				return;
			}

			sourceInstances = [];
			for (const e of draggedElement) {
				if (isTerminalInstance(e)) {
					sourceInstances.push(e as ITerminalInstance);
				}
			}
		}

		if (!targetInstance) {
			this._terminalGroupService.moveGroupToEnd(sourceInstances);
			this._terminalService.setActiveInstance(sourceInstances[0]);
			const targetGroup = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
			if (targetGroup) {
				const index = this._terminalGroupService.groups.indexOf(targetGroup);
				this._listService.lastFocusedList?.setSelection([index]);
			}
			return;
		}

		this._terminalGroupService.moveGroup(sourceInstances, targetInstance);
		this._terminalService.setActiveInstance(sourceInstances[0]);
		const targetGroup = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
		if (targetGroup) {
			const index = this._terminalGroupService.groups.indexOf(targetGroup);
			this._listService.lastFocusedList?.setSelection([index]);
		}
	}

	private async _handleExternalDrop(instance: ITerminalInstance | undefined, e: DragEvent) {
		if (!instance || !e.dataTransfer) {
			return;
		}

		// Check if files were dragged from the tree explorer
		let resource: URI | undefined;
		const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
		if (rawResources) {
			resource = URI.parse(JSON.parse(rawResources)[0]);
		}

		const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
		if (!resource && rawCodeFiles) {
			resource = URI.file(JSON.parse(rawCodeFiles)[0]);
		}

		if (!resource && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
			// Check if the file was dragged from the filesystem
			resource = URI.file(getPathForFile(e.dataTransfer.files[0])!);
		}

		if (!resource) {
			return;
		}

		this._terminalService.setActiveInstance(instance);

		instance.focus();
		await instance.sendPath(resource, false);
	}
}

class TabDecorationsProvider extends Disposable implements IDecorationsProvider {
	readonly label: string = localize('label', "Terminal");

	private readonly _onDidChange = this._register(new Emitter<URI[]>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._register(this._terminalService.onAnyInstancePrimaryStatusChange(e => this._onDidChange.fire([e.resource])));
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		if (resource.scheme !== Schemas.vscodeTerminal) {
			return undefined;
		}

		const instance = this._terminalService.getInstanceFromResource(resource);
		if (!instance) {
			return undefined;
		}

		const primaryStatus = instance?.statusList?.primary;
		if (!primaryStatus?.icon) {
			return undefined;
		}

		return {
			color: getColorForSeverity(primaryStatus.severity),
			letter: primaryStatus.icon,
			tooltip: primaryStatus.tooltip
		};
	}
}

function isTerminalInstance(obj: unknown): obj is ITerminalInstance {
	return isObject(obj) && 'instanceId' in obj;
}
