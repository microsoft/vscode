/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/terminalTabsBar.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { applyDragImage } from '../../../../base/browser/ui/dnd/dnd.js';
import { ElementsDragAndDropData, NativeDragAndDropData } from '../../../../base/browser/ui/list/listView.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { OS, OperatingSystem } from '../../../../base/common/platform.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { TerminalLocation, TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../browser/labels.js';
import { IEditableData } from '../../../common/views.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { TerminalStorageKeys } from '../common/terminalStorageKeys.js';
import { ITerminalEditingService, ITerminalGroupService, ITerminalInstance, ITerminalService } from './terminal.js';
import { ITerminalTabEntryTemplate, TabDecorationsProvider, TerminalTabsAccessibilityProvider, TerminalTabsDragAndDrop, TerminalTabsRenderer } from './terminalTabsList.js';
import { ITerminalTabsWidget } from './terminalTabsWidget.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';

interface ITerminalBarEntry {
	readonly element: HTMLElement;
	readonly template: ITerminalTabEntryTemplate;
	readonly disposables: DisposableStore;
	editing: IEditableData | undefined;
	rendered: boolean;
	dispose(): void;
}

export class TerminalTabsBar extends Disposable implements ITerminalTabsWidget {
	static readonly HEIGHT = 28;

	private readonly _element = dom.$('.terminal-tabs-bar', { role: 'tablist', 'aria-orientation': 'horizontal', 'aria-multiselectable': 'true' });
	private readonly _scrollable: DomScrollableElement;
	private readonly _renderer: TerminalTabsRenderer;
	private readonly _accessibilityProvider: TerminalTabsAccessibilityProvider;
	private readonly _dnd: TerminalTabsDragAndDrop;
	private readonly _entries = this._register(new DisposableMap<number, ITerminalBarEntry>());
	private readonly _dragScroll = this._register(new MutableDisposable());
	private readonly _scan = this._register(new MutableDisposable());
	private readonly _singleSelected: IContextKey<boolean>;
	private readonly _splitFocused: IContextKey<boolean>;
	private _instances: readonly ITerminalInstance[] = [];
	private readonly _instanceIndexes = new Map<ITerminalInstance, number>();
	private _selection: ITerminalInstance[] = [];
	private _focused: ITerminalInstance | undefined;
	private _anchor: ITerminalInstance | undefined;
	private _activating = false;
	private _contextMenuKeyDown = false;

	constructor(
		container: HTMLElement,
		private readonly _os: OperatingSystem = OS,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditingService private readonly _terminalEditingService: ITerminalEditingService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDecorationsService decorationsService: IDecorationsService,
		@IThemeService themeService: IThemeService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		const labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		this._renderer = this._instantiationService.createInstance(TerminalTabsRenderer, labels, () => this.getSelectedElements(), {
			getHasText: () => true,
			getHasActionBar: () => true,
			horizontal: true,
			focusTab: instance => {
				this._focused = instance;
				this.domFocus();
			},
			focusNext: () => this.domFocus()
		});
		this._accessibilityProvider = this._instantiationService.createInstance(TerminalTabsAccessibilityProvider);
		this._element.setAttribute('aria-label', this._accessibilityProvider.getWidgetAriaLabel());
		this._singleSelected = TerminalContextKeys.tabsSingularSelection.bindTo(contextKeyService);
		this._splitFocused = TerminalContextKeys.splitTerminalTabFocused.bindTo(contextKeyService);
		this._scrollable = this._register(new DomScrollableElement(this._element, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			horizontalScrollbarSize: 3,
			scrollYToX: true,
			consumeMouseWheelIfScrollbarIsNeeded: true
		}));
		container.appendChild(this._scrollable.getDomNode());
		this._register(decorationsService.registerDecorationsProvider(this._register(this._instantiationService.createInstance(TabDecorationsProvider))));
		this._dnd = this._register(this._instantiationService.createInstance(TerminalTabsDragAndDrop, instances => {
			this.setSelection(instances.map(instance => this._instances.indexOf(instance)));
			this.setFocus(instances.length ? [this._instances.indexOf(instances[0])] : []);
		}));

		this._register(Event.any(
			this._terminalGroupService.onDidChangeInstances,
			this._terminalGroupService.onDidChangeGroups,
			this._terminalGroupService.onDidShow,
			this._terminalService.onDidChangeConnectionState,
			themeService.onDidColorThemeChange
		)(() => this.refresh()));
		this._register(Event.any(
			this._terminalGroupService.onDidChangeInstanceCapability,
			this._terminalService.onAnyInstanceTitleChange,
			this._terminalService.onAnyInstancePrimaryStatusChange
		)(instance => this._refreshInstance(instance)));
		this._register(this._terminalService.onAnyInstanceIconChange(({ instance }) => this._refreshInstance(instance)));
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, TerminalStorageKeys.TabsShowDetailed, this._store)(() => this.refresh()));
		this._register(this._terminalGroupService.onDidChangeActiveInstance(instance => {
			if (!this._activating && instance) {
				this._selection = [instance];
				this._focused = instance;
				this._anchor = instance;
			}
			if (instance && !this._instanceIndexes.has(instance)) {
				this.refresh();
			} else {
				this._updateState();
			}
			this._reveal(instance);
		}));
		this._register(dom.addDisposableListener(this._element, dom.EventType.DBLCLICK, e => {
			if (!this._getEntry(e.target)) {
				void this._createTerminal().catch(onUnexpectedError);
			}
		}));
		this._register(dom.addDisposableListener(this._element, dom.EventType.CONTEXT_MENU, e => {
			if (this._contextMenuKeyDown) {
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}
			const instance = this._getEntry(e.target);
			if (instance) {
				this.setFocus([this._instances.indexOf(instance)]);
			} else {
				this.setSelection([]);
				this.setFocus([]);
			}
		}));
		this._register(dom.addDisposableListener(this._element, dom.EventType.DRAG_OVER, e => this._onDragOver(e)));
		this._register(dom.addDisposableListener(this._element, dom.EventType.DROP, e => {
			void this._onDrop(e).catch(onUnexpectedError);
		}));
		this._register(dom.addDisposableListener(this._element, dom.EventType.DRAG_LEAVE, e => {
			if (!dom.isHTMLElement(e.relatedTarget) || !this._element.contains(e.relatedTarget)) {
				this._clearDrag();
			}
		}));
		this._register(dom.addDisposableListener(this._element, dom.EventType.DRAG_END, () => this._clearDrag()));
		this._register(dom.addDisposableListener(this._element, dom.EventType.SCROLL, () => this._scrollable.scanDomNode()));
		this._register(dom.addDisposableListener(this._element, dom.EventType.FOCUS, () => {
			if (this._instances.length) {
				this.domFocus();
			}
		}));
		this._register(dom.addDisposableListener(this._element, dom.EventType.FOCUS_OUT, e => {
			if (!dom.isHTMLElement(e.relatedTarget) || !this._element.contains(e.relatedTarget)) {
				this._contextMenuKeyDown = false;
			}
		}));
		const active = this._terminalGroupService.activeInstance;
		this._selection = active ? [active] : [];
		this._focused = active;
		this._anchor = active;
		this.refresh();
	}

	getHTMLElement(): HTMLElement { return this._element; }
	getSelection(): number[] { return this._selection.map(instance => this._instances.indexOf(instance)).filter(index => index >= 0); }
	getFocus(): number[] { return this._focused && this._instances.includes(this._focused) ? [this._instances.indexOf(this._focused)] : []; }
	getSelectedElements(): ITerminalInstance[] { return this._selection.slice(); }
	getFocusedElements(): ITerminalInstance[] { return this._focused ? [this._focused] : []; }

	setSelection(indexes: number[]): void {
		this._selection = [...new Set(indexes)].filter(index => index >= 0 && index < this._instances.length).map(index => this._instances[index]);
		this._updateState();
	}

	setFocus(indexes: number[]): void {
		this._focused = this._instances[indexes[0]];
		this._updateState();
		this._reveal(this._focused);
	}

	domFocus(): void {
		this._focused ??= this._terminalGroupService.activeInstance ?? this._instances[0];
		this._updateState();
		(this._focused ? this._entries.get(this._focused.instanceId)?.element : undefined)?.focus();
		if (!this._focused) {
			this._element.focus();
		}
		this._reveal(this._focused);
	}

	focusHover(): void {
		const instance = this._focused ?? this._selection[0];
		const entry = instance && this._entries.get(instance.instanceId);
		if (instance && entry) {
			this._hoverService.showInstantHover({ ...getInstanceHoverInfo(instance, this._storageService), target: entry.element, trapFocus: true }, true);
		}
	}

	layout(height: number, width: number): void {
		this._scrollable.getDomNode().style.width = `${Math.max(0, width)}px`;
		this._element.style.height = `${Math.max(0, height)}px`;
		this._scrollable.scanDomNode();
		this._reveal(this._focused ?? this._terminalGroupService.activeInstance);
	}

	refresh(): void {
		const hadFocus = this._element.contains(dom.getActiveElement());
		const oldFocusedIndex = this._focused ? this._instances.indexOf(this._focused) : 0;
		this._instances = this._terminalGroupService.instances.slice();
		this._instanceIndexes.clear();
		this._instances.forEach((instance, index) => this._instanceIndexes.set(instance, index));
		this._selection = this._selection.filter(instance => this._instanceIndexes.has(instance));
		if (!this._focused || !this._instanceIndexes.has(this._focused)) {
			this._focused = this._instances[Math.max(0, Math.min(oldFocusedIndex, this._instances.length - 1))];
		}
		if (!this._anchor || !this._instanceIndexes.has(this._anchor)) {
			this._anchor = this._focused;
		}
		const instanceIds = new Set(this._instances.map(instance => instance.instanceId));
		for (const [id] of this._entries) {
			if (!instanceIds.has(id)) {
				this._entries.deleteAndDispose(id);
			}
		}
		this._instances.forEach((instance, index) => {
			let entry = this._entries.get(instance.instanceId);
			if (!entry) {
				entry = this._createEntry(instance);
				this._entries.set(instance.instanceId, entry);
			}
			this._renderEntry(instance, index, entry);
			entry.element.dataset.index = String(index);
			entry.element.setAttribute('aria-label', this._accessibilityProvider.getAriaLabel(instance));
			const group = this._terminalGroupService.getGroupForInstance(instance);
			entry.element.classList.toggle('group-start', index > 0 && group !== this._terminalGroupService.getGroupForInstance(this._instances[index - 1]));
			if (this._element.children[index] !== entry.element) {
				this._element.insertBefore(entry.element, this._element.children[index] ?? null);
			}
		});
		this._updateState();
		this._scrollable.scanDomNode();
		if (hadFocus && !this._element.contains(dom.getActiveElement())) {
			this.domFocus();
		}
	}

	private _renderEntry(instance: ITerminalInstance, index: number, entry: ITerminalBarEntry): void {
		const editing = this._terminalEditingService.getEditableData(instance);
		if (!entry.rendered || entry.editing !== editing) {
			this._renderer.disposeElement(instance, index, entry.template);
			entry.editing = editing;
			this._renderer.renderElement(instance, index, entry.template);
			entry.rendered = true;
		} else if (!editing) {
			this._renderer.updateElement(instance, entry.template);
			this._renderer.updateActionBar(instance, entry.template);
		}
		entry.element.draggable = !editing;
	}

	private _refreshInstance(instance: ITerminalInstance): void {
		const entry = this._entries.get(instance.instanceId);
		const index = this._instanceIndexes.get(instance);
		if (!entry || index === undefined) {
			return; // The terminal may be hidden or hosted in an editor.
		}
		this._renderEntry(instance, index, entry);
		entry.element.setAttribute('aria-label', this._accessibilityProvider.getAriaLabel(instance));
		if (!this._scan.value) {
			this._scan.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this._element), () => {
				this._scan.clear();
				this._scrollable.scanDomNode();
			});
		}
	}

	private _createEntry(instance: ITerminalInstance): ITerminalBarEntry {
		const element = dom.$('.terminal-tabs-bar-tab', { role: 'tab', 'data-instance-id': instance.instanceId });
		this._element.appendChild(element);
		const disposables = new DisposableStore();
		const template = this._renderer.renderTemplate(element);
		disposables.add(dom.addDisposableListener(element, dom.EventType.CLICK, e => {
			if (!this._isEntryAction(e)) {
				void this._onClick(instance, e).catch(onUnexpectedError);
			}
		}));
		disposables.add(dom.addDisposableListener(element, dom.EventType.DBLCLICK, e => {
			if (!this._isEntryAction(e) && this._configurationService.getValue(TerminalSettingId.TabsFocusMode) === 'doubleClick') {
				instance.focus(true);
			}
		}));
		disposables.add(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, e => this._onKeyDown(instance, e)));
		disposables.add(dom.addDisposableListener(element, dom.EventType.KEY_UP, e => this._onKeyUp(instance, e)));
		disposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS, () => {
			this._focused = instance;
			this._terminalGroupService.lastAccessedMenu = 'tab-list';
			this._updateState();
		}));
		disposables.add(dom.addDisposableListener(element, dom.EventType.DRAG_START, e => {
			if (!e.dataTransfer || !this._dnd.getDragURI(instance)) {
				e.preventDefault();
				return;
			}
			if (!this._selection.includes(instance)) {
				this.setSelection([this._instances.indexOf(instance)]);
			}
			e.dataTransfer.effectAllowed = 'copyMove';
			this._dnd.onDragStart(new ElementsDragAndDropData(this._selection.slice()), e);
			applyDragImage(e, element, this._selection.length === 1 ? instance.title : `${this._selection.length}`);
		}));
		return {
			element, template, disposables, editing: undefined, rendered: false,
			dispose: () => {
				disposables.dispose();
				this._renderer.disposeElement(instance, 0, template);
				this._renderer.disposeTemplate(template);
				element.remove();
			}
		};
	}

	private _isEntryAction(event: MouseEvent): boolean {
		return dom.isHTMLElement(event.target) && !!event.target.closest('.actions, .monaco-inputbox');
	}

	private async _onClick(instance: ITerminalInstance, event: MouseEvent): Promise<void> {
		this._terminalGroupService.lastAccessedMenu = 'tab-list';
		const useAltForSelection = this._configurationService.getValue('workbench.list.multiSelectModifier') === 'alt';
		if (event.altKey && !useAltForSelection) {
			await this._terminalService.createTerminal({ location: { parentTerminal: instance } });
			return;
		}
		const selectionModifier = useAltForSelection ? event.altKey : this._os === OperatingSystem.Macintosh ? event.metaKey : event.ctrlKey;
		this._select(instance, event.shiftKey, selectionModifier);
		this.domFocus();
		if (!event.shiftKey && !selectionModifier) {
			this._activate(instance);
			if (this._configurationService.getValue(TerminalSettingId.TabsFocusMode) === 'singleClick') {
				instance.focus(true);
			}
		}
	}

	private _select(instance: ITerminalInstance, range: boolean, toggle: boolean): void {
		if (range) {
			const anchor = this._instances.indexOf(this._anchor ?? this._focused ?? instance);
			const index = this._instances.indexOf(instance);
			this._selection = this._instances.slice(Math.min(anchor, index), Math.max(anchor, index) + 1);
		} else {
			this._anchor = instance;
			this._selection = toggle
				? this._selection.includes(instance) ? this._selection.filter(selected => selected !== instance) : [...this._selection, instance]
				: [instance];
		}
		this._focused = instance;
		this._updateState();
	}

	private _onKeyDown(instance: ITerminalInstance, event: KeyboardEvent): void {
		if (event.target !== this._entries.get(instance.instanceId)?.element) {
			return;
		}
		const keyboardEvent = new StandardKeyboardEvent(event);
		this._contextMenuKeyDown = this._isContextMenuKey(keyboardEvent);
		if (this._contextMenuKeyDown) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const modifier = this._os === OperatingSystem.Macintosh ? event.metaKey : event.ctrlKey;
		let index = this._instances.indexOf(instance);
		switch (keyboardEvent.keyCode) {
			case KeyCode.LeftArrow: index--; break;
			case KeyCode.RightArrow: index++; break;
			case KeyCode.Home: index = 0; break;
			case KeyCode.End: index = this._instances.length - 1; break;
			case KeyCode.KeyA:
				if (!modifier || event.shiftKey || event.altKey || (this._os === OperatingSystem.Macintosh ? event.ctrlKey : event.metaKey)) {
					return;
				}
				this.setSelection(this._instances.map((_, i) => i));
				event.preventDefault();
				event.stopPropagation();
				return;
			case KeyCode.Enter:
				if (this._os === OperatingSystem.Macintosh) {
					return;
				}
				this._activate(instance);
				instance.focus(true);
				event.preventDefault();
				event.stopPropagation();
				return;
			case KeyCode.Space:
				if (modifier) {
					this._select(instance, false, true);
				} else {
					this._activate(instance);
					instance.focus(true);
				}
				event.preventDefault();
				event.stopPropagation();
				return;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		const target = this._instances[Math.max(0, Math.min(index, this._instances.length - 1))];
		if (modifier && !event.shiftKey) {
			this._focused = target;
		} else {
			this._select(target, event.shiftKey, false);
			if (!event.shiftKey) {
				this._activate(target);
			}
		}
		this.domFocus();
	}

	private _isContextMenuKey(event: StandardKeyboardEvent): boolean {
		return event.keyCode !== KeyCode.KEY_IN_COMPOSITION &&
			(event.keyCode === KeyCode.ContextMenu || event.code === 'ContextMenu' || (event.shiftKey && event.keyCode === KeyCode.F10));
	}

	private _onKeyUp(instance: ITerminalInstance, event: KeyboardEvent): void {
		this._contextMenuKeyDown = false;
		const element = this._entries.get(instance.instanceId)?.element;
		if (!element || event.target !== element || !this._isContextMenuKey(new StandardKeyboardEvent(event))) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const bounds = element.getBoundingClientRect();
		element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: bounds.left, clientY: bounds.bottom }));
	}

	private _activate(instance: ITerminalInstance): void {
		this._activating = true;
		try {
			this._terminalGroupService.setActiveInstance(instance);
		} finally {
			this._activating = false;
		}
	}

	private _updateState(): void {
		this._singleSelected.set(this._selection.length === 1);
		this._splitFocused.set(!!this._focused && this._terminalGroupService.instanceIsSplit(this._focused));
		this._element.tabIndex = this._focused ? -1 : 0;
		const selectedInstances = new Set(this._selection);
		const activeInstance = this._terminalGroupService.activeInstance;
		for (const instance of this._instances) {
			const entry = this._entries.get(instance.instanceId);
			if (entry) {
				const selected = selectedInstances.has(instance);
				entry.element.tabIndex = instance === this._focused ? 0 : -1;
				entry.element.classList.toggle('selected', selected);
				entry.element.setAttribute('aria-selected', String(selected));
				entry.element.setAttribute('aria-current', String(instance === activeInstance));
				entry.template.element.classList.toggle('is-active', instance === activeInstance);
			}
		}
	}

	private _reveal(instance: ITerminalInstance | undefined): void {
		const entry = instance && this._entries.get(instance.instanceId);
		if (!entry || this._element.clientWidth === 0) {
			return;
		}
		const left = entry.element.offsetLeft;
		const right = left + entry.element.offsetWidth;
		const scrollLeft = this._element.scrollLeft;
		if (left < scrollLeft || entry.element.offsetWidth > this._element.clientWidth) {
			this._scrollable.setScrollPosition({ scrollLeft: left });
		} else if (right > scrollLeft + this._element.clientWidth) {
			this._scrollable.setScrollPosition({ scrollLeft: right - this._element.clientWidth });
		}
	}

	private _getEntry(target: EventTarget | null): ITerminalInstance | undefined {
		const element = dom.isHTMLElement(target) ? target.closest<HTMLElement>('.terminal-tabs-bar-tab') : null;
		return element ? this._instances.find(instance => String(instance.instanceId) === element.dataset.instanceId) : undefined;
	}

	private _onDragOver(event: DragEvent): void {
		const instance = this._getEntry(event.target);
		const reaction = this._dnd.onDragOver(new NativeDragAndDropData(), instance, instance ? this._instances.indexOf(instance) : undefined, undefined, event);
		if (!reaction || (typeof reaction !== 'boolean' && !reaction.accept)) {
			this._clearDrag();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
		this._element.classList.toggle('drop-target', !instance);
		for (const [id, entry] of this._entries) {
			entry.element.classList.toggle('drop-target', id === instance?.instanceId);
		}
		const bounds = this._element.getBoundingClientRect();
		const direction = event.clientX < bounds.left + 24 ? -1 : event.clientX > bounds.right - 24 ? 1 : 0;
		this._dragScroll.clear();
		if (direction) {
			this._dragScroll.value = dom.animate(dom.getWindow(this._element), () => {
				this._scrollable.setScrollPosition({ scrollLeft: this._element.scrollLeft + direction * 8 });
			});
		}
	}

	private async _onDrop(event: DragEvent): Promise<void> {
		const instance = this._getEntry(event.target);
		const reaction = this._dnd.onDragOver(new NativeDragAndDropData(), instance, undefined, undefined, event);
		if (!reaction || (typeof reaction !== 'boolean' && !reaction.accept)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this._clearDrag();
		await this._dnd.drop(new NativeDragAndDropData(), instance, undefined, undefined, event);
	}

	private _clearDrag(): void {
		this._dragScroll.clear();
		this._dnd.onDragLeave();
		this._element.classList.remove('drop-target');
		for (const [, entry] of this._entries) {
			entry.element.classList.remove('drop-target');
		}
	}

	private async _createTerminal(): Promise<void> {
		const instance = await this._terminalService.createTerminal({ location: TerminalLocation.Panel });
		this._terminalGroupService.setActiveInstance(instance);
		await instance.focusWhenReady();
	}
}
