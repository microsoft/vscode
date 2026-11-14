/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { Grid, Direction, ISerializableView, ISerializedGrid, ISerializedNode, Orientation, SerializableGrid } from '../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Layout } from '../../browser/layout.js';
import { Part, updateSashEndpoints } from '../../browser/part.js';
import { PanelAlignment, Parts, Position } from '../../services/layout/browser/layoutService.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../common/views.js';

suite('Workbench layout sash endpoints', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLayout() {
		const parts = new Map<Parts, Part>();
		const view = (id: Parts) => {
			const part = new class extends mock<Part>() {
				override readonly element = $(`.part.${id.split('.').pop()}`);
				override readonly minimumWidth = 0;
				override readonly maximumWidth = Number.POSITIVE_INFINITY;
				override readonly minimumHeight = 0;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override get onDidChange() { return Event.None; }
				override layout() { }
				override getContainer() { return this.element; }
				override updateStyles() { }
				override toJSON() { return { type: id }; }
			}();
			parts.set(id, part);
			return part;
		};
		const titleBarPartView = view(Parts.TITLEBAR_PART);
		const bannerPartView = view(Parts.BANNER_PART);
		const activityBarPartView = view(Parts.ACTIVITYBAR_PART);
		const sideBarPartView = view(Parts.SIDEBAR_PART);
		const editorPartView = view(Parts.EDITOR_PART);
		const panelPartView = view(Parts.PANEL_PART);
		const auxiliaryBarPartView = view(Parts.AUXILIARYBAR_PART);
		const statusBarPartView = view(Parts.STATUSBAR_PART);
		const chatPartView = view(Parts.CHAT_PART);
		const layout = store.add(new class extends Layout {
			compact = false;
			override isFloatingPanelsEnabled() { return true; }
			override isModernUICompact() { return this.compact; }
			override isPanelMaximized() { return false; }
			override setAuxiliaryBarMaximized() { return false; }
			override isVisible() { return true; }
			override hasFocus() { return false; }
			protected override getPart(id: Parts) { return parts.get(id)!; }
		}(mainWindow.document.body));
		const root = append(mainWindow.document.body, layout.mainContainer);
		store.add(toDisposable(() => root.remove()));
		root.className = 'monaco-workbench floating-panels panel-position-bottom panel-alignment-center';
		root.style.cssText = 'position: relative; width: 800px; height: 600px; --vscode-panels-spacing: 16px; --vscode-sash-size: 4px; --vscode-sash-hover-size: 4px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px;';
		const grid = store.add(new Grid(titleBarPartView));
		grid.orientation = Orientation.VERTICAL;
		append(root, grid.element);
		grid.layout(800, 600);
		grid.addView(bannerPartView, 24, titleBarPartView, Direction.Down);
		grid.addView(editorPartView, 500, bannerPartView, Direction.Down);
		grid.addView(statusBarPartView, 24, editorPartView, Direction.Down);
		grid.addView(activityBarPartView, 40, editorPartView, Direction.Left);
		grid.addView(sideBarPartView, 160, editorPartView, Direction.Left);
		grid.addView(auxiliaryBarPartView, 160, editorPartView, Direction.Right);
		grid.addView(panelPartView, 200, editorPartView, Direction.Down);
		// Beside the editor, above the panel: its sash meets the panel's
		grid.addView(chatPartView, 120, editorPartView, Direction.Left);
		const values = new Map<string, number | string>();
		Object.assign(layout, {
			workbenchGrid: grid, titleBarPartView, bannerPartView, activityBarPartView, sideBarPartView,
			editorPartView, panelPartView, auxiliaryBarPartView, statusBarPartView, chatPartView, chatPartHidden: false,
			stateModel: {
				getRuntimeValue: (key: { name: string; defaultValue: number | string }) => values.get(key.name) ?? key.defaultValue,
				setRuntimeValue: (key: { name: string }, value: number | string) => values.set(key.name, value),
			},
		});
		const endpoints = () => Array.from(grid.element.querySelectorAll<HTMLElement>('.monaco-sash')).map(sash => {
			const bounds = sash.getBoundingClientRect();
			return {
				start: sash.classList.contains('workbench-sash-start-at-gap'),
				end: sash.classList.contains('workbench-sash-end-at-gap'),
				startOffset: sash.style.getPropertyValue('--workbench-sash-start'),
				endOffset: sash.style.getPropertyValue('--workbench-sash-end'),
				bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom],
			};
		});
		updateSashEndpoints(grid.element, true);
		assert.ok(endpoints().some(sash => sash.start || sash.end));
		return { layout, root, grid, endpoints };
	}

	for (const compact of [false, true]) {
		test(`refreshes sash endpoints immediately after panel alignment changes, compact=${compact}`, () => {
			const { layout, root, grid, endpoints } = createLayout();
			layout.compact = compact;
			root.classList.toggle('modern-ui-compact', compact);
			for (const alignment of ['justify', 'right', 'center'] satisfies PanelAlignment[]) {
				layout.setPanelAlignment(alignment);
				const actual = endpoints();
				updateSashEndpoints(grid.element, !compact);
				assert.deepStrictEqual(actual, endpoints(), alignment);
			}
		});

		test(`refreshes sash endpoints immediately after the chat part hides or shows, compact=${compact}`, () => {
			const { layout, root, grid, endpoints } = createLayout();
			layout.compact = compact;
			root.classList.toggle('modern-ui-compact', compact);
			for (const hidden of [true, false]) {
				layout.setPartHidden(hidden, Parts.CHAT_PART);
				const actual = endpoints();
				updateSashEndpoints(grid.element, !compact);
				assert.deepStrictEqual(actual, endpoints(), `hidden=${hidden}`);
			}
		});

		test(`refreshes sash endpoints immediately after panel position changes, compact=${compact}`, () => {
			const { layout, root, grid, endpoints } = createLayout();
			layout.compact = compact;
			root.classList.toggle('modern-ui-compact', compact);
			for (const position of [Position.RIGHT, Position.TOP, Position.BOTTOM]) {
				layout.setPanelPosition(position);
				const actual = endpoints();
				updateSashEndpoints(grid.element, !compact);
				assert.deepStrictEqual(actual, endpoints(), `${position}`);
			}
		});
	}
});

suite('Workbench layout chat part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ILayoutConfiguration {
		readonly sideBar: Position;
		readonly panel: Position;
		readonly alignment: PanelAlignment;
		/** The chat part, with the layout it was left in; none without a chat part. */
		readonly chat?: { readonly visible: boolean; readonly size: number } | 'noLayout';
		/** The location of the view the chat part docks beside; `null` for a view that is not known; no anchor without. */
		readonly anchor?: ViewContainerLocation | null;
		/** Whether that view is registered, as it is by default; one that is not keeps a location saved for it. */
		readonly anchorRegistered?: boolean;
		/** The width of the window and of its bars, 1600, 250 and 260 by default. */
		readonly widths?: { readonly window?: number; readonly sideBar?: number; readonly auxiliaryBar?: number };
	}

	/** The state a window left, to start another window from, as after a reload. */
	interface ISavedLayout {
		readonly runtime: ReadonlyMap<string, unknown>;
		readonly stored: string | undefined;
	}

	function createLayout(configuration: ILayoutConfiguration, saved?: ISavedLayout) {
		const views = new Map<Parts, Part>();
		const view = (id: Parts, minimumWidth = 0, minimumHeight = 0) => {
			const element = $(`.part.${id.split('.').pop()}`);
			const part = new class extends mock<Part>() {
				override readonly element = element;
				override readonly minimumWidth = minimumWidth;
				override readonly maximumWidth = Number.POSITIVE_INFINITY;
				override readonly minimumHeight = minimumHeight;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override get onDidChange() { return Event.None; }
				override layout() { }
				override setVisible() { }
				override getContainer() { return element; }
				override updateStyles() { }
				override toJSON() { return { type: id }; }
			}();
			views.set(id, part);
			return part;
		};
		const parts = {
			titleBarPartView: view(Parts.TITLEBAR_PART, 0, 30),
			bannerPartView: view(Parts.BANNER_PART),
			activityBarPartView: view(Parts.ACTIVITYBAR_PART, 48),
			sideBarPartView: view(Parts.SIDEBAR_PART, 170),
			editorPartView: view(Parts.EDITOR_PART, 220),
			panelPartView: view(Parts.PANEL_PART, 300, 77),
			auxiliaryBarPartView: view(Parts.AUXILIARYBAR_PART, 170),
			statusBarPartView: view(Parts.STATUSBAR_PART, 0, 22),
			chatPartView: configuration.chat ? view(Parts.CHAT_PART, 280) : undefined,
		};
		const runtime = saved ? new Map(saved.runtime) : new Map<string, unknown>([
			['sideBar.position', configuration.sideBar],
			['panel.position', configuration.panel],
			['panel.alignment', configuration.alignment],
			['panel.hidden', false],
			['auxiliaryBar.hidden', false],
		]);
		const initialization = new Map<string, unknown>([['sideBar.size', configuration.widths?.sideBar ?? 250], ['auxiliaryBar.size', configuration.widths?.auxiliaryBar ?? 260], ['panel.size', 200]]);
		const anchor = { location: configuration.anchor ?? null, registered: configuration.anchorRegistered ?? true };
		const viewEvents = { location: store.add(new Emitter<void>()), container: store.add(new Emitter<void>()), containerLocation: store.add(new Emitter<void>()), containers: store.add(new Emitter<void>()) };
		let stored = saved ? saved.stored : configuration.chat && configuration.chat !== 'noLayout' ? JSON.stringify({ version: 1, ...configuration.chat }) : undefined;
		const focus = { chat: false, focused: [] as string[] };
		const layout = store.add(new class extends Layout {
			override isVisible(part: Parts, targetWindow?: Window): boolean {
				return part === Parts.TITLEBAR_PART || super.isVisible(part, targetWindow);
			}
			override hasFocus(part: Parts) { return part === Parts.CHAT_PART && focus.chat; }
			override focusPart(part: Parts) { focus.focused.push(part.split('.').pop()!); }
			override isFloatingPanelsEnabled() { return false; }
			protected override getPart(id: Parts) { return views.get(id)!; }
		}(mainWindow.document.body));
		Object.assign(layout, {
			...parts,
			_mainContainerDimension: { width: configuration.widths?.window ?? 1600, height: 900 },
			telemetryService: NullTelemetryService,
			// No view containers: the side bar and the panel show and hide empty
			paneCompositeService: { getActivePaneComposite: () => undefined, getLastActivePaneCompositeId: () => undefined },
			viewDescriptorService: {
				getViewContainersByLocation: () => [],
				getViewDescriptorById: () => anchor.registered ? {} : null,
				getViewLocationById: () => anchor.location,
				onDidChangeLocation: viewEvents.location.event,
				onDidChangeContainer: viewEvents.container.event,
				onDidChangeContainerLocation: viewEvents.containerLocation.event,
				onDidChangeViewContainers: viewEvents.containers.event,
			},
			configurationService: { getValue: () => undefined },
			storageService: { get: () => stored, store: (_key: string, value: string) => stored = value },
			stateModel: {
				getRuntimeValue: (key: { name: string; defaultValue: unknown }) => runtime.has(key.name) ? runtime.get(key.name) : key.defaultValue,
				setRuntimeValue: (key: { name: string }, value: unknown) => runtime.set(key.name, value),
				getInitializationValue: (key: { name: string; defaultValue: unknown }) => initialization.get(key.name) ?? key.defaultValue,
			},
		});
		if (configuration.anchor !== undefined) {
			layout.setChatPartAnchor({ viewId: 'sessions' });
		}
		const descriptor = (Reflect.get(layout, 'createGridDescriptor') as () => ISerializedGrid).call(layout);
		const save = (): ISavedLayout => {
			(Reflect.get(layout, 'saveChatPartLayout') as () => void).call(layout);
			return { runtime, stored };
		};
		return { layout, views, descriptor, save, anchor, focus, viewEvents };
	}

	/** The parts of `node`, nested as the grid nests them, marking hidden parts. */
	function shape(node: ISerializedNode): unknown {
		if (node.type === 'leaf') {
			const name = (node.data as { type: string }).type.split('.').pop();
			return node.visible === false ? `(${name})` : name;
		}
		return (node.data as ISerializedNode[]).map(shape);
	}

	/** `node` without the chat part, with its width back to the editor, as the layout without a chat part describes it. */
	function withoutChat(node: ISerializedNode): ISerializedNode {
		if (node.type === 'leaf') {
			return node;
		}
		const children = node.data as ISerializedNode[];
		const chat = children.find(child => child.type === 'leaf' && (child.data as { type: string }).type === Parts.CHAT_PART);
		const rest = children.filter(child => child !== chat).map(withoutChat);
		const editor = rest.find(child => child.type === 'leaf' && (child.data as { type: string }).type === Parts.EDITOR_PART);
		if (chat && editor && chat.visible !== false) {
			editor.size += chat.size;
		}
		// A branch of the chat part and the editor alone is the editor alone, at the branch's size
		return rest.length === 1 && chat ? { ...rest[0], size: node.size } : { ...node, data: rest };
	}

	const configurations: ILayoutConfiguration[] = [];
	for (const sideBar of [Position.LEFT, Position.RIGHT]) {
		for (const panel of [Position.BOTTOM, Position.TOP, Position.LEFT, Position.RIGHT]) {
			for (const alignment of ['center', 'justify', 'left', 'right'] satisfies PanelAlignment[]) {
				configurations.push({ sideBar, panel, alignment });
			}
		}
	}

	test('the chat part sits immediately beside the editor on the primary side bar\'s side, and changes nothing else of the grid', () => {
		const changed: string[] = [];
		for (const configuration of configurations) {
			const { descriptor: withoutChatPart } = createLayout(configuration);
			for (const chat of [{ visible: true, size: 400 }, { visible: false, size: 400 }]) {
				const { descriptor } = createLayout({ ...configuration, chat });
				const label = `${configuration.sideBar}/${configuration.panel}/${configuration.alignment}/${chat.visible}`;
				if (JSON.stringify({ ...descriptor, root: withoutChat(descriptor.root) }) !== JSON.stringify(withoutChatPart)) {
					changed.push(label);
				}
			}
		}
		assert.deepStrictEqual(changed, []);
	});

	test('places the chat part between the editor and the parts on the side bar\'s side', () => {
		const middle = (configuration: ILayoutConfiguration) => shape((createLayout(configuration).descriptor.root.data as ISerializedNode[])[2]);
		assert.deepStrictEqual({
			bottomPanel: middle({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } }),
			bottomPanelJustified: middle({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'justify', chat: { visible: true, size: 400 } }),
			bottomPanelSideBarRight: middle({ sideBar: Position.RIGHT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } }),
			leftPanel: middle({ sideBar: Position.LEFT, panel: Position.LEFT, alignment: 'center', chat: { visible: true, size: 400 } }),
			rightPanelSideBarRight: middle({ sideBar: Position.RIGHT, panel: Position.RIGHT, alignment: 'center', chat: { visible: false, size: 400 } }),
		}, {
			bottomPanel: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
			bottomPanelJustified: ['activitybar', [['sidebar', 'chat', 'editor', 'auxiliarybar'], 'panel']],
			bottomPanelSideBarRight: ['auxiliarybar', [['editor', 'chat'], 'panel'], 'sidebar', 'activitybar'],
			leftPanel: ['activitybar', 'sidebar', 'panel', 'chat', 'editor', 'auxiliarybar'],
			rightPanelSideBarRight: ['auxiliarybar', 'editor', '(chat)', 'panel', 'sidebar', 'activitybar'],
		});
	});

	test('a chat part without a layout of its own, or with one of another version, starts hidden at a default width', () => {
		const { descriptor } = createLayout({ sideBar: Position.LEFT, panel: Position.LEFT, alignment: 'center', chat: 'noLayout' });
		const chat = (descriptor.root.data as ISerializedNode[])[2].data as ISerializedNode[];
		assert.deepStrictEqual(chat.map(node => ({ part: shape(node), size: node.size })).filter(node => node.part === '(chat)'), [{ part: '(chat)', size: 480 }]);
	});

	function createGridLayout(configuration: ILayoutConfiguration, saved?: ISavedLayout) {
		const { layout, views, descriptor, save, anchor, focus, viewEvents } = createLayout(configuration, saved);
		const grid = store.add(SerializableGrid.deserialize(descriptor, { fromJSON: ({ type }: { type: Parts }) => views.get(type)! }, { proportionalLayout: false }));
		append(layout.mainContainer, grid.element);
		grid.layout(configuration.widths?.window ?? 1600, 900);
		Object.assign(layout, { workbenchGrid: grid });
		const middle = () => shape((grid.serialize().root.data as ISerializedNode[])[2]);
		return { layout, grid, middle, save, anchor, views, focus, viewEvents };
	}

	test('the visible neighbors of the parts beside a chat part are the chat part, as long as it shows', () => {
		const neighbors = (chat: ILayoutConfiguration['chat']) => {
			const { layout } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat });
			const neighbor = (part: Parts, direction: Direction) => layout.getVisibleNeighborPart(part, direction)?.split('.').pop();
			return {
				sideBarRight: neighbor(Parts.SIDEBAR_PART, Direction.Right),
				editorLeft: neighbor(Parts.EDITOR_PART, Direction.Left),
				chatLeft: chat ? neighbor(Parts.CHAT_PART, Direction.Left) : undefined,
				chatRight: chat ? neighbor(Parts.CHAT_PART, Direction.Right) : undefined,
			};
		};
		assert.deepStrictEqual({ shown: neighbors({ visible: true, size: 400 }), hidden: neighbors({ visible: false, size: 400 }), absent: neighbors(undefined) }, {
			shown: { sideBarRight: 'chat', editorLeft: 'chat', chatLeft: 'sidebar', chatRight: 'editor' },
			hidden: { sideBarRight: 'editor', editorLeft: 'sidebar', chatLeft: undefined, chatRight: undefined },
			absent: { sideBarRight: 'editor', editorLeft: 'sidebar', chatLeft: undefined, chatRight: undefined },
		});
	});

	test('the grid without a chat part is as before it existed', () => {
		const { layout, descriptor } = createLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center' });
		const bannerFirst = (Reflect.get(layout, 'shouldShowBannerFirst') as () => boolean).call(layout);
		assert.deepStrictEqual(shape(descriptor.root), [
			...(bannerFirst ? ['(banner)', 'titlebar'] : ['titlebar', '(banner)']),
			['activitybar', 'sidebar', ['editor', 'panel'], 'auxiliarybar'],
			'statusbar',
		]);
	});

	test('keeps the chat part beside the editor as the side bar and the panel move', () => {
		const { layout, middle } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } });
		const setSideBarPosition = (position: Position) => (Reflect.get(layout, 'setSideBarPosition') as (position: Position) => void).call(layout, position);
		const steps: Record<string, unknown> = {};
		setSideBarPosition(Position.RIGHT);
		steps.sideBarRight = middle();
		layout.setPanelPosition(Position.RIGHT);
		steps.panelRight = middle();
		setSideBarPosition(Position.LEFT);
		steps.sideBarLeft = middle();
		layout.setPanelPosition(Position.LEFT);
		steps.panelLeft = middle();
		layout.setPanelPosition(Position.TOP);
		steps.panelTop = middle();
		layout.setPanelAlignment('justify');
		steps.justified = middle();
		assert.deepStrictEqual(steps, {
			sideBarRight: ['auxiliarybar', [['editor', 'chat'], 'panel'], 'sidebar', 'activitybar'],
			panelRight: ['auxiliarybar', 'editor', 'chat', 'panel', 'sidebar', 'activitybar'],
			sideBarLeft: ['activitybar', 'sidebar', 'chat', 'editor', 'panel', 'auxiliarybar'],
			panelLeft: ['activitybar', 'sidebar', 'panel', 'chat', 'editor', 'auxiliarybar'],
			panelTop: ['activitybar', 'sidebar', ['panel', ['chat', 'editor']], 'auxiliarybar'],
			justified: ['activitybar', ['panel', ['sidebar', 'chat', 'editor', 'auxiliarybar']]],
		});
	});

	test('hides the chat part with the editor for a maximized panel and shows it again with the editor, as showing the chat part does', () => {
		const { layout } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } });
		const visible = () => ({ chat: layout.isVisible(Parts.CHAT_PART), editor: layout.isVisible(Parts.EDITOR_PART, mainWindow), panel: layout.isVisible(Parts.PANEL_PART) });
		const steps: Record<string, unknown> = {};
		layout.toggleMaximizedPanel();
		steps.maximized = visible();
		layout.toggleMaximizedPanel();
		steps.restored = visible();
		layout.setPartHidden(true, Parts.CHAT_PART);
		steps.closed = visible();
		layout.toggleMaximizedPanel();
		layout.toggleMaximizedPanel();
		steps.closedAfterMaximize = visible();
		layout.toggleMaximizedPanel();
		layout.setPartHidden(false, Parts.CHAT_PART);
		steps.shownWhileMaximized = visible();
		assert.deepStrictEqual(steps, {
			maximized: { chat: false, editor: false, panel: true },
			restored: { chat: true, editor: true, panel: true },
			closed: { chat: false, editor: true, panel: true },
			closedAfterMaximize: { chat: false, editor: true, panel: true },
			shownWhileMaximized: { chat: true, editor: true, panel: true },
		});
	});

	test('a chat part hidden for a maximized panel or secondary side bar stays hidden after a reload, and shows again when that is restored', () => {
		const configuration: ILayoutConfiguration = { sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } };
		const reload = (toggleMaximized: (layout: Layout) => void) => {
			const before = createGridLayout(configuration);
			toggleMaximized(before.layout);
			const { layout } = createGridLayout(configuration, before.save());
			const reloaded = layout.isVisible(Parts.CHAT_PART);
			toggleMaximized(layout);
			return { reloaded, restored: layout.isVisible(Parts.CHAT_PART) };
		};
		assert.deepStrictEqual({
			panel: reload(layout => layout.toggleMaximizedPanel()),
			auxiliaryBar: reload(layout => layout.toggleMaximizedAuxiliaryBar()),
		}, {
			panel: { reloaded: false, restored: true },
			auxiliaryBar: { reloaded: false, restored: true },
		});
	});

	test('a chat part hidden for a maximized panel shows after a reload when the panel no longer opens maximized there, as for a justified bottom panel', () => {
		const configuration: ILayoutConfiguration = { sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } };
		const before = createGridLayout(configuration);
		before.layout.toggleMaximizedPanel();
		const saved = before.save();
		// The panel alignment is kept per profile: another workspace justified it meanwhile
		const runtime = new Map(saved.runtime).set('panel.alignment', 'justify');
		const { layout } = createGridLayout(configuration, { ...saved, runtime });
		assert.deepStrictEqual({ panelMaximized: layout.isPanelMaximized(), chat: layout.isVisible(Parts.CHAT_PART) }, { panelMaximized: false, chat: true });
	});

	test('docks the chat part beside the editor on the side of its anchor view\'s container', () => {
		const middle = (configuration: Omit<ILayoutConfiguration, 'chat' | 'alignment'>) => shape((createLayout({ alignment: 'center', chat: { visible: true, size: 400 }, ...configuration }).descriptor.root.data as ISerializedNode[])[2]);
		assert.deepStrictEqual({
			sideBar: middle({ sideBar: Position.LEFT, panel: Position.BOTTOM, anchor: ViewContainerLocation.Sidebar }),
			sideBarRight: middle({ sideBar: Position.RIGHT, panel: Position.BOTTOM, anchor: ViewContainerLocation.Sidebar }),
			auxiliaryBar: middle({ sideBar: Position.LEFT, panel: Position.BOTTOM, anchor: ViewContainerLocation.AuxiliaryBar }),
			auxiliaryBarSideBarRight: middle({ sideBar: Position.RIGHT, panel: Position.BOTTOM, anchor: ViewContainerLocation.AuxiliaryBar }),
			auxiliaryBarWithPanelOnItsSide: middle({ sideBar: Position.LEFT, panel: Position.RIGHT, anchor: ViewContainerLocation.AuxiliaryBar }),
			rightPanel: middle({ sideBar: Position.LEFT, panel: Position.RIGHT, anchor: ViewContainerLocation.Panel }),
			bottomPanel: middle({ sideBar: Position.RIGHT, panel: Position.BOTTOM, anchor: ViewContainerLocation.Panel }),
			unknownView: middle({ sideBar: Position.LEFT, panel: Position.BOTTOM, anchor: null }),
			unregisteredViewWithSavedMove: middle({ sideBar: Position.LEFT, panel: Position.BOTTOM, anchor: ViewContainerLocation.AuxiliaryBar, anchorRegistered: false }),
		}, {
			sideBar: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
			sideBarRight: ['auxiliarybar', [['editor', 'chat'], 'panel'], 'sidebar', 'activitybar'],
			auxiliaryBar: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'],
			auxiliaryBarSideBarRight: ['auxiliarybar', [['chat', 'editor'], 'panel'], 'sidebar', 'activitybar'],
			auxiliaryBarWithPanelOnItsSide: ['activitybar', 'sidebar', 'editor', 'chat', 'panel', 'auxiliarybar'],
			rightPanel: ['activitybar', 'sidebar', 'editor', 'chat', 'panel', 'auxiliarybar'],
			bottomPanel: ['auxiliarybar', [['editor', 'chat'], 'panel'], 'sidebar', 'activitybar'],
			unknownView: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
			unregisteredViewWithSavedMove: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
		});
	});

	test('the chat part follows its anchor view as the view moves, the side bar flips and the panel moves', () => {
		const { layout, middle, anchor } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.AuxiliaryBar });
		const setSideBarPosition = (position: Position) => (Reflect.get(layout, 'setSideBarPosition') as (position: Position) => void).call(layout, position);
		// As the view descriptor service tells the layout that a view or a view container moved
		const moveAnchor = (location: ViewContainerLocation) => { anchor.location = location; (Reflect.get(layout, 'updateChatPartPosition') as () => void).call(layout); };
		const step = () => ({ grid: middle(), position: layout.getChatPartPosition() });
		const steps: Record<string, unknown> = {};
		steps.auxiliaryBar = step();
		setSideBarPosition(Position.RIGHT);
		steps.sideBarRight = step();
		moveAnchor(ViewContainerLocation.Sidebar);
		steps.movedToSideBar = step();
		moveAnchor(ViewContainerLocation.Panel);
		layout.setPanelPosition(Position.LEFT);
		steps.movedToLeftPanel = step();
		layout.setPanelPosition(Position.RIGHT);
		steps.panelRight = step();
		layout.setPanelPosition(Position.BOTTOM);
		steps.panelBottom = step();
		layout.setPartHidden(true, Parts.CHAT_PART);
		moveAnchor(ViewContainerLocation.AuxiliaryBar);
		steps.movedWhileHidden = step();
		layout.setPartHidden(false, Parts.CHAT_PART);
		steps.shownAgain = step();
		assert.deepStrictEqual(steps, {
			auxiliaryBar: { grid: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'], position: Position.RIGHT },
			sideBarRight: { grid: ['auxiliarybar', [['chat', 'editor'], 'panel'], 'sidebar', 'activitybar'], position: Position.LEFT },
			movedToSideBar: { grid: ['auxiliarybar', [['editor', 'chat'], 'panel'], 'sidebar', 'activitybar'], position: Position.RIGHT },
			movedToLeftPanel: { grid: ['auxiliarybar', 'panel', 'chat', 'editor', 'sidebar', 'activitybar'], position: Position.LEFT },
			panelRight: { grid: ['auxiliarybar', 'editor', 'chat', 'panel', 'sidebar', 'activitybar'], position: Position.RIGHT },
			panelBottom: { grid: ['auxiliarybar', [['editor', 'chat'], 'panel'], 'sidebar', 'activitybar'], position: Position.RIGHT },
			movedWhileHidden: { grid: ['auxiliarybar', [['(chat)', 'editor'], 'panel'], 'sidebar', 'activitybar'], position: Position.LEFT },
			shownAgain: { grid: ['auxiliarybar', [['chat', 'editor'], 'panel'], 'sidebar', 'activitybar'], position: Position.LEFT },
		});
	});

	test('the chat part keeps its width as it follows its anchor view, shown or hidden', () => {
		const { layout, grid, anchor } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.AuxiliaryBar });
		const moveAnchor = (location: ViewContainerLocation) => { anchor.location = location; (Reflect.get(layout, 'updateChatPartPosition') as () => void).call(layout); };
		// The width the grid gives the chat part, or would give it once shown
		const chatWidth = (node: ISerializedNode): number | undefined => node.type === 'leaf'
			? (node.data as { type: string }).type === Parts.CHAT_PART ? node.size : undefined
			: (node.data as ISerializedNode[]).reduce<number | undefined>((width, child) => width ?? chatWidth(child), undefined);
		const widths: (number | undefined)[] = [];
		moveAnchor(ViewContainerLocation.Sidebar);
		widths.push(chatWidth(grid.serialize().root));
		moveAnchor(ViewContainerLocation.AuxiliaryBar);
		widths.push(chatWidth(grid.serialize().root));
		layout.setPartHidden(true, Parts.CHAT_PART);
		moveAnchor(ViewContainerLocation.Sidebar);
		layout.setPartHidden(false, Parts.CHAT_PART);
		widths.push(chatWidth(grid.serialize().root));
		assert.deepStrictEqual(widths, [400, 400, 400]);
	});

	test('a chat part docked beside the secondary side bar hides while that is maximized and shows again on its side', () => {
		const { layout, middle } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.AuxiliaryBar });
		const steps: Record<string, unknown> = {};
		layout.toggleMaximizedAuxiliaryBar();
		steps.maximized = layout.isVisible(Parts.CHAT_PART);
		layout.toggleMaximizedAuxiliaryBar();
		steps.restored = middle();
		assert.deepStrictEqual(steps, {
			maximized: false,
			restored: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'],
		});
	});

	test('the chat part keeps the focus as it moves to its anchor view\'s side, and follows the view as it is deregistered', () => {
		const { layout, middle, anchor, focus } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.AuxiliaryBar });
		const moveAnchor = (location: ViewContainerLocation | null) => { anchor.location = location; (Reflect.get(layout, 'updateChatPartPosition') as () => void).call(layout); };
		focus.chat = true;
		moveAnchor(ViewContainerLocation.Sidebar);
		const focused = [...focus.focused];
		focus.chat = false;
		moveAnchor(ViewContainerLocation.AuxiliaryBar);
		// As the view deregisters, it is no view the layout knows
		moveAnchor(null);

		assert.deepStrictEqual({ focused, focusedAfter: focus.focused, deregistered: middle() }, {
			focused: ['chat'],
			focusedAfter: ['chat'],
			deregistered: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
		});
	});

	test('follows its anchor view through the events of the views as they move, deregister and register again', () => {
		const { layout, middle, anchor, viewEvents } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.Sidebar });
		store.add((Reflect.get(layout, 'followChatPartAnchor') as () => { dispose(): void }).call(layout));
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const container = upcastPartial<ViewContainer>({ id: 'test.chatPartAnchor' });
		const view = upcastPartial<IViewDescriptor>({ id: 'sessions', name: { value: 'Sessions', original: 'Sessions' } });
		const steps: Record<string, unknown> = {};

		anchor.location = ViewContainerLocation.AuxiliaryBar;
		viewEvents.location.fire();
		steps.viewMoved = middle();
		anchor.location = ViewContainerLocation.Sidebar;
		viewEvents.containerLocation.fire();
		steps.containerMoved = middle();
		viewsRegistry.registerViews([view], container);
		anchor.location = ViewContainerLocation.AuxiliaryBar;
		viewEvents.container.fire();
		steps.viewContainerChanged = middle();
		anchor.registered = false;
		viewsRegistry.deregisterViews([view], container);
		steps.deregistered = middle();
		anchor.registered = true;
		viewsRegistry.registerViews([view], container);
		steps.registeredAgain = middle();
		viewsRegistry.deregisterViews([view], container);

		assert.deepStrictEqual(steps, {
			viewMoved: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'],
			containerMoved: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
			viewContainerChanged: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'],
			deregistered: ['activitybar', 'sidebar', [['chat', 'editor'], 'panel'], 'auxiliarybar'],
			registeredAgain: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'],
		});
	});

	test('the chat part gives the focus back to what had it inside, such as a button of its toolbar, as it moves to its anchor view\'s side', () => {
		const { layout, middle, anchor, focus, views } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.Sidebar });
		mainWindow.document.body.appendChild(layout.mainContainer);
		store.add(toDisposable(() => layout.mainContainer.remove()));
		const button = append(views.get(Parts.CHAT_PART)!.element, $('button'));
		button.focus();
		focus.chat = true;
		const focusedBefore = mainWindow.document.activeElement === button;
		anchor.location = ViewContainerLocation.AuxiliaryBar;
		(Reflect.get(layout, 'updateChatPartPosition') as () => void).call(layout);

		assert.deepStrictEqual({ focusedBefore, moved: middle(), focusedAfter: mainWindow.document.activeElement === button, defaultFocus: focus.focused }, {
			focusedBefore: true,
			moved: ['activitybar', 'sidebar', [['editor', 'chat'], 'panel'], 'auxiliarybar'],
			focusedAfter: true,
			defaultFocus: [],
		});
	});

	/** The widths across the window, of the parts the editor's row has, and whether those fit the window without overflowing. */
	function widthsAcross(layout: Layout, grid: SerializableGrid<ISerializableView>, views: Map<Parts, Part>, window: number) {
		const width = (part: Parts) => layout.isVisible(part) ? grid.getViewSize(views.get(part)!).width : 0;
		const chat = width(Parts.CHAT_PART);
		const editor = width(Parts.EDITOR_PART);
		const total = width(Parts.ACTIVITYBAR_PART) + width(Parts.SIDEBAR_PART) + editor + chat + width(Parts.AUXILIARYBAR_PART);
		return { fits: total === window, chatAtLeastItsMinimum: chat >= 280, editorAtLeastItsMinimum: editor >= 220 };
	}

	test('the chat part shown beside a wide secondary side bar takes room from it, rather than overflow the editor\'s column', () => {
		const { layout, grid, views } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: false, size: 400 }, anchor: ViewContainerLocation.AuxiliaryBar, widths: { window: 1200, auxiliaryBar: 590 } });
		const auxiliaryBarBefore = grid.getViewSize(views.get(Parts.AUXILIARYBAR_PART)!).width;
		layout.setPartHidden(false, Parts.CHAT_PART);

		assert.deepStrictEqual({ ...widthsAcross(layout, grid, views, 1200), auxiliaryBarShrank: grid.getViewSize(views.get(Parts.AUXILIARYBAR_PART)!).width < auxiliaryBarBefore }, {
			fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true, auxiliaryBarShrank: true,
		});
	});

	test('the chat part shown beside a wide primary side bar takes room from it', () => {
		const { layout, grid, views } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: false, size: 400 }, anchor: ViewContainerLocation.Sidebar, widths: { window: 1200, sideBar: 600 } });
		layout.setPartHidden(false, Parts.CHAT_PART);

		assert.deepStrictEqual(widthsAcross(layout, grid, views, 1200), { fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true });
	});

	test('the chat part that follows its anchor view to a wide secondary side bar takes room from it', () => {
		const { layout, grid, views, anchor } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.Sidebar, widths: { window: 1200, auxiliaryBar: 590 } });
		anchor.location = ViewContainerLocation.AuxiliaryBar;
		(Reflect.get(layout, 'updateChatPartPosition') as () => void).call(layout);

		assert.deepStrictEqual(widthsAcross(layout, grid, views, 1200), { fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true });
	});

	test('the chat part shown at its minimum width beside a wide secondary side bar, whose column is narrower than the editor\'s and its minimum together, takes room from the bar', () => {
		const shown = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: false, size: 280 }, anchor: ViewContainerLocation.AuxiliaryBar, widths: { window: 1200, auxiliaryBar: 590 } });
		shown.layout.setPartHidden(false, Parts.CHAT_PART);
		const moved = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 280 }, anchor: ViewContainerLocation.Sidebar, widths: { window: 1200, auxiliaryBar: 590 } });
		moved.anchor.location = ViewContainerLocation.AuxiliaryBar;
		(Reflect.get(moved.layout, 'updateChatPartPosition') as () => void).call(moved.layout);

		assert.deepStrictEqual({ shown: widthsAcross(shown.layout, shown.grid, shown.views, 1200), moved: widthsAcross(moved.layout, moved.grid, moved.views, 1200) }, {
			shown: { fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true },
			moved: { fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true },
		});
	});
});
