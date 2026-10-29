/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { Action, IAction, Separator, SubmenuAction } from '../../../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isMacintosh, OS } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ContextMenuService } from '../../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../../platform/hover/browser/hoverService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILayoutOffsetInfo, ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../../../platform/list/browser/listService.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { ComponentFixtureContext, createEditorServices, registerWorkbenchServices } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../../services/sessions/browser/sessionsListModelService.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { MockColor, MockPaletteColor, MOCK_PALETTE_ORDER } from './colorGroupsMockupColors.js';
import { ColorGroupsMockChat } from './colorGroupsMockupChat.js';
import { collectionAccent, ColorGroupsCollectionEditor, ColorGroupsHeaderEditor, IHeaderEditorTarget, renderCollectionIcon } from './colorGroupsMockupEditors.js';
import { ColorGroupsMockList, IMockGroupRow, IMockSectionRow, MockDensity, MockGroupStyle, MockRowKind } from './colorGroupsMockupList.js';
import { ColorGroupsMockModel, getBuiltInSectionStyle, getCollection, getCollectionAttention, getCollectionSessions, getSession, IMockCollection, IMockState, MockSessionStatus } from './colorGroupsMockupModel.js';

const $ = DOM.$;

export const enum MockSwitcherStyle {
	/** Browser-style icon strip in the title bar. */
	TitleBar = 'titlebar',
	/** Labeled tabs at the top of the sidebar. */
	Tabs = 'tabs',
	/** Only the Sessions header menu. */
	Menu = 'menu',
}

export const enum MockThemeKind {
	Dark = 'dark',
	Light = 'light',
}

/** Everything needed to restore the demo, e.g. after switching themes. */
export interface IColorGroupsMockupSnapshot {
	readonly state: IMockState;
	readonly collectionId: string;
	readonly selectedSessionId: string | undefined;
	readonly style: MockGroupStyle;
	readonly density: MockDensity;
	readonly switcher: MockSwitcherStyle;
}

export interface IColorGroupsMockupOptions {
	readonly style?: MockGroupStyle;
	readonly density?: MockDensity;
	readonly switcher?: MockSwitcherStyle;
	readonly collectionId?: string;
	readonly selectedSessionId?: string;
	/** Shows the mockup control panel beside the window. */
	readonly controls?: boolean;
	/** Fills the browser viewport when the fixture is opened on its own. */
	readonly interactive?: boolean;
	readonly width?: number;
	readonly height?: number;
	readonly state?: IMockState;
	/** Adds a theme switch to the mockup controls. The host reloads in the other theme and restores the snapshot. */
	readonly themeSwitch?: {
		readonly current: MockThemeKind;
		switchTo(theme: MockThemeKind, snapshot: IColorGroupsMockupSnapshot): void;
	};
}

export interface IColorGroupsMockup {
	readonly model: ColorGroupsMockModel;
	readonly list: ColorGroupsMockList;
	readonly root: HTMLElement;
	readonly view: ColorGroupsMockupView;
}

const mod = isMacintosh ? '⌘' : 'Ctrl+';
const ctrl = isMacintosh ? '⌃' : 'Ctrl+';

//#region Services

class MockLayoutService implements ILayoutService {
	declare readonly _serviceBrand: undefined;

	readonly onDidLayoutMainContainer = Event.None;
	readonly onDidLayoutActiveContainer = Event.None;
	readonly onDidLayoutContainer = Event.None;
	readonly onDidChangeActiveContainer = Event.None;
	readonly onDidAddContainer = Event.None;
	readonly mainContainerOffset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };
	readonly activeContainerOffset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };

	constructor(readonly mainContainer: HTMLElement) { }

	get activeContainer(): HTMLElement { return this.mainContainer; }
	get containers(): Iterable<HTMLElement> { return [this.mainContainer]; }
	get mainContainerDimension(): DOM.IDimension { return DOM.getClientArea(this.mainContainer); }
	get activeContainerDimension(): DOM.IDimension { return DOM.getClientArea(this.mainContainer); }
	getContainer(): HTMLElement { return this.mainContainer; }
	whenContainerStylesLoaded(): undefined { return undefined; }
	focus(): void { }
}

/** Uses the production status icon mapping; the mockup never reads other list model state. */
class MockSessionsListModelService extends mock<ISessionsListModelService>() {
	override getStatusIcon = SessionsListModelService.prototype.getStatusIcon;
}

function createMockServices(context: ComponentFixtureContext, root: HTMLElement) {
	return createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IListService, ListService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(ILayoutService, new MockLayoutService(root));
			reg.define(IContextViewService, ContextViewService);
			reg.define(IContextMenuService, ContextMenuService);
			reg.define(IHoverService, HoverService);
			reg.defineInstance(ISessionsListModelService, new MockSessionsListModelService());
		},
	});
}

//#endregion

//#region Render

export async function renderColorGroupsMockup(context: ComponentFixtureContext, options: IColorGroupsMockupOptions = {}): Promise<IColorGroupsMockup> {
	const { container, disposableStore } = context;
	const targetWindow = DOM.getWindow(container);
	const standalone = !!options.interactive && targetWindow.parent === targetWindow;
	const controls = options.controls ?? false;
	const width = options.width ?? (controls ? 1400 : 1100);
	const height = options.height ?? 820;
	if (standalone) {
		container.style.width = '100vw';
		container.style.height = '100vh';
		targetWindow.document.body.style.margin = '0';
		targetWindow.document.body.style.overflow = 'hidden';
	} else {
		container.style.width = `${width}px`;
		container.style.height = `${height}px`;
	}
	if (options.interactive) {
		container.classList.remove('disable-animations');
	}

	const root = DOM.append(container, $('.cg-demo'));
	const instantiationService = createMockServices(context, root);
	const model = disposableStore.add(new ColorGroupsMockModel(options.state));
	const view = disposableStore.add(instantiationService.createInstance(ColorGroupsMockupView, root, model, context.theme.type, options));
	view.layout();
	if (options.selectedSessionId) {
		view.list.reveal(options.selectedSessionId);
	}
	disposableStore.add(DOM.addDisposableListener(targetWindow, DOM.EventType.RESIZE, () => view.layout()));
	return { model, list: view.list, root, view };
}

//#endregion

//#region View

export class ColorGroupsMockupView extends Disposable {

	readonly list: ColorGroupsMockList;
	readonly activeCollectionId: IObservable<string>;
	readonly style = observableValue<MockGroupStyle>(this, MockGroupStyle.Rail);
	readonly density = observableValue<MockDensity>(this, MockDensity.Comfortable);
	readonly switcher = observableValue<MockSwitcherStyle>(this, MockSwitcherStyle.TitleBar);
	private readonly _activeCollectionId: ISettableObservable<string>;
	readonly selectedSessionId: ISettableObservable<string | undefined> = observableValue<string | undefined>(this, undefined);
	/** The last selected session per collection, restored when switching back. */
	private readonly lastSelection = new Map<string, string | undefined>();
	readonly chat: ColorGroupsMockChat;

	private readonly window: HTMLElement;
	private readonly sidebar: HTMLElement;
	private readonly listHost: HTMLElement;
	private readonly headerTitle: HTMLElement;
	private readonly headerEditor: ColorGroupsHeaderEditor;
	private readonly collectionEditor: ColorGroupsCollectionEditor;
	private readonly toastTimer = this._register(new MutableDisposable());

	constructor(
		private readonly root: HTMLElement,
		private readonly model: ColorGroupsMockModel,
		private readonly scheme: ColorScheme,
		options: IColorGroupsMockupOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this._activeCollectionId = observableValue<string>(this, options.collectionId ?? model.current.collections[0].id);
		this.activeCollectionId = this._activeCollectionId;
		this.style.set(options.style ?? MockGroupStyle.Rail, undefined);
		this.density.set(options.density ?? MockDensity.Comfortable, undefined);
		this.switcher.set(options.switcher ?? MockSwitcherStyle.TitleBar, undefined);
		this.selectedSessionId.set(options.selectedSessionId, undefined);

		root.classList.toggle('cg-with-controls', !!options.controls);
		this.window = DOM.append(root, $('.cg-window', { role: 'application', 'aria-label': 'Agents window mockup' }));

		// Title bar
		const titlebar = DOM.append(this.window, $('.cg-titlebar'));
		const lights = DOM.append(titlebar, $('.cg-traffic-lights', { 'aria-hidden': 'true' }));
		for (const color of ['close', 'min', 'max']) {
			DOM.append(lights, $(`span.cg-light.cg-light-${color}`));
		}
		const strip = DOM.append(titlebar, $('.cg-collection-strip', { role: 'tablist', 'aria-label': 'Collections' }));
		DOM.append(titlebar, $('.cg-title', undefined, 'Agents'));

		const body = DOM.append(this.window, $('.cg-body'));
		this.sidebar = DOM.append(body, $('.cg-sidebar'));
		const tabs = DOM.append(this.sidebar, $('.cg-collection-tabs.monaco-custom-radio.segmented', { role: 'tablist', 'aria-label': 'Collections' }));
		this.renderNavigation(DOM.append(this.sidebar, $('.cg-nav')));
		const header = DOM.append(this.sidebar, $('.cg-sessions-header'));
		this.listHost = DOM.append(this.sidebar, $('.cg-list-host'));
		const toast = DOM.append(this.sidebar, $('.cg-toast', { role: 'status', 'aria-live': 'polite' }));
		const main = DOM.append(body, $('.cg-main'));

		this.headerEditor = this._register(instantiationService.createInstance(ColorGroupsHeaderEditor, model, scheme, {
			newSession: target => this.newSessionFor(target),
			moveToCollection: (target, collectionId) => this.moveHeaderToCollection(target, collectionId),
			ungroup: groupId => model.ungroup(groupId),
			closeGroup: groupId => model.closeGroup(groupId),
			removeWorkspaceColor: workspace => model.setWorkspaceColor(workspace, undefined),
			removeSectionColor: section => model.setBuiltInSectionColor(section, undefined),
		}));
		this.collectionEditor = this._register(instantiationService.createInstance(ColorGroupsCollectionEditor, model, scheme, {
			deleteCollection: collectionId => this.deleteCollection(collectionId),
		}));

		this.list = this._register(instantiationService.createInstance(ColorGroupsMockList, this.listHost, model, {
			collectionId: this.activeCollectionId,
			density: this.density,
			scheme,
		}, {
			editHeader: (row, anchor) => this.editHeader(row, anchor),
			openSession: sessionId => this.selectedSessionId.set(sessionId, undefined),
			newSession: target => this.chat.startNewSession(target),
			buildMoveToCollectionActions: (apply, exclude) => this.model.current.collections.map(collection => {
				const action = new Action(`cg.moveTo.${collection.id}`, collection.name, undefined, collection.id !== exclude, async () => {
					apply(collection.id);
				});
				action.checked = collection.id === exclude;
				return action;
			}),
		}));

		this.chat = this._register(instantiationService.createInstance(ColorGroupsMockChat, main, model, scheme, {
			activeCollectionId: this.activeCollectionId,
			selectedSessionId: this.selectedSessionId,
			revealSession: sessionId => this.list.reveal(sessionId),
		}));

		this.renderStrip(strip);
		this.renderTabs(tabs);
		this.headerTitle = this.renderSessionsHeader(header);
		this.renderToast(toast);
		if (options.controls) {
			this.renderControls(DOM.append(root, $('.cg-controls')), options.themeSwitch);
		}

		this._register(autorun(reader => {
			this.window.dataset.groupStyle = this.style.read(reader);
			this.window.dataset.density = this.density.read(reader);
			this.window.dataset.switcher = this.switcher.read(reader);
			this.layout();
		}));
		this._register(autorun(reader => {
			const state = this.model.state.read(reader);
			// Keep the active collection valid across deletes and undo.
			if (!getCollection(state, this._activeCollectionId.read(reader))) {
				this._activeCollectionId.set(state.collections[0].id, undefined);
			}
		}));
		this._register(autorun(reader => {
			if (!this.selectedSessionId.read(reader)) {
				this.list.clearSelection();
			}
		}));

		this._register(DOM.addStandardDisposableListener(this.root, DOM.EventType.KEY_DOWN, e => {
			const primaryModifier = isMacintosh ? e.metaKey : e.ctrlKey;
			if (primaryModifier && !e.shiftKey && !e.altKey && e.keyCode === KeyCode.KeyN) {
				e.preventDefault();
				this.chat.startNewSession();
				return;
			}
			// Collection switching works from anywhere, including the chat input.
			if (e.ctrlKey && !e.metaKey && !e.altKey && e.keyCode >= KeyCode.Digit1 && e.keyCode <= KeyCode.Digit9) {
				const collection = this.model.current.collections[e.keyCode - KeyCode.Digit1];
				if (collection) {
					e.preventDefault();
					this.switchTo(collection.id);
				}
				return;
			}
			if (DOM.isEditableElement(e.target as Element)) {
				return;
			}
			if (primaryModifier && e.keyCode === KeyCode.KeyZ && !e.shiftKey) {
				e.preventDefault();
				this.undo();
			}
		}));
	}

	/** Captures the demo so it can be restored in another theme. */
	snapshot(): IColorGroupsMockupSnapshot {
		return {
			state: this.model.current,
			collectionId: this.activeCollectionId.get(),
			selectedSessionId: this.selectedSessionId.get(),
			style: this.style.get(),
			density: this.density.get(),
			switcher: this.switcher.get(),
		};
	}

	layout(): void {
		const height = this.listHost.clientHeight;
		const width = this.listHost.clientWidth;
		if (height > 0 && width > 0) {
			this.list.layout(height, width);
		}
	}

	switchTo(collectionId: string): void {
		const previous = this._activeCollectionId.get();
		if (previous === collectionId) {
			return;
		}
		this.headerEditor.hide();
		// Like browser workspaces, each collection remembers what you had open in it.
		this.lastSelection.set(previous, this.selectedSessionId.get());
		const restored = this.lastSelection.get(collectionId);
		const restoredSession = restored ? getSession(this.model.current, restored) : undefined;
		transaction(tx => {
			this._activeCollectionId.set(collectionId, tx);
			this.selectedSessionId.set(restoredSession?.collectionId === collectionId ? restored : undefined, tx);
		});
		if (restoredSession?.collectionId === collectionId) {
			this.list.reveal(restoredSession.id);
		}
		this.window.classList.remove('cg-switching');
		void this.window.offsetWidth;
		this.window.classList.add('cg-switching');
	}

	undo(): void {
		this.headerEditor.hide();
		this.collectionEditor.hide();
		this.model.undo();
	}

	/** Opens the color editor for a group or workspace header. */
	editHeader(row: IMockGroupRow | IMockSectionRow, anchor: HTMLElement): void {
		const collectionId = this.activeCollectionId.get();
		const target: IHeaderEditorTarget = row.kind === MockRowKind.Group
			? { groupId: row.groupId, workspace: row.workspace, builtIn: row.builtIn, collectionId }
			: { workspace: row.workspace, builtIn: row.builtIn, collectionId };
		if (!target.groupId && !target.workspace && !target.builtIn) {
			return;
		}
		// Coloring an uncolored section starts from the first palette color not already in use.
		if (target.builtIn && !getBuiltInSectionStyle(this.model.current, target.builtIn).color) {
			this.model.setBuiltInSectionColor(target.builtIn, this.unusedPaletteColor());
			this.headerEditor.show(target, this.list.getHeaderElement(target.builtIn) ?? anchor);
			return;
		}
		if (!target.groupId && target.workspace && !this.model.current.workspaces[target.workspace]?.color) {
			this.model.setWorkspaceColor(target.workspace, this.unusedPaletteColor());
			this.headerEditor.show(target, this.list.getHeaderElement(`workspace:${target.workspace}`) ?? anchor);
			return;
		}
		this.headerEditor.show(target, anchor);
	}

	private unusedPaletteColor(): MockColor {
		const state = this.model.current;
		const collectionId = this.activeCollectionId.get();
		const used = new Set<MockPaletteColor>();
		const note = (color: MockColor | undefined) => {
			if (color?.kind === 'palette') {
				used.add(color.id);
			}
		};
		state.groups.filter(g => g.collectionId === collectionId).forEach(g => note(g.color));
		Object.values(state.workspaces).forEach(style => note(style.color));
		Object.values(state.builtInSections ?? {}).forEach(style => note(style?.color));
		return { kind: 'palette', id: MOCK_PALETTE_ORDER.find(id => id !== MockPaletteColor.Grey && !used.has(id)) ?? MockPaletteColor.Blue };
	}

	/** Opens the color editor for a group by id, as the header's pencil does. */
	openGroupEditor(groupId: string, options: { readonly customColor?: boolean } = {}): void {
		const anchor = this.list.getHeaderElement(`group:${groupId}`);
		if (anchor) {
			this.headerEditor.show({ groupId, collectionId: this.activeCollectionId.get() }, anchor);
			if (options.customColor) {
				this.headerEditor.expandCustomColor();
			}
		}
	}

	/**
	 * Opens the collection editor below `anchor`: by default the collection's visible
	 * switcher button, or the Sessions header menu when no switcher shows it. Anchors are
	 * resolved lazily because the switchers re-render as the collection is edited.
	 */
	editCollection(collectionId: string, isNew = false, anchor: () => HTMLElement = () => this.collectionAnchor(collectionId, this.window)): void {
		this.collectionEditor.show(collectionId, anchor, isNew);
	}

	/** The visible button for the collection within `switcher`, falling back to the Sessions header menu. */
	private collectionAnchor(collectionId: string, switcher: HTMLElement): HTMLElement {
		const buttons = switcher.querySelectorAll<HTMLElement>(`[data-collection-id="${collectionId}"]`);
		return Array.from(buttons).find(button => button.getClientRects().length > 0) ?? this.headerTitle;
	}

	private newCollection(anchor?: () => HTMLElement): void {
		const used = new Set(this.model.current.collections.map(c => c.color.kind === 'palette' ? c.color.id : undefined));
		const color = [MockPaletteColor.Purple, MockPaletteColor.Pink, MockPaletteColor.Cyan, MockPaletteColor.Yellow, MockPaletteColor.Red].find(c => !used.has(c)) ?? MockPaletteColor.Grey;
		const id = this.model.createCollection('New collection', 'star', { kind: 'palette', id: color });
		this.switchTo(id);
		DOM.getWindow(this.root).requestAnimationFrame(() => this.editCollection(id, true, anchor));
	}

	private deleteCollection(collectionId: string): void {
		const name = getCollection(this.model.current, collectionId)?.name;
		const fallback = this.model.deleteCollection(collectionId);
		if (fallback) {
			this._activeCollectionId.set(fallback, undefined);
			this.showToast(`Deleted ${name}. Its sessions moved to ${getCollection(this.model.current, fallback)?.name}.`);
		}
	}

	private newSessionFor(target: IHeaderEditorTarget): void {
		this.chat.startNewSession({ groupId: target.groupId, workspace: target.workspace });
	}

	private moveHeaderToCollection(target: IHeaderEditorTarget, collectionId: string): void {
		if (target.groupId) {
			this.model.moveGroupToCollection(target.groupId, collectionId);
		} else if (target.workspace) {
			this.model.moveWorkspaceToCollection(target.collectionId, target.workspace, collectionId);
		}
	}

	//#region Collection switchers

	private collectionHover(collection: IMockCollection, index: number): string {
		const state = this.model.current;
		const sessions = getCollectionSessions(state, collection.id).length;
		const attention = getCollectionAttention(state, collection.id);
		const attentionText = attention === MockSessionStatus.NeedsInput ? ' · needs input' : attention === MockSessionStatus.Unread ? ' · unread' : '';
		return `${collection.name} · ${sessions} sessions${attentionText}  (${ctrl}${index + 1})`;
	}

	private collectionMenuActions(collection: IMockCollection, anchor: () => HTMLElement): IAction[] {
		const index = this.model.current.collections.indexOf(collection);
		return [
			new Action('cg.editCollection', 'Edit Collection…', undefined, true, async () => this.editCollection(collection.id, false, anchor)),
			new Action('cg.moveLeft', 'Move Left', undefined, index > 0, async () => this.model.moveCollection(collection.id, -1)),
			new Action('cg.moveRight', 'Move Right', undefined, index < this.model.current.collections.length - 1, async () => this.model.moveCollection(collection.id, 1)),
			new Separator(),
			new Action('cg.deleteCollection', 'Delete Collection', undefined, this.model.current.collections.length > 1, async () => this.deleteCollection(collection.id)),
		];
	}

	/** Makes a switcher button a drop target for sessions, groups, and workspaces. */
	private registerCollectionDropTarget(element: HTMLElement, collectionId: string, store: DisposableStore): void {
		const canDrop = () => !!this.list.dragState.get() && collectionId !== this.activeCollectionId.get();
		store.add(DOM.addDisposableListener(element, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			if (canDrop()) {
				e.preventDefault();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'move';
				}
				element.classList.add('cg-drop-target');
			}
		}));
		store.add(DOM.addDisposableListener(element, DOM.EventType.DRAG_LEAVE, () => element.classList.remove('cg-drop-target')));
		store.add(DOM.addDisposableListener(element, DOM.EventType.DROP, (e: DragEvent) => {
			element.classList.remove('cg-drop-target');
			const drag = this.list.dragState.get();
			if (!drag || !canDrop()) {
				return;
			}
			e.preventDefault();
			const from = this.activeCollectionId.get();
			if (drag.sectionKey?.startsWith('group:')) {
				this.model.moveGroupToCollection(drag.sectionKey.slice('group:'.length), collectionId);
			} else if (drag.sectionKey?.startsWith('workspace:')) {
				this.model.moveWorkspaceToCollection(from, drag.sectionKey.slice('workspace:'.length), collectionId);
			} else {
				this.model.moveSessionsToCollection(drag.sessionIds, collectionId);
			}
		}));
	}

	private renderStrip(strip: HTMLElement): void {
		const store = this._register(new DisposableStore());
		this._register(autorun(reader => {
			const state = this.model.state.read(reader);
			const active = this.activeCollectionId.read(reader);
			const dragging = !!this.list.dragState.read(reader);
			store.clear();
			DOM.clearNode(strip);
			strip.classList.toggle('cg-dragging', dragging);
			state.collections.forEach((collection, index) => {
				const button = DOM.append(strip, $('button.cg-strip-button', { role: 'tab', type: 'button', 'aria-label': collection.name, 'aria-selected': String(collection.id === active), 'data-collection-id': collection.id }));
				button.classList.toggle('active', collection.id === active);
				button.tabIndex = collection.id === active ? 0 : -1;
				button.style.setProperty('--cg-accent', collectionAccent(collection, this.scheme));
				renderCollectionIcon(DOM.append(button, $('span.cg-strip-icon')), collection.icon);
				const attention = collection.id === active ? undefined : getCollectionAttention(state, collection.id);
				if (attention === MockSessionStatus.NeedsInput || attention === MockSessionStatus.Unread) {
					DOM.append(button, $(`span.cg-strip-badge.${attention}`));
				}
				store.add(this.hoverService.setupDelayedHover(button, { content: this.collectionHover(collection, index) }));
				const anchor = () => this.collectionAnchor(collection.id, strip);
				store.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.switchTo(collection.id)));
				store.add(DOM.addDisposableListener(button, DOM.EventType.DBLCLICK, () => this.editCollection(collection.id, false, anchor)));
				store.add(DOM.addDisposableListener(button, DOM.EventType.CONTEXT_MENU, (e: MouseEvent) => {
					e.preventDefault();
					this.contextMenuService.showContextMenu({ getAnchor: () => button, getActions: () => this.collectionMenuActions(collection, anchor) });
				}));
				this.registerCollectionDropTarget(button, collection.id, store);
			});
			const add = DOM.append(strip, $('button.cg-strip-button.cg-strip-add', { type: 'button', 'aria-label': 'New Collection' }));
			DOM.append(add, $(`span${ThemeIcon.asCSSSelector(Codicon.add)}`));
			store.add(this.hoverService.setupDelayedHover(add, { content: 'New Collection' }));
			store.add(DOM.addDisposableListener(add, DOM.EventType.CLICK, () => this.newCollection()));
		}));
		this._register(DOM.addStandardDisposableListener(strip, DOM.EventType.KEY_DOWN, e => {
			const delta = e.equals(KeyCode.RightArrow) ? 1 : e.equals(KeyCode.LeftArrow) ? -1 : 0;
			if (!delta) {
				return;
			}
			const collections = this.model.current.collections;
			const index = collections.findIndex(c => c.id === this.activeCollectionId.get());
			const next = collections[(index + delta + collections.length) % collections.length];
			this.switchTo(next.id);
			strip.querySelector<HTMLElement>(`[data-collection-id="${next.id}"]`)?.focus();
		}));
	}

	private renderTabs(tabs: HTMLElement): void {
		const store = this._register(new DisposableStore());
		this._register(autorun(reader => {
			const state = this.model.state.read(reader);
			const active = this.activeCollectionId.read(reader);
			this.list.dragState.read(reader);
			store.clear();
			DOM.clearNode(tabs);
			state.collections.forEach((collection, index) => {
				const button = DOM.append(tabs, $('button.monaco-button.cg-tab', { role: 'tab', type: 'button', 'aria-selected': String(collection.id === active), 'data-collection-id': collection.id }));
				button.classList.toggle('active', collection.id === active);
				button.tabIndex = collection.id === active ? 0 : -1;
				button.style.setProperty('--cg-accent', collectionAccent(collection, this.scheme));
				renderCollectionIcon(DOM.append(button, $('span.cg-tab-icon')), collection.icon);
				DOM.append(button, $('span.cg-tab-label', undefined, collection.name));
				const attention = collection.id === active ? undefined : getCollectionAttention(state, collection.id);
				if (attention === MockSessionStatus.NeedsInput || attention === MockSessionStatus.Unread) {
					DOM.append(button, $(`span.cg-strip-badge.${attention}`));
				}
				store.add(this.hoverService.setupDelayedHover(button, { content: this.collectionHover(collection, index) }));
				store.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.switchTo(collection.id)));
				store.add(DOM.addDisposableListener(button, DOM.EventType.CONTEXT_MENU, (e: MouseEvent) => {
					e.preventDefault();
					this.contextMenuService.showContextMenu({ getAnchor: () => button, getActions: () => this.collectionMenuActions(collection, () => this.collectionAnchor(collection.id, tabs)) });
				}));
				this.registerCollectionDropTarget(button, collection.id, store);
			});
			const add = DOM.append(tabs, $('button.monaco-button.cg-tab.cg-tab-add', { type: 'button', 'aria-label': 'New Collection' }));
			DOM.append(add, $(`span${ThemeIcon.asCSSSelector(Codicon.add)}`));
			store.add(this.hoverService.setupDelayedHover(add, { content: 'New Collection' }));
			store.add(DOM.addDisposableListener(add, DOM.EventType.CLICK, () => this.newCollection()));
		}));
	}

	//#endregion

	//#region Sidebar

	private renderNavigation(nav: HTMLElement): void {
		const rows: { icon: ThemeIcon; label: string; trailing?: string }[] = [
			{ icon: Codicon.calendar, label: 'Automations' },
			{ icon: Codicon.extensions, label: 'Customizations', trailing: '112' },
		];
		for (const row of rows) {
			const item = DOM.append(nav, $('.cg-nav-row.session-section'));
			DOM.append(item, $(`span.session-section-icon${ThemeIcon.asCSSSelector(row.icon)}`));
			const labelContainer = DOM.append(item, $('span.session-section-label-container'));
			DOM.append(labelContainer, $('span.session-section-label', undefined, row.label));
			if (row.trailing) {
				DOM.append(item, $('span.session-section-count', undefined, row.trailing));
			}
		}
	}

	private renderSessionsHeader(header: HTMLElement): HTMLElement {
		const title = DOM.append(header, $('button.cg-header-title', { type: 'button', 'aria-haspopup': 'menu' }));
		const titleIcon = DOM.append(title, $('span.cg-header-title-icon'));
		const titleLabel = DOM.append(title, $('span.cg-header-title-label'));
		DOM.append(title, $(`span.cg-header-title-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));
		this._register(DOM.addDisposableListener(title, DOM.EventType.CLICK, () => this.showCollectionMenu(title)));
		this._register(autorun(reader => {
			const state = this.model.state.read(reader);
			const collection = getCollection(state, this.activeCollectionId.read(reader));
			if (!collection) {
				return;
			}
			const accent = collectionAccent(collection, this.scheme);
			title.style.setProperty('--cg-accent', accent);
			renderCollectionIcon(titleIcon, collection.icon);
			titleLabel.textContent = collection.name;
			title.setAttribute('aria-label', `Collection: ${collection.name}. Switch collection`);
		}));

		const actions = DOM.append(header, $('.cg-header-actions'));
		const newButton = this._register(new Button(actions, { ...defaultButtonStyles, secondary: true, title: `New Session (${mod}N)` }));
		newButton.element.classList.add('cg-new-button');
		DOM.append(newButton.element, $('span', undefined, 'New'));
		DOM.append(newButton.element, $('span.cg-kb', undefined, `${mod}N`));
		this._register(newButton.onDidClick(() => this.chat.startNewSession()));

		const toolbar = this._register(new ActionBar(DOM.append(actions, $('.cg-header-toolbar'))));
		const newGroup = this._register(new Action('cg.newGroup', 'New Group', ThemeIcon.asClassName(Codicon.newFolder), true, async () => {
			const groupId = this.model.createGroup(this.activeCollectionId.get());
			this.list.editGroupAfterRender(groupId);
		}));
		const viewOptions = this._register(new Action('cg.viewOptions', 'View Options', ThemeIcon.asClassName(Codicon.settings), true, async () => {
			const anchor = toolbar.getContainer().querySelectorAll<HTMLElement>('.action-item')[1] ?? toolbar.getContainer();
			this.contextMenuService.showContextMenu({ getAnchor: () => anchor, getActions: () => this.viewOptionsActions() });
		}));
		const search = this._register(new Action('cg.search', 'Search Sessions', ThemeIcon.asClassName(Codicon.search), true, async () => this.list.openFind()));
		toolbar.push([newGroup, viewOptions, search], { icon: true, label: false });
		return title;
	}

	private viewOptionsActions(): IAction[] {
		const radio = <T>(id: string, label: string, value: T, current: T, set: (value: T) => void) => {
			const action = new Action(id, label, undefined, true, async () => set(value));
			action.checked = value === current;
			return action;
		};
		const style = this.style.get();
		const density = this.density.get();
		return [
			new SubmenuAction('cg.groupStyle', 'Group Color Style', [
				radio('cg.style.rail', 'Rail', MockGroupStyle.Rail, style, v => this.style.set(v, undefined)),
				radio('cg.style.outline', 'Outline', MockGroupStyle.Outline, style, v => this.style.set(v, undefined)),
				radio('cg.style.tint', 'Tint', MockGroupStyle.Tint, style, v => this.style.set(v, undefined)),
				radio('cg.style.dot', 'Dot', MockGroupStyle.Dot, style, v => this.style.set(v, undefined)),
			]),
			radio('cg.density.compact', 'Compact', MockDensity.Compact, density, v => this.density.set(density === MockDensity.Compact ? MockDensity.Comfortable : v, undefined)),
			new Separator(),
			new Action('cg.collapseAll', 'Collapse All Groups', undefined, true, async () => this.setAllCollapsed(true)),
			new Action('cg.expandAll', 'Expand All Groups', undefined, true, async () => this.setAllCollapsed(false)),
		];
	}

	private setAllCollapsed(collapsed: boolean): void {
		const collectionId = this.activeCollectionId.get();
		this.model.update(collapsed ? 'Collapsed all' : 'Expanded all', draft => {
			for (const group of draft.groups) {
				if (group.collectionId === collectionId) {
					group.collapsed = collapsed;
				}
			}
		});
	}

	private showCollectionMenu(anchor: HTMLElement): void {
		const active = this.activeCollectionId.get();
		const collections = this.model.current.collections;
		const actions: IAction[] = collections.map(collection => {
			const action = new Action(`cg.switch.${collection.id}`, collection.name, undefined, true, async () => this.switchTo(collection.id));
			action.checked = collection.id === active;
			return action;
		});
		actions.push(new Separator());
		actions.push(new Action('cg.newCollection', 'New Collection…', undefined, true, async () => this.newCollection(() => anchor)));
		actions.push(new Action('cg.editCollection', 'Edit Collection…', undefined, true, async () => this.editCollection(active, false, () => anchor)));
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			getKeyBinding: action => {
				const index = collections.findIndex(c => action.id === `cg.switch.${c.id}`);
				return index >= 0 && index < 9 ? createUSLayoutResolvedKeybinding(KeyMod.WinCtrl | (KeyCode.Digit1 + index), OS) : undefined;
			},
		});
	}

	private renderToast(toast: HTMLElement): void {
		const message = DOM.append(toast, $('span.cg-toast-message'));
		const undo = this._register(new Button(toast, { ...defaultButtonStyles, secondary: true, title: `Undo (${mod}Z)` }));
		undo.label = 'Undo';
		undo.element.classList.add('cg-toast-undo');
		const close = DOM.append(toast, $(`button.cg-toast-close${ThemeIcon.asCSSSelector(Codicon.close)}`, { type: 'button', 'aria-label': 'Dismiss' }));
		this._register(undo.onDidClick(() => this.undo()));
		this._register(DOM.addDisposableListener(close, DOM.EventType.CLICK, () => this.model.dismissLastChange()));
		this._register(autorun(reader => {
			const change = this.model.lastChange.read(reader);
			toast.classList.toggle('visible', !!change);
			if (change) {
				message.textContent = change.label;
				this.toastTimer.value = disposableTimeout(() => this.model.dismissLastChange(), 6000);
			}
		}));
	}

	private showToast(text: string): void {
		this.model.dismissLastChange();
		const toast = this.sidebar.querySelector<HTMLElement>('.cg-toast');
		const message = toast?.querySelector<HTMLElement>('.cg-toast-message');
		if (toast && message) {
			message.textContent = text;
			toast.classList.add('visible');
			this.toastTimer.value = disposableTimeout(() => toast.classList.remove('visible'), 5000);
		}
	}

	//#endregion

	//#region Mockup controls

	private renderControls(panel: HTMLElement, themeSwitch: IColorGroupsMockupOptions['themeSwitch']): void {
		DOM.append(panel, $('.cg-controls-eyebrow', undefined, 'Mockup controls'));
		DOM.append(panel, $('.cg-controls-title', undefined, 'Colored groups & collections'));
		DOM.append(panel, $('.cg-controls-description', undefined, 'Not product UI. Switch between the explored treatments; everything in the window is interactive.'));

		const addRadio = <T extends string>(label: string, items: readonly { readonly text: string; readonly value: T; readonly tooltip: string }[], value: IObservable<T>, set: (value: T) => void) => {
			const field = DOM.append(panel, $('.cg-controls-field'));
			DOM.append(field, $('.cg-controls-label', undefined, label));
			const radio = this._register(new Radio({ items: items.map(item => ({ text: item.text, tooltip: item.tooltip })), className: 'segmented', ariaLabel: label }));
			field.appendChild(radio.domNode);
			this._register(radio.onDidSelect(index => set(items[index].value)));
			this._register(autorun(reader => radio.setActiveItem(items.findIndex(item => item.value === value.read(reader)))));
		};

		if (themeSwitch) {
			addRadio('Theme', [
				{ text: 'Dark', value: MockThemeKind.Dark, tooltip: 'Dark 2026 theme' },
				{ text: 'Light', value: MockThemeKind.Light, tooltip: 'Light 2026 theme' },
			], constObservable(themeSwitch.current), theme => {
				if (theme !== themeSwitch.current) {
					themeSwitch.switchTo(theme, this.snapshot());
				}
			});
		}
		addRadio('Group style', [
			{ text: 'Rail', value: MockGroupStyle.Rail, tooltip: 'Browser-style pill with a colored rail' },
			{ text: 'Outline', value: MockGroupStyle.Outline, tooltip: 'Solid header, colored outline around the sessions' },
			{ text: 'Tint', value: MockGroupStyle.Tint, tooltip: 'Pill inside a softly tinted card' },
			{ text: 'Dot', value: MockGroupStyle.Dot, tooltip: 'Quiet: colored dot and thin rail' },
		], this.style, v => this.style.set(v, undefined));
		addRadio('Density', [
			{ text: 'Comfortable', value: MockDensity.Comfortable, tooltip: 'Two-line session rows' },
			{ text: 'Compact', value: MockDensity.Compact, tooltip: 'Single-line session rows' },
		], this.density, v => this.density.set(v, undefined));
		addRadio('Collection switcher', [
			{ text: 'Title bar', value: MockSwitcherStyle.TitleBar, tooltip: 'Browser-style icon strip beside the window controls' },
			{ text: 'Tabs', value: MockSwitcherStyle.Tabs, tooltip: 'Labeled tabs at the top of the sidebar' },
			{ text: 'Menu', value: MockSwitcherStyle.Menu, tooltip: 'Only the Sessions header menu' },
		], this.switcher, v => this.switcher.set(v, undefined));

		const tips = DOM.append(panel, $('.cg-controls-tips'));
		DOM.append(tips, $('.cg-controls-label', undefined, 'Try'));
		const tipList = DOM.append(tips, $('ul'));
		const tip = (keys: string, text: string) => {
			const item = DOM.append(tipList, $('li'));
			DOM.append(item, $('kbd', undefined, keys));
			DOM.append(item, $('span', undefined, text));
		};
		tip('New', 'Start a session: pick a workspace and group, type, then Enter');
		tip('✎', 'Pencil on a group header: rename, recolor, custom color, text contrast');
		tip('Drag', 'Sessions onto a group header, or onto a collection icon to move them');
		tip('Drag', 'Group headers to reorder them');
		tip('Right-click', 'Sessions, groups, workspaces, and collection icons');
		tip(`${ctrl}1–3`, 'Switch collections (each remembers its open session)');
		tip('F2 / Enter', 'Edit or collapse the focused header');
		tip(`${mod}Z`, 'Undo the last change');

		const buttons = DOM.append(panel, $('.cg-controls-buttons'));
		const undo = this._register(new Button(buttons, { ...defaultButtonStyles, secondary: true }));
		undo.label = 'Undo';
		this._register(undo.onDidClick(() => this.undo()));
		const reset = this._register(new Button(buttons, { ...defaultButtonStyles, secondary: true }));
		reset.label = 'Reset demo';
		this._register(reset.onDidClick(() => {
			this.headerEditor.hide();
			this.collectionEditor.hide();
			this.model.reset();
			this._activeCollectionId.set(this.model.current.collections[0].id, undefined);
			this.selectedSessionId.set(undefined, undefined);
		}));
	}

	//#endregion
}

//#endregion
