/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { Grid, Direction, ISerializedGrid, ISerializedNode, Orientation, SerializableGrid } from '../../../base/browser/ui/grid/grid.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Layout } from '../../browser/layout.js';
import { Part, updateSashEndpoints } from '../../browser/part.js';
import { PanelAlignment, Parts, Position } from '../../services/layout/browser/layoutService.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';

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
		const initialization = new Map<string, unknown>([['sideBar.size', 250], ['auxiliaryBar.size', 260], ['panel.size', 200]]);
		let stored = saved ? saved.stored : configuration.chat && configuration.chat !== 'noLayout' ? JSON.stringify({ version: 1, ...configuration.chat }) : undefined;
		const layout = store.add(new class extends Layout {
			override isVisible(part: Parts, targetWindow?: Window): boolean {
				return part === Parts.TITLEBAR_PART || super.isVisible(part, targetWindow);
			}
			override hasFocus() { return false; }
			override isFloatingPanelsEnabled() { return false; }
			protected override getPart(id: Parts) { return views.get(id)!; }
		}(mainWindow.document.body));
		Object.assign(layout, {
			...parts,
			_mainContainerDimension: { width: 1600, height: 900 },
			telemetryService: NullTelemetryService,
			// No view containers: the side bar and the panel show and hide empty
			paneCompositeService: { getActivePaneComposite: () => undefined, getLastActivePaneCompositeId: () => undefined },
			viewDescriptorService: { getViewContainersByLocation: () => [] },
			configurationService: { getValue: () => undefined },
			storageService: { get: () => stored, store: (_key: string, value: string) => stored = value },
			stateModel: {
				getRuntimeValue: (key: { name: string; defaultValue: unknown }) => runtime.has(key.name) ? runtime.get(key.name) : key.defaultValue,
				setRuntimeValue: (key: { name: string }, value: unknown) => runtime.set(key.name, value),
				getInitializationValue: (key: { name: string; defaultValue: unknown }) => initialization.get(key.name) ?? key.defaultValue,
			},
		});
		const descriptor = (Reflect.get(layout, 'createGridDescriptor') as () => ISerializedGrid).call(layout);
		const save = (): ISavedLayout => {
			(Reflect.get(layout, 'saveChatPartLayout') as () => void).call(layout);
			return { runtime, stored };
		};
		return { layout, views, descriptor, save };
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
		const { layout, views, descriptor, save } = createLayout(configuration, saved);
		const grid = store.add(SerializableGrid.deserialize(descriptor, { fromJSON: ({ type }: { type: Parts }) => views.get(type)! }, { proportionalLayout: false }));
		append(layout.mainContainer, grid.element);
		grid.layout(1600, 900);
		Object.assign(layout, { workbenchGrid: grid });
		const middle = () => shape((grid.serialize().root.data as ISerializedNode[])[2]);
		return { layout, grid, middle, save };
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
});
