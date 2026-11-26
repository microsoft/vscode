/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, setParentFlowTo } from '../../../base/browser/dom.js';
import { Grid, Direction, ISerializableView, ISerializedGrid, ISerializedNode, Orientation, SerializableGrid } from '../../../base/browser/ui/grid/grid.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Layout } from '../../browser/layout.js';
import { Part, updateSashEndpoints } from '../../browser/part.js';
import { IPartsLayoutState, PanelAlignment, Parts, Position } from '../../services/layout/browser/layoutService.js';
import { NullExtensionService } from '../../services/extensions/common/extensions.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { Extensions as ViewExtensions, IViewDescriptor, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../common/views.js';
import '../../browser/media/floatingPanels.css';
import '../../browser/parts/panel/media/panelpart.css';

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

		test(`refreshes sash endpoints immediately after the chat part fills the editor area and gives it back, compact=${compact}`, () => {
			const { layout, root, grid, endpoints } = createLayout();
			layout.compact = compact;
			root.classList.toggle('modern-ui-compact', compact);
			const steps: { hidden: boolean; meetAtGap: boolean; immediate: ReturnType<typeof endpoints>; refreshed: ReturnType<typeof endpoints> }[] = [];
			for (const hidden of [true, false]) {
				layout.setEditorHiddenByChat(hidden);
				const immediate = endpoints();
				updateSashEndpoints(grid.element, !compact);
				steps.push({ hidden, meetAtGap: immediate.some(sash => sash.start || sash.end), immediate, refreshed: endpoints() });
			}
			assert.deepStrictEqual(steps.map(({ hidden, meetAtGap, immediate, refreshed }) => ({ hidden, meetAtGap, upToDate: JSON.stringify(immediate) === JSON.stringify(refreshed) })), [
				{ hidden: true, meetAtGap: !compact, upToDate: true },
				{ hidden: false, meetAtGap: !compact, upToDate: true },
			]);
		});

		test(`sashes meet at the panel gap below the chat part filling the editor area, not beside a maximized panel, compact=${compact}`, () => {
			const { root, grid, endpoints } = createLayout();
			root.classList.toggle('modern-ui-compact', compact);
			const meetAtGap = (classes: string[]) => {
				root.classList.remove('nomaineditorarea', 'editor-hidden-by-chat');
				root.classList.add(...classes);
				updateSashEndpoints(grid.element, !compact);
				return endpoints().some(sash => sash.start || sash.end);
			};
			assert.deepStrictEqual({
				maximizedPanel: meetAtGap(['nomaineditorarea']),
				chatFillsEditorArea: meetAtGap(['nomaineditorarea', 'editor-hidden-by-chat']),
			}, {
				maximizedPanel: false,
				chatFillsEditorArea: !compact,
			});
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
		readonly initialization?: ReadonlyMap<string, unknown>;
	}

	function createLayout(configuration: ILayoutConfiguration, saved?: ISavedLayout) {
		const views = new Map<Parts, Part>();
		const visibility: string[] = [];
		const view = (id: Parts, minimumWidth = 0, minimumHeight = 0, maximumWidth = Number.POSITIVE_INFINITY) => {
			const element = $(`.part.${id.split('.').pop()}`);
			const part = new class extends mock<Part>() {
				override readonly element = element;
				override readonly minimumWidth = minimumWidth;
				override readonly maximumWidth = maximumWidth;
				override readonly minimumHeight = minimumHeight;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override get onDidChange() { return Event.None; }
				override layout() { }
				override setVisible(visible: boolean) { visibility.push(`${id.split('.').pop()} ${visible ? 'shows' : 'hides'}`); }
				override getContainer() { return element; }
				override updateStyles() { }
				override toJSON() { return { type: id }; }
			}();
			// The priorities of the real parts: the editor area takes what a window gains or loses first, unless hidden for the chat part
			const priorities = new Map<Parts, LayoutPriority>([[Parts.EDITOR_PART, LayoutPriority.High], [Parts.SIDEBAR_PART, LayoutPriority.Low], [Parts.AUXILIARYBAR_PART, LayoutPriority.Low], [Parts.CHAT_PART, LayoutPriority.Low]]);
			Object.defineProperty(part, 'priority', { get: () => id === Parts.CHAT_PART && Reflect.get(part, 'fillsEditorArea') ? LayoutPriority.High : priorities.get(id) });
			views.set(id, part);
			return part;
		};
		const parts = {
			titleBarPartView: view(Parts.TITLEBAR_PART, 0, 30),
			bannerPartView: view(Parts.BANNER_PART),
			activityBarPartView: view(Parts.ACTIVITYBAR_PART, 48, 0, 48), // fixed, as the real activity bar
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
		const initialization = saved?.initialization ? new Map(saved.initialization) : new Map<string, unknown>([['sideBar.size', configuration.widths?.sideBar ?? 250], ['auxiliaryBar.size', configuration.widths?.auxiliaryBar ?? 260], ['panel.size', 200]]);
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
			override layout() { (Reflect.get(this, 'workbenchGrid') as SerializableGrid<ISerializableView>).layout(configuration.widths?.window ?? 1600, 900); }
			protected override getPart(id: Parts) { return views.get(id)!; }
		}(mainWindow.document.body));
		Object.assign(layout, {
			...parts,
			_mainContainerDimension: { width: configuration.widths?.window ?? 1600, height: 900 },
			state: { runtime: { mainWindowFullscreen: false } },
			telemetryService: NullTelemetryService,
			extensionService: new NullExtensionService(),
			// No view containers: the side bar and the panel show and hide empty
			paneCompositeService: { onDidPaneCompositeOpen: Event.None, onDidPaneCompositeClose: Event.None, getActivePaneComposite: () => undefined, getLastActivePaneCompositeId: () => undefined },
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
				setInitializationValue: (key: { name: string }, value: unknown) => initialization.set(key.name, value),
			},
		});
		if (configuration.anchor !== undefined) {
			layout.setChatPartAnchor({ viewId: 'sessions' });
		}
		layout.mainContainer.classList.add(...layout.getLayoutClasses());
		const descriptor = (Reflect.get(layout, 'createGridDescriptor') as () => ISerializedGrid).call(layout);
		const save = (): ISavedLayout => {
			(Reflect.get(layout, 'saveChatPartLayout') as () => void).call(layout);
			return { runtime, stored, initialization };
		};
		return { layout, views, descriptor, save, anchor, focus, viewEvents, visibility };
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

	function createGridLayout(configuration: ILayoutConfiguration, saved?: ISavedLayout, laidOut = true) {
		const { layout, views, descriptor, save, anchor, focus, viewEvents, visibility } = createLayout(configuration, saved);
		const grid = store.add(SerializableGrid.deserialize(descriptor, { fromJSON: ({ type }: { type: Parts }) => views.get(type)! }, { proportionalLayout: false }));
		append(layout.mainContainer, grid.element);
		if (laidOut) {
			grid.layout(configuration.widths?.window ?? 1600, 900);
		}
		Object.assign(layout, { workbenchGrid: grid, initialized: laidOut });
		const middle = () => shape((grid.serialize().root.data as ISerializedNode[])[2]);
		return { layout, grid, middle, save, anchor, views, focus, viewEvents, visibility };
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

	for (const sideBar of [Position.LEFT, Position.RIGHT]) {
		test(`hiding the primary side bar beside the chat part gives its room to the chat part, not the editor, and showing it takes the room from the chat part, side bar ${sideBar === Position.LEFT ? 'left' : 'right'}`, () => {
			const { layout, grid, views } = createGridLayout({ sideBar, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } });
			const width = (id: Parts) => grid.getViewSize(views.get(id)!).width;
			const widths = () => ({ bar: layout.isVisible(Parts.SIDEBAR_PART) ? width(Parts.SIDEBAR_PART) : 0, chat: width(Parts.CHAT_PART), editor: width(Parts.EDITOR_PART) });
			const before = widths();
			layout.setPartHidden(true, Parts.SIDEBAR_PART);
			const hidden = widths();
			layout.setPartHidden(false, Parts.SIDEBAR_PART);
			const shown = widths();

			assert.deepStrictEqual({ hidden, shown }, {
				hidden: { bar: 0, chat: before.chat + before.bar, editor: before.editor },
				shown: before,
			});
		});
	}

	for (const { bar, anchor, beside } of [
		{ bar: Parts.AUXILIARYBAR_PART, anchor: ViewContainerLocation.AuxiliaryBar, beside: true },
		{ bar: Parts.AUXILIARYBAR_PART, anchor: ViewContainerLocation.Sidebar, beside: false },
	]) {
		test(`hiding the secondary side bar ${beside ? 'beside' : 'away from'} the chat part ${beside ? 'gives its room to the chat part, not the editor' : 'gives its room to the editor'}, and showing it takes the room back from there`, () => {
			const { layout, grid, views } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor });
			const width = (id: Parts) => grid.getViewSize(views.get(id)!).width;
			const widths = () => ({ bar: layout.isVisible(bar) ? width(bar) : 0, chat: width(Parts.CHAT_PART), editor: width(Parts.EDITOR_PART) });
			const before = widths();
			layout.setPartHidden(true, bar);
			const hidden = widths();
			layout.setPartHidden(false, bar);
			const shown = widths();

			assert.deepStrictEqual({ hidden, shown }, {
				hidden: beside ? { bar: 0, chat: before.chat + before.bar, editor: before.editor } : { bar: 0, chat: before.chat, editor: before.editor + before.bar },
				shown: before,
			});
		});
	}

	test('hiding the side bar before the first layout does not throw', () => {
		const { layout } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } }, undefined, false);

		assert.doesNotThrow(() => layout.setPartHidden(true, Parts.SIDEBAR_PART));
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

	test('the auxiliary bar hides Maximize while any claim is held, and tells only as it starts and stops', () => {
		const { layout } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center' });
		const events: boolean[] = [];
		store.add(layout.onDidChangeAuxiliaryBarMaximizeHidden(hidden => events.push(hidden)));
		const steps: Record<string, unknown> = { initial: layout.isAuxiliaryBarMaximizeHidden() };
		const first = layout.hideAuxiliaryBarMaximize();
		steps.claimed = layout.isAuxiliaryBarMaximizeHidden();
		const second = layout.hideAuxiliaryBarMaximize();
		first.dispose();
		first.dispose();
		steps.oneLeft = layout.isAuxiliaryBarMaximizeHidden();
		second.dispose();
		steps.released = layout.isAuxiliaryBarMaximizeHidden();
		steps.events = events;
		assert.deepStrictEqual(steps, { initial: false, claimed: true, oneLeft: true, released: false, events: [true, false] });
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

	test('fires the chat part visibility event once per change, also for a maximized panel, and not while it stays as it is', () => {
		const { layout } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } });
		const events: boolean[] = [];
		store.add(layout.onDidChangeChatPartVisibility(visible => events.push(visible)));
		layout.setPartHidden(false, Parts.CHAT_PART);
		layout.toggleMaximizedPanel();
		layout.toggleMaximizedPanel();
		layout.setPartHidden(true, Parts.CHAT_PART);
		layout.setPartHidden(true, Parts.CHAT_PART);
		layout.setPartHidden(false, Parts.CHAT_PART);
		assert.deepStrictEqual(events, [false, true, false, true]);
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

	suite('editor area hidden for the chat part', () => {

		const configuration: ILayoutConfiguration = { sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } };

		function state(layout: Layout) {
			return { hiddenByChat: layout.isEditorHiddenByChat(), editor: layout.isVisible(Parts.EDITOR_PART, mainWindow), chat: layout.isVisible(Parts.CHAT_PART), panel: layout.isVisible(Parts.PANEL_PART) };
		}

		function classes(layout: Layout) {
			return { editorAreaHidden: layout.mainContainer.classList.contains('nomaineditorarea'), hiddenByChat: layout.mainContainer.classList.contains('editor-hidden-by-chat') };
		}

		test('hides and shows the editor area, and the chat part takes its width', () => {
			const { layout, grid, views } = createGridLayout(configuration);
			const chat = views.get(Parts.CHAT_PART)!;
			const editorWidth = grid.getViewSize(views.get(Parts.EDITOR_PART)!).width;
			const chatWidth = grid.getViewSize(chat).width;
			const steps: Record<string, unknown> = {};
			layout.setEditorHiddenByChat(true);
			steps.hidden = state(layout);
			const grown = grid.getViewSize(chat).width > chatWidth + editorWidth / 2;
			layout.setEditorHiddenByChat(false);
			steps.shown = state(layout);
			assert.deepStrictEqual({ ...steps, chatTookTheWidth: grown }, {
				hidden: { hiddenByChat: true, editor: false, chat: true, panel: true },
				shown: { hiddenByChat: false, editor: true, chat: true, panel: true },
				chatTookTheWidth: true,
			});
		});

		for (const position of [Position.BOTTOM, Position.TOP]) {
			test(`the ${position === Position.BOTTOM ? 'bottom' : 'top'} panel keeps its gap and separator to the chat part filling the editor area, but not when maximized`, () => {
				const { layout } = createGridLayout({ ...configuration, panel: position });
				const root = append(mainWindow.document.body, layout.mainContainer);
				store.add(toDisposable(() => root.remove()));
				root.classList.add('monaco-workbench', `panel-position-${position === Position.BOTTOM ? 'bottom' : 'top'}`);
				root.style.cssText = '--vscode-panels-spacing: 16px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px;';
				const panel = append(root, $(`.part.panel.${position === Position.BOTTOM ? 'bottom' : 'top'}`));
				const title = append(panel, $('.composite.title'));
				const look = () => {
					root.classList.add('floating-panels');
					const gap = position === Position.BOTTOM ? mainWindow.getComputedStyle(panel).marginTop : undefined;
					root.classList.remove('floating-panels');
					const separator = position === Position.BOTTOM ? mainWindow.getComputedStyle(title).borderTopWidth : mainWindow.getComputedStyle(panel).borderBottomWidth;
					return { gap, separator };
				};
				const editorVisible = look();
				layout.setEditorHiddenByChat(true);
				const chatFillsEditorArea = look();
				layout.toggleMaximizedPanel();
				const maximized = look();
				const gap = position === Position.BOTTOM ? '16px' : undefined;
				assert.deepStrictEqual({ editorVisible, chatFillsEditorArea, maximized }, {
					editorVisible: { gap, separator: '1px' },
					chatFillsEditorArea: { gap, separator: '1px' },
					maximized: { gap: position === Position.BOTTOM ? '0px' : undefined, separator: '0px' },
				});
			});
		}

		test('does not hide the editor area without a visible chat part', () => {
			const hidden = createGridLayout({ ...configuration, chat: { visible: false, size: 400 } });
			hidden.layout.setEditorHiddenByChat(true);
			const absent = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center' });
			absent.layout.setEditorHiddenByChat(true);
			assert.deepStrictEqual({ hidden: state(hidden.layout), absent: absent.layout.isEditorHiddenByChat() }, {
				hidden: { hiddenByChat: false, editor: true, chat: false, panel: true },
				absent: false,
			});
		});

		test('an editor opening shows the editor area again, as a maximized panel does not take its place', () => {
			const { layout } = createGridLayout(configuration);
			layout.setEditorHiddenByChat(true);
			const panelMaximized = layout.isPanelMaximized();
			layout.toggleMaximizedPanel();
			assert.deepStrictEqual({ panelMaximized, afterToggle: state(layout), panelMaximizedAfter: layout.isPanelMaximized() }, {
				panelMaximized: false,
				afterToggle: { hiddenByChat: false, editor: false, chat: false, panel: true },
				panelMaximizedAfter: true,
			});
		});

		test('hiding the chat part, also with the panel hidden, shows the editor area again', () => {
			const { layout } = createGridLayout(configuration);
			layout.setEditorHiddenByChat(true);
			layout.setPartHidden(true, Parts.CHAT_PART);
			const withPanel = state(layout);
			layout.setPartHidden(false, Parts.CHAT_PART);
			layout.setEditorHiddenByChat(true);
			layout.setPartHidden(true, Parts.PANEL_PART);
			layout.setPartHidden(true, Parts.CHAT_PART);
			assert.deepStrictEqual({ withPanel, withoutPanel: state(layout) }, {
				withPanel: { hiddenByChat: false, editor: true, chat: false, panel: true },
				withoutPanel: { hiddenByChat: false, editor: true, chat: false, panel: false },
			});
		});

		test('stays hidden after a reload, with the panel hidden too, and shows again when the chat part no longer does', () => {
			const before = createGridLayout(configuration);
			before.layout.setPartHidden(true, Parts.PANEL_PART);
			before.layout.setEditorHiddenByChat(true);
			const saved = before.save();
			const reloaded = createGridLayout(configuration, saved);
			const withoutChat = createGridLayout(configuration, { ...saved, stored: JSON.stringify({ version: 1, visible: false, size: 400 }) });
			assert.deepStrictEqual({ reloaded: state(reloaded.layout), withoutChat: state(withoutChat.layout), reloadedClasses: classes(reloaded.layout), withoutChatClasses: classes(withoutChat.layout) }, {
				reloaded: { hiddenByChat: true, editor: false, chat: true, panel: false },
				withoutChat: { hiddenByChat: false, editor: true, chat: false, panel: false },
				reloadedClasses: { editorAreaHidden: true, hiddenByChat: true },
				withoutChatClasses: { editorAreaHidden: false, hiddenByChat: false },
			});
		});

		test('hiding the chat part while a maximized secondary side bar had hidden it shows the editor area again', () => {
			const { layout } = createGridLayout(configuration);
			layout.setEditorHiddenByChat(true);
			layout.toggleMaximizedAuxiliaryBar();
			layout.setPartHidden(true, Parts.CHAT_PART);
			assert.deepStrictEqual({ afterHide: state(layout), maximized: layout.isAuxiliaryBarMaximized() }, {
				afterHide: { hiddenByChat: false, editor: true, chat: false, panel: true },
				maximized: false,
			});
		});

		test('maximizing the secondary side bar and restoring it keeps the editor area hidden', () => {
			const { layout } = createGridLayout(configuration);
			layout.setEditorHiddenByChat(true);
			layout.toggleMaximizedAuxiliaryBar();
			const maximized = state(layout);
			layout.toggleMaximizedAuxiliaryBar();
			assert.deepStrictEqual({ maximized, restored: state(layout) }, {
				maximized: { hiddenByChat: true, editor: false, chat: false, panel: false },
				restored: { hiddenByChat: true, editor: false, chat: true, panel: true },
			});
		});

		test('a reload without a chat part, with the secondary side bar maximized, keeps the editor area hidden until it is restored', () => {
			const before = createGridLayout(configuration);
			before.layout.setEditorHiddenByChat(true);
			before.layout.toggleMaximizedAuxiliaryBar();
			const { layout } = createGridLayout({ ...configuration, chat: undefined }, before.save());
			const reloaded = state(layout);
			const reloadedClasses = classes(layout);
			layout.toggleMaximizedAuxiliaryBar();
			assert.deepStrictEqual({ reloaded, restored: state(layout), reloadedClasses, restoredClasses: classes(layout) }, {
				reloaded: { hiddenByChat: false, editor: false, chat: false, panel: false },
				restored: { hiddenByChat: false, editor: true, chat: false, panel: true },
				reloadedClasses: { editorAreaHidden: true, hiddenByChat: false },
				restoredClasses: { editorAreaHidden: false, hiddenByChat: false },
			});
		});

		test('focus goes to the chat part, not the hidden editor area', () => {
			const { layout } = createGridLayout(configuration);
			const focused: Parts[] = [];
			Object.assign(layout, { focusPart: (part: Parts) => focused.push(part) });
			layout.focus();
			layout.setEditorHiddenByChat(true);
			layout.focus();
			// An auxiliary editor window being active keeps its editor focused
			Object.defineProperty(layout, 'activeContainer', { value: $('div') });
			layout.focus();
			assert.deepStrictEqual(focused, [Parts.EDITOR_PART, Parts.CHAT_PART, Parts.EDITOR_PART]);
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

	test('listens to the views only while it has an anchor view to follow', () => {
		const { layout, viewEvents } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 } });
		const listening = () => viewEvents.location.hasListeners();

		const withoutAnchor = listening();
		layout.setChatPartAnchor({ viewId: 'sessions' });
		const anchored = listening();
		layout.setChatPartAnchor({ viewId: 'sessions' });
		const anchoredAgain = listening();
		layout.setChatPartAnchor(undefined);

		assert.deepStrictEqual({ withoutAnchor, anchored, anchoredAgain, cleared: listening() }, { withoutAnchor: false, anchored: true, anchoredAgain: true, cleared: false });
	});

	test('follows its anchor view through the events of the views as they move, deregister and register again', () => {
		const { middle, anchor, viewEvents } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: true, size: 400 }, anchor: ViewContainerLocation.Sidebar });
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

		assert.deepStrictEqual({ ...widthsAcross(layout, grid, views, 1200), auxiliaryBarShrank: grid.getViewSize(views.get(Parts.AUXILIARYBAR_PART)!).width < auxiliaryBarBefore, chatAtItsSavedWidth: grid.getViewSize(views.get(Parts.CHAT_PART)!).width === 400 }, {
			fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true, auxiliaryBarShrank: true, chatAtItsSavedWidth: true,
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

	test('the chat part shown beside a secondary side bar at its minimum takes the room it still needs from the wide side bar on the other side', () => {
		const { layout, grid, views } = createGridLayout({ sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center', chat: { visible: false, size: 162 }, anchor: ViewContainerLocation.AuxiliaryBar, widths: { window: 1200, sideBar: 600, auxiliaryBar: 170 } });
		const sideBarBefore = grid.getViewSize(views.get(Parts.SIDEBAR_PART)!).width;
		layout.setPartHidden(false, Parts.CHAT_PART);

		assert.deepStrictEqual({ ...widthsAcross(layout, grid, views, 1200), sideBarShrank: grid.getViewSize(views.get(Parts.SIDEBAR_PART)!).width < sideBarBefore }, {
			fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true, sideBarShrank: true,
		});
	});

	for (const alignment of ['center', 'left', 'right'] satisfies PanelAlignment[]) {
		for (const sideBar of [Position.LEFT, Position.RIGHT]) {
			test(`the chat part at its minimum width fits beside a wide secondary side bar as it shows or follows its anchor there, panel aligned ${alignment}, side bar ${sideBar === Position.LEFT ? 'left' : 'right'}`, () => {
				const widths = { window: 1200, auxiliaryBar: 590 };
				const shown = createGridLayout({ sideBar, panel: Position.BOTTOM, alignment, chat: { visible: false, size: 280 }, anchor: ViewContainerLocation.AuxiliaryBar, widths });
				shown.layout.setPartHidden(false, Parts.CHAT_PART);
				const moved = createGridLayout({ sideBar, panel: Position.BOTTOM, alignment, chat: { visible: true, size: 280 }, anchor: ViewContainerLocation.Sidebar, widths });
				moved.anchor.location = ViewContainerLocation.AuxiliaryBar;
				(Reflect.get(moved.layout, 'updateChatPartPosition') as () => void).call(moved.layout);

				const fit = { fits: true, chatAtLeastItsMinimum: true, editorAtLeastItsMinimum: true };
				assert.deepStrictEqual({ shown: widthsAcross(shown.layout, shown.grid, shown.views, 1200), moved: widthsAcross(moved.layout, moved.grid, moved.views, 1200) }, { shown: fit, moved: fit });
			});
		}
	}

	suite('parts layout state', () => {

		const configuration: ILayoutConfiguration = { sideBar: Position.LEFT, panel: Position.BOTTOM, alignment: 'center' };
		const chatConfiguration: ILayoutConfiguration = { ...configuration, chat: { visible: true, size: 400 } };

		/** The grid that the layout shows now: applying a state replaces it. */
		function currentGrid(layout: Layout): SerializableGrid<ISerializableView> {
			return Reflect.get(layout, 'workbenchGrid');
		}

		function currentMiddle(layout: Layout): unknown {
			return shape((currentGrid(layout).serialize().root.data as ISerializedNode[])[2]);
		}

		function createStateLayout(saved?: ISavedLayout, layoutConfiguration = configuration) {
			const created = createGridLayout(layoutConfiguration, saved);
			store.add(toDisposable(() => currentGrid(created.layout).dispose()));
			return created;
		}

		test('applies an arrangement of the parts at once, as the window starts with it, without moving the focus', () => {
			const { layout, focus, save, visibility } = createStateLayout();
			const panelPositions: string[] = [];
			store.add(layout.onDidChangePanelPosition(position => panelPositions.push(position)));
			const state: IPartsLayoutState = {
				sideBar: { visible: false, size: 280 },
				panel: { visible: true, size: 320, position: Position.RIGHT, maximized: false },
				auxiliaryBar: { visible: true, size: 300, maximized: false }
			};

			layout.applyPartsLayoutState(state);
			const started = createStateLayout(save());

			assert.deepStrictEqual(
				{ grid: currentGrid(layout).serialize(), state: layout.getPartsLayoutState(), visibility, panelPositions, focused: focus.focused },
				{ grid: currentGrid(started.layout).serialize(), state, visibility: ['sidebar hides'], panelPositions: ['right'], focused: [] }
			);
		});

		test('a maximized secondary side bar hides the other parts, and restoring it shows them as the state arranges them', () => {
			const { layout } = createStateLayout();
			const state: IPartsLayoutState = {
				sideBar: { visible: true, size: 280 },
				panel: { visible: true, size: 250, position: Position.BOTTOM, maximized: false },
				auxiliaryBar: { visible: true, size: 300, maximized: true }
			};

			layout.applyPartsLayoutState(state);
			const maximized = { middle: currentMiddle(layout), state: layout.getPartsLayoutState() };
			layout.toggleMaximizedAuxiliaryBar();
			const restored = { middle: currentMiddle(layout), state: layout.getPartsLayoutState() };

			assert.deepStrictEqual({ maximized, restored }, {
				maximized: { middle: ['activitybar', '(sidebar)', ['(editor)', '(panel)'], 'auxiliarybar'], state },
				restored: { middle: ['activitybar', 'sidebar', ['editor', 'panel'], 'auxiliarybar'], state: { ...state, auxiliaryBar: { ...state.auxiliaryBar, maximized: false } } },
			});
		});

		test('a maximized panel hides the editor area, and restoring it gives the panel its size', () => {
			const { layout } = createStateLayout();
			const state: IPartsLayoutState = {
				sideBar: { visible: true, size: 280 },
				panel: { visible: true, size: 250, position: Position.BOTTOM, maximized: true },
				auxiliaryBar: { visible: false, size: 300, maximized: false }
			};

			layout.applyPartsLayoutState(state);
			const maximized = { panelMaximized: layout.isPanelMaximized(), middle: currentMiddle(layout), state: layout.getPartsLayoutState() };
			layout.toggleMaximizedPanel();
			const restored = { panelMaximized: layout.isPanelMaximized(), middle: currentMiddle(layout), state: layout.getPartsLayoutState() };

			assert.deepStrictEqual({ maximized, restored }, {
				maximized: { panelMaximized: true, middle: ['activitybar', 'sidebar', ['(editor)', 'panel'], '(auxiliarybar)'], state },
				restored: { panelMaximized: false, middle: ['activitybar', 'sidebar', ['editor', 'panel'], '(auxiliarybar)'], state: { ...state, panel: { ...state.panel, maximized: false } } },
			});
		});

		test('restoring a maximized panel on the right takes its room back from the panel, not from the side bars', () => {
			const { layout } = createStateLayout();
			const state: IPartsLayoutState = {
				sideBar: { visible: true, size: 280 },
				panel: { visible: true, size: 320, position: Position.RIGHT, maximized: true },
				auxiliaryBar: { visible: true, size: 300, maximized: false }
			};

			layout.applyPartsLayoutState(state);
			layout.toggleMaximizedPanel();

			assert.deepStrictEqual(layout.getPartsLayoutState(), { ...state, panel: { ...state.panel, maximized: false } });
		});

		test('an editor area hidden for the chat part is not a maximized panel, and stays hidden when an applied maximized secondary side bar is restored', () => {
			const described = createStateLayout(undefined, chatConfiguration).layout;
			described.setEditorHiddenByChat(true);
			described.toggleMaximizedAuxiliaryBar();

			const { layout } = createStateLayout(undefined, chatConfiguration);
			layout.setEditorHiddenByChat(true);
			layout.applyPartsLayoutState(described.getPartsLayoutState());
			layout.toggleMaximizedAuxiliaryBar();

			assert.deepStrictEqual({
				describedPanelMaximized: described.getPartsLayoutState().panel.maximized,
				restored: { hiddenByChat: layout.isEditorHiddenByChat(), editor: layout.isVisible(Parts.EDITOR_PART, mainWindow), chat: layout.isVisible(Parts.CHAT_PART) },
			}, {
				describedPanelMaximized: false,
				restored: { hiddenByChat: true, editor: false, chat: true },
			});
		});

		test('a maximized panel or secondary side bar that is applied hides the chat part, which keeps its width as states apply and shows again at it when it is restored', () => {
			const apply = (maximize: 'panel' | 'auxiliaryBar') => {
				const { layout, views, visibility } = createStateLayout(undefined, chatConfiguration);
				const chat = () => ({ visible: layout.isVisible(Parts.CHAT_PART), width: currentGrid(layout).getViewSize(views.get(Parts.CHAT_PART)!).width });
				const state = layout.getPartsLayoutState();
				const maximizedState: IPartsLayoutState = maximize === 'panel'
					? { ...state, panel: { ...state.panel, maximized: true } }
					: { ...state, auxiliaryBar: { ...state.auxiliaryBar, maximized: true } };
				layout.applyPartsLayoutState(maximizedState);
				const maximized = { chatVisible: layout.isVisible(Parts.CHAT_PART), visibility: [...visibility].sort() };
				layout.applyPartsLayoutState(maximizedState);
				layout.applyPartsLayoutState(state);
				const appliedBack = chat();
				layout.applyPartsLayoutState(maximizedState);
				if (maximize === 'panel') {
					layout.toggleMaximizedPanel();
				} else {
					layout.toggleMaximizedAuxiliaryBar();
				}
				return { maximized, appliedBack, restored: chat() };
			};
			assert.deepStrictEqual({ panel: apply('panel'), auxiliaryBar: apply('auxiliaryBar') }, {
				panel: { maximized: { chatVisible: false, visibility: ['chat hides', 'editor hides'] }, appliedBack: { visible: true, width: 400 }, restored: { visible: true, width: 400 } },
				auxiliaryBar: { maximized: { chatVisible: false, visibility: ['chat hides', 'editor hides', 'panel hides', 'sidebar hides'] }, appliedBack: { visible: true, width: 400 }, restored: { visible: true, width: 400 } },
			});
		});

		test('a state applies as from a window without a maximized part, also while the secondary side bar is maximized beside the chat part', () => {
			const widths = (layout: Layout, views: Map<Parts, Part>) => Object.fromEntries([Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]
				.map(part => [part.split('.').pop(), currentGrid(layout).isViewVisible(views.get(part)!) ? currentGrid(layout).getViewSize(views.get(part)!).width : 'hidden']));
			const apply = (target: (state: IPartsLayoutState) => IPartsLayoutState, maximizedBefore: boolean) => {
				const { layout, views } = createStateLayout(undefined, chatConfiguration);
				const state = layout.getPartsLayoutState();
				if (maximizedBefore) {
					layout.toggleMaximizedAuxiliaryBar();
				}
				layout.applyPartsLayoutState(target(state));
				return widths(layout, views);
			};
			const targets: Record<string, (state: IPartsLayoutState) => IPartsLayoutState> = {
				widerSideBar: state => ({ ...state, sideBar: { ...state.sideBar, size: 280 } }),
				hiddenSideBar: state => ({ ...state, sideBar: { ...state.sideBar, visible: false } }),
				maximizedPanelOnTheRight: state => ({ ...state, panel: { ...state.panel, position: Position.RIGHT, size: 320, maximized: true } }),
			};

			const fromMaximized = Object.fromEntries(Object.entries(targets).map(([name, target]) => [name, apply(target, true)]));
			const fromNormal = Object.fromEntries(Object.entries(targets).map(([name, target]) => [name, apply(target, false)]));

			assert.deepStrictEqual(fromMaximized, fromNormal);
		});

		test('maximizing the secondary side bar hides the chat part at its own width, not with the width of the parts it hides beside it', () => {
			const before = createStateLayout(undefined, chatConfiguration);
			before.layout.toggleMaximizedAuxiliaryBar();
			const saved = before.save();
			const { layout, views } = createStateLayout(saved, chatConfiguration);
			layout.toggleMaximizedAuxiliaryBar();

			assert.deepStrictEqual(
				{ saved: JSON.parse(saved.stored!), restored: currentGrid(layout).getViewSize(views.get(Parts.CHAT_PART)!).width },
				{ saved: { version: 1, visible: true, size: 400, hiddenByLayout: true }, restored: 400 }
			);
		});

		test('what had the focus keeps it while its part shows, and the focus goes to the editor when its part hides', () => {
			const { layout, views, focus } = createStateLayout(undefined, chatConfiguration);
			mainWindow.document.body.appendChild(layout.mainContainer);
			store.add(toDisposable(() => layout.mainContainer.remove()));
			const chatButton = append(views.get(Parts.CHAT_PART)!.element, $('button'));
			const sideBarButton = append(views.get(Parts.SIDEBAR_PART)!.element, $('button'));
			const state = layout.getPartsLayoutState();

			chatButton.focus();
			layout.applyPartsLayoutState(state);
			const chatButtonKeptFocus = mainWindow.document.activeElement === chatButton;

			sideBarButton.focus();
			layout.applyPartsLayoutState({ ...state, sideBar: { ...state.sideBar, visible: false } });

			assert.deepStrictEqual({ chatButtonKeptFocus, focused: focus.focused }, { chatButtonKeptFocus: true, focused: ['editor'] });
		});

		test('content that an editor shows outside its element has the focus in the editor, which goes to the maximized part when the editor area hides', () => {
			const { layout, views, focus } = createStateLayout();
			mainWindow.document.body.appendChild(layout.mainContainer);
			store.add(toDisposable(() => layout.mainContainer.remove()));
			// As a notebook or a webview shows its content outside the editor's element, linked to an element of the editor by its id
			const outside = append(mainWindow.document.body, $('button'));
			store.add(toDisposable(() => outside.remove()));
			setParentFlowTo(outside, append(views.get(Parts.EDITOR_PART)!.element, $('div#layout-test-editor-content')));
			const state = layout.getPartsLayoutState();

			outside.focus();
			layout.applyPartsLayoutState({ ...state, auxiliaryBar: { ...state.auxiliaryBar, maximized: true } });

			assert.deepStrictEqual(focus.focused, ['auxiliarybar']);
		});

		test('a secondary side bar maximized over a maximized panel, restored and then the panel, gives the parts their widths from before', () => {
			const widths = (layout: Layout, views: Map<Parts, Part>) => [Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]
				.map(part => `${part.split('.').pop()} ${currentGrid(layout).getViewSize(views.get(part)!).width}x${currentGrid(layout).getViewSize(views.get(part)!).height}`);
			const before: Record<string, string[]> = {};
			const restored: Record<string, string[]> = {};
			for (const panel of [Position.BOTTOM, Position.LEFT, Position.RIGHT]) {
				const maximized = createStateLayout(undefined, { ...configuration, panel });
				before[panel] = widths(maximized.layout, maximized.views);
				maximized.layout.toggleMaximizedPanel();
				maximized.layout.toggleMaximizedAuxiliaryBar();

				const { layout, views } = createStateLayout(undefined, { ...configuration, panel });
				layout.applyPartsLayoutState(maximized.layout.getPartsLayoutState());
				layout.toggleMaximizedAuxiliaryBar();
				layout.toggleMaximizedPanel();
				restored[panel] = widths(layout, views);
			}

			assert.deepStrictEqual(restored, before);
		});

		test('a window that starts with the secondary side bar maximized over a maximized panel on the left or right gives the parts their widths from before, also beside the chat part', () => {
			const widths = (layout: Layout, views: Map<Parts, Part>) => [Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]
				.filter(part => views.has(part))
				.map(part => `${part.split('.').pop()} ${currentGrid(layout).getViewSize(views.get(part)!).width}`);
			const before: Record<string, string[]> = {};
			const restored: Record<string, string[]> = {};
			for (const panel of [Position.LEFT, Position.RIGHT]) {
				for (const layoutConfiguration of [{ ...configuration, panel }, { ...chatConfiguration, panel }]) {
					const key = `${panel}${layoutConfiguration.chat ? ' with the chat part' : ''}`;
					const maximized = createStateLayout(undefined, layoutConfiguration);
					before[key] = widths(maximized.layout, maximized.views);
					maximized.layout.toggleMaximizedPanel();
					maximized.layout.toggleMaximizedAuxiliaryBar();
					// The sizes as the layout saves them as the window closes (see `createWorkbenchLayout`)
					const grid = currentGrid(maximized.layout);
					const initialization = new Map<string, unknown>([
						['sideBar.size', grid.getViewCachedVisibleSize(maximized.views.get(Parts.SIDEBAR_PART)!)],
						['panel.size', grid.getViewCachedVisibleSize(maximized.views.get(Parts.PANEL_PART)!)],
						['auxiliaryBar.size', grid.getViewSize(maximized.views.get(Parts.AUXILIARYBAR_PART)!).width],
					]);

					const { layout, views } = createStateLayout({ ...maximized.save(), initialization }, layoutConfiguration);
					layout.toggleMaximizedAuxiliaryBar();
					layout.toggleMaximizedPanel();
					restored[key] = widths(layout, views);
				}
			}

			assert.deepStrictEqual(restored, before);
		});

		test('a chat part that has the editor area keeps its own width, so that the editor area shows again at its width after a state applies or the window reloads', () => {
			const widths = (layout: Layout, views: Map<Parts, Part>) => [Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]
				.map(part => `${part.split('.').pop()} ${currentGrid(layout).getViewSize(views.get(part)!).width}`);
			const before: Record<string, string[]> = {};
			const shownAgain: Record<string, string[]> = {};
			for (const path of ['applied', 'reloaded']) {
				let { layout, views, save } = createStateLayout(undefined, chatConfiguration);
				before[path] = widths(layout, views);
				layout.setEditorHiddenByChat(true);
				if (path === 'applied') {
					layout.applyPartsLayoutState(layout.getPartsLayoutState());
				} else {
					({ layout, views } = createStateLayout(save(), chatConfiguration));
				}
				layout.setEditorHiddenByChat(false);
				shownAgain[path] = widths(layout, views);
			}

			assert.deepStrictEqual(shownAgain, before);
		});

		test('a maximized panel that applies while the chat part has the editor area restores the widths, as maximizing it does', () => {
			const widths = (layout: Layout, views: Map<Parts, Part>) => [Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]
				.map(part => `${part.split('.').pop()} ${currentGrid(layout).getViewSize(views.get(part)!).width}x${currentGrid(layout).getViewSize(views.get(part)!).height}`);
			const restore = (maximize: (layout: Layout) => void) => {
				const { layout, views } = createStateLayout(undefined, chatConfiguration);
				layout.setEditorHiddenByChat(true);
				maximize(layout);
				layout.toggleMaximizedPanel();
				return widths(layout, views);
			};

			assert.deepStrictEqual(
				restore(layout => {
					const state = layout.getPartsLayoutState();
					layout.applyPartsLayoutState({ ...state, panel: { ...state.panel, maximized: true } });
				}),
				restore(layout => layout.toggleMaximizedPanel())
			);
		});

		test('restoring the secondary side bar, maximized beside the chat part as the window reloaded, gives the parts their widths from before', () => {
			const widths = (layout: Layout, views: Map<Parts, Part>) => [Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART]
				.map(part => `${part.split('.').pop()} ${currentGrid(layout).getViewSize(views.get(part)!).width}`);
			// A window where the parts beside the chat part leave the editor area little more than its minimum width
			const layoutConfiguration: ILayoutConfiguration = { ...chatConfiguration, chat: { visible: true, size: 398 }, widths: { window: 1340, sideBar: 300, auxiliaryBar: 292 } };
			const maximized = createStateLayout(undefined, layoutConfiguration);
			const before = widths(maximized.layout, maximized.views);
			maximized.layout.toggleMaximizedAuxiliaryBar();
			// The sizes as the layout saves them as the window closes (see `createWorkbenchLayout`)
			const grid = currentGrid(maximized.layout);
			const initialization = new Map<string, unknown>([
				['sideBar.size', grid.getViewCachedVisibleSize(maximized.views.get(Parts.SIDEBAR_PART)!)],
				['panel.size', grid.getViewCachedVisibleSize(maximized.views.get(Parts.PANEL_PART)!)],
				['auxiliaryBar.size', grid.getViewSize(maximized.views.get(Parts.AUXILIARYBAR_PART)!).width],
			]);

			const { layout, views } = createStateLayout({ ...maximized.save(), initialization }, layoutConfiguration);
			layout.toggleMaximizedAuxiliaryBar();

			assert.deepStrictEqual(widths(layout, views), before);
		});

		test('a banner that shows keeps showing', () => {
			const { layout, views } = createStateLayout();
			layout.setPartHidden(false, Parts.BANNER_PART);

			layout.applyPartsLayoutState(layout.getPartsLayoutState());

			assert.strictEqual(currentGrid(layout).isViewVisible(views.get(Parts.BANNER_PART)!), true);
		});

		test('a state that applies before the grid exists changes nothing, and reports an error', () => {
			const errors: unknown[] = [];
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => errors.push(error));
			store.add(toDisposable(() => setUnexpectedErrorHandler(previousHandler)));
			const createGridDescriptor = (layout: Layout) => (Reflect.get(layout, 'createGridDescriptor') as () => ISerializedGrid).call(layout);
			const { layout, descriptor } = createLayout(chatConfiguration);
			const state = layout.getPartsLayoutState();

			layout.applyPartsLayoutState({ ...state, panel: { ...state.panel, maximized: true } });

			assert.deepStrictEqual({ descriptor: createGridDescriptor(layout), errors: errors.length }, { descriptor, errors: 1 });
		});

		test('a view container that opens once the extensions register does not show its part when another state hid it meanwhile', async () => {
			const open = async (hideMeanwhile: boolean) => {
				const { layout } = createStateLayout();
				const registered = new DeferredPromise<void>();
				let isRegistered = false;
				let active: string | undefined;
				const opened: string[] = [];
				Object.assign(layout, {
					extensionService: { whenInstalledExtensionsRegistered: () => registered.p },
					paneCompositeService: {
						onDidPaneCompositeOpen: Event.None,
						onDidPaneCompositeClose: Event.None,
						getActivePaneComposite: () => active ? { getId: () => active } : undefined,
						getLastActivePaneCompositeId: (location: ViewContainerLocation) => location === ViewContainerLocation.Sidebar ? 'extensionViewContainer' : undefined,
						getPaneComposite: () => isRegistered ? {} : undefined,
						hideActivePaneComposite: () => active = undefined,
						// As a part opens a view container: once it is registered, showing the part when it is hidden
						openPaneComposite: async (id: string | undefined) => {
							if (!isRegistered) {
								await registered.p;
							}
							if (!id) {
								return undefined;
							}
							opened.push(id);
							active = id;
							if (!layout.isVisible(Parts.SIDEBAR_PART)) {
								layout.setPartHidden(false, Parts.SIDEBAR_PART);
							}
							return {};
						},
					},
				});
				const state = layout.getPartsLayoutState();

				layout.applyPartsLayoutState(state);
				if (hideMeanwhile) {
					layout.applyPartsLayoutState({ ...state, sideBar: { ...state.sideBar, visible: false } });
				}
				isRegistered = true;
				registered.complete();
				await timeout(0);

				return { sideBarVisible: layout.isVisible(Parts.SIDEBAR_PART), opened };
			};

			assert.deepStrictEqual({ hiddenMeanwhile: await open(true), shownMeanwhile: await open(false) }, {
				hiddenMeanwhile: { sideBarVisible: false, opened: [] },
				shownMeanwhile: { sideBarVisible: true, opened: ['extensionViewContainer'] },
			});
		});

		test('a panel whose view container that was active last is an extension\'s shows it once the extensions register, rather than another or none', async () => {
			const open = async (builtInViewContainers: string[]) => {
				const { layout } = createStateLayout();
				const registered = new DeferredPromise<boolean>();
				const viewContainers = new Set(builtInViewContainers);
				const opened: string[] = [];
				Object.assign(layout, {
					extensionService: { whenInstalledExtensionsRegistered: () => registered.p },
					paneCompositeService: {
						onDidPaneCompositeOpen: Event.None,
						onDidPaneCompositeClose: Event.None,
						getActivePaneComposite: () => undefined,
						getLastActivePaneCompositeId: (location: ViewContainerLocation) => location === ViewContainerLocation.Panel ? 'extensionViewContainer' : undefined,
						getPaneComposite: (id: string) => viewContainers.has(id) ? {} : undefined,
						getVisiblePaneCompositeIds: () => [],
						openPaneComposite: async (id: string | undefined) => {
							if (id) {
								opened.push(id);
							}
							return id ? {} : undefined;
						},
					},
				});
				// Until the extensions register, the view container of an extension is not there, and so has no views
				Object.assign(Reflect.get(layout, 'viewDescriptorService'), {
					getViewContainersByLocation: (location: ViewContainerLocation) => location === ViewContainerLocation.Panel ? [...viewContainers].map(id => ({ id })) : [],
					getViewContainerById: (id: string) => viewContainers.has(id) ? { id } : null,
					getViewContainerModel: () => ({ activeViewDescriptors: [{}] }),
					getDefaultViewContainer: () => undefined,
				});

				layout.applyPartsLayoutState(layout.getPartsLayoutState());
				const beforeRegistration = [...opened];
				viewContainers.add('extensionViewContainer');
				registered.complete(true);
				await timeout(0);

				return { beforeRegistration, opened };
			};

			assert.deepStrictEqual({ besideBuiltIn: await open(['workbench.panel.markers']), alone: await open([]) }, {
				besideBuiltIn: { beforeRegistration: [], opened: ['extensionViewContainer'] },
				alone: { beforeRegistration: [], opened: ['extensionViewContainer'] },
			});
		});

		test('the focus that goes to a maximized secondary side bar, as the editor area that had it hides, goes to the view container that opens there once the extensions register, unless something has the focus by then', async () => {
			const apply = async (focusMeanwhile: boolean) => {
				const { layout, views } = createStateLayout();
				mainWindow.document.body.appendChild(layout.mainContainer);
				store.add(toDisposable(() => layout.mainContainer.remove()));
				const editorButton = append(views.get(Parts.EDITOR_PART)!.element, $('button'));
				const viewContainerButton = append(views.get(Parts.AUXILIARYBAR_PART)!.element, $('button'));
				const statusBarButton = append(views.get(Parts.STATUSBAR_PART)!.element, $('button'));
				const registered = new DeferredPromise<boolean>();
				const viewContainers = new Set<string>();
				let active: string | undefined;
				Object.assign(layout, {
					extensionService: { whenInstalledExtensionsRegistered: () => registered.p },
					paneCompositeService: {
						onDidPaneCompositeOpen: Event.None,
						onDidPaneCompositeClose: Event.None,
						getActivePaneComposite: (location: ViewContainerLocation) => location === ViewContainerLocation.AuxiliaryBar && active ? { getId: () => active } : undefined,
						getLastActivePaneCompositeId: (location: ViewContainerLocation) => location === ViewContainerLocation.AuxiliaryBar ? 'extensionViewContainer' : undefined,
						getPaneComposite: (id: string) => viewContainers.has(id) ? {} : undefined,
						getVisiblePaneCompositeIds: () => [],
						openPaneComposite: async (id: string | undefined) => {
							active = id;
							return id ? {} : undefined;
						},
					},
					// As focusing the secondary side bar focuses its active view container, if it has one
					focusPart: (part: Parts) => {
						if (part === Parts.AUXILIARYBAR_PART && active) {
							viewContainerButton.focus();
						}
					},
				});
				// Until the extensions register, the view container of an extension is not there, and so has no views
				Object.assign(Reflect.get(layout, 'viewDescriptorService'), {
					getViewContainersByLocation: (location: ViewContainerLocation) => location === ViewContainerLocation.AuxiliaryBar ? [...viewContainers].map(id => ({ id })) : [],
					getViewContainerById: (id: string) => viewContainers.has(id) ? { id } : null,
					getViewContainerModel: () => ({ activeViewDescriptors: [{}] }),
					getDefaultViewContainer: () => undefined,
				});
				const state = layout.getPartsLayoutState();

				editorButton.focus();
				layout.applyPartsLayoutState({ ...state, auxiliaryBar: { ...state.auxiliaryBar, maximized: true } });
				if (focusMeanwhile) {
					statusBarButton.focus();
				}
				viewContainers.add('extensionViewContainer');
				registered.complete(true);
				await timeout(0);

				const activeElement = mainWindow.document.activeElement;
				return { opened: active, focused: activeElement === viewContainerButton ? 'view container' : activeElement === statusBarButton ? 'status bar' : activeElement?.tagName.toLowerCase() };
			};

			assert.deepStrictEqual({ focusLost: await apply(false), focusedMeanwhile: await apply(true) }, {
				focusLost: { opened: 'extensionViewContainer', focused: 'view container' },
				focusedMeanwhile: { opened: 'extensionViewContainer', focused: 'status bar' },
			});
		});

		test('describes the view container that each part shows, or that it showed last while it shows none', () => {
			const { layout } = createStateLayout();
			Object.assign(layout, {
				paneCompositeService: {
					getActivePaneComposite: (location: ViewContainerLocation) => location === ViewContainerLocation.Sidebar ? { getId: () => 'workbench.view.explorer' } : undefined,
					getLastActivePaneCompositeId: (location: ViewContainerLocation) => location === ViewContainerLocation.Sidebar ? 'workbench.view.search' : location === ViewContainerLocation.Panel ? 'terminal' : '',
				},
			});
			const state = layout.getPartsLayoutState();

			assert.deepStrictEqual([state.sideBar.viewContainerId, state.panel.viewContainerId, state.auxiliaryBar.viewContainerId], ['workbench.view.explorer', 'terminal', undefined]);
		});

		/**
		 * A layout whose side bar shows Explorer, with the view containers of the side bar opening and closing as they do in the
		 * real layout. The view container of an extension is there once the extensions register.
		 */
		function createViewContainersLayout() {
			const created = createStateLayout();
			const { layout, views } = created;
			mainWindow.document.body.appendChild(layout.mainContainer);
			store.add(toDisposable(() => layout.mainContainer.remove()));
			const explorerButton = append(views.get(Parts.SIDEBAR_PART)!.element, $('button'));
			const statusBarButton = append(views.get(Parts.STATUSBAR_PART)!.element, $('button'));
			const registered = new DeferredPromise<boolean>();
			const viewContainers = new Set(['workbench.view.explorer', 'workbench.view.search']);
			const onDidOpen = store.add(new Emitter<{ viewContainerLocation: ViewContainerLocation }>());
			const onDidClose = store.add(new Emitter<{ viewContainerLocation: ViewContainerLocation }>());
			const sideBar = { active: 'workbench.view.explorer' as string | undefined, opened: [] as string[] };
			// What has the focus in a view container hides with it
			const show = (id: string | undefined) => {
				if (sideBar.active) {
					onDidClose.fire({ viewContainerLocation: ViewContainerLocation.Sidebar });
				}
				sideBar.active = id;
				explorerButton.style.display = id === 'workbench.view.explorer' ? '' : 'none';
				if (id) {
					onDidOpen.fire({ viewContainerLocation: ViewContainerLocation.Sidebar });
				}
			};
			Object.assign(layout, {
				extensionService: { whenInstalledExtensionsRegistered: () => registered.p },
				paneCompositeService: {
					onDidPaneCompositeOpen: onDidOpen.event,
					onDidPaneCompositeClose: onDidClose.event,
					getActivePaneComposite: (location: ViewContainerLocation) => location === ViewContainerLocation.Sidebar && sideBar.active ? { getId: () => sideBar.active } : undefined,
					getLastActivePaneCompositeId: (location: ViewContainerLocation) => location === ViewContainerLocation.Sidebar ? 'workbench.view.explorer' : undefined,
					getPaneComposite: (id: string, location: ViewContainerLocation) => location === ViewContainerLocation.Sidebar && viewContainers.has(id) ? {} : undefined,
					hideActivePaneComposite: () => show(undefined),
					// As a part opens a view container: one that is not there yet waits for the extensions to register
					openPaneComposite: async (id: string | undefined, _location: ViewContainerLocation, focus?: boolean) => {
						if (id && !viewContainers.has(id)) {
							await registered.p;
						}
						if (!id || !viewContainers.has(id)) {
							return undefined;
						}
						sideBar.opened.push(focus ? `${id} with focus` : id);
						show(id);
						return {};
					},
				},
			});
			const register = async () => {
				viewContainers.add('extensionViewContainer');
				registered.complete(true);
				await timeout(0);
			};
			const sideBarState = (viewContainerId: string): IPartsLayoutState => {
				const state = layout.getPartsLayoutState();
				return { ...state, sideBar: { ...state.sideBar, viewContainerId } };
			};
			return { ...created, explorerButton, statusBarButton, sideBar, show, register, sideBarState };
		}

		test('a part that shows another view container opens the one of the state, without focus, and keeps the focus that was in the one it showed, also when it opens once the extensions register, unless the focus moved elsewhere meanwhile', async () => {
			const apply = async (viewContainerId: string, moveFocusMeanwhile: boolean) => {
				const { layout, focus, explorerButton, statusBarButton, sideBar, register, sideBarState } = createViewContainersLayout();
				const state = sideBarState(viewContainerId);

				explorerButton.focus();
				layout.applyPartsLayoutState(state);
				layout.applyPartsLayoutState(state);
				if (moveFocusMeanwhile) {
					statusBarButton.focus();
				}
				await register();

				return { opened: sideBar.opened, focused: focus.focused, statusBarFocused: mainWindow.document.activeElement === statusBarButton };
			};

			assert.deepStrictEqual({
				registered: await apply('workbench.view.search', false),
				onceRegistered: await apply('extensionViewContainer', false),
				focusMovedMeanwhile: await apply('extensionViewContainer', true),
			}, {
				registered: { opened: ['workbench.view.search'], focused: ['sidebar'], statusBarFocused: false },
				onceRegistered: { opened: ['extensionViewContainer'], focused: ['sidebar'], statusBarFocused: false },
				focusMovedMeanwhile: { opened: ['extensionViewContainer'], focused: [], statusBarFocused: true },
			});
		});

		test('a part opens the view container of the state that an extension contributes once the extensions register, unless what the part shows changed meanwhile, also back to what it showed, and keeps the one it shows when the state\'s is not there', async () => {
			const apply = async (viewContainerId: string, meanwhile?: 'switchBack' | 'hideAndShow') => {
				const { layout, sideBar, show, register, sideBarState } = createViewContainersLayout();

				layout.applyPartsLayoutState(sideBarState(viewContainerId));
				if (meanwhile === 'switchBack') {
					show('workbench.view.search');
					show('workbench.view.explorer');
				} else if (meanwhile === 'hideAndShow') {
					layout.setPartHidden(true, Parts.SIDEBAR_PART);
					layout.setPartHidden(false, Parts.SIDEBAR_PART);
				}
				await register();

				return { active: sideBar.active, sideBarVisible: layout.isVisible(Parts.SIDEBAR_PART) };
			};

			assert.deepStrictEqual({
				registers: await apply('extensionViewContainer'),
				switchedBackMeanwhile: await apply('extensionViewContainer', 'switchBack'),
				hiddenAndShownMeanwhile: await apply('extensionViewContainer', 'hideAndShow'),
				notThere: await apply('uninstalledViewContainer'),
			}, {
				registers: { active: 'extensionViewContainer', sideBarVisible: true },
				switchedBackMeanwhile: { active: 'workbench.view.explorer', sideBarVisible: true },
				hiddenAndShownMeanwhile: { active: 'workbench.view.explorer', sideBarVisible: true },
				notThere: { active: 'workbench.view.explorer', sideBarVisible: true },
			});
		});

		test('a part does not restore its view container of an extension, which opens once the extensions register as the window starts, when a state applied meanwhile', async () => {
			const restore = async (applyMeanwhile: boolean) => {
				const { layout, sideBar, register, sideBarState } = createViewContainersLayout();

				const restored = (Reflect.get(layout, 'restoreViewContainer') as (location: ViewContainerLocation, id: string) => Promise<void>).call(layout, ViewContainerLocation.Sidebar, 'extensionViewContainer');
				if (applyMeanwhile) {
					layout.applyPartsLayoutState(sideBarState('workbench.view.search'));
				}
				await register();
				await restored;

				return sideBar.active;
			};

			assert.deepStrictEqual({ stateApplied: await restore(true), noState: await restore(false) }, { stateApplied: 'workbench.view.search', noState: 'extensionViewContainer' });
		});
	});
});
