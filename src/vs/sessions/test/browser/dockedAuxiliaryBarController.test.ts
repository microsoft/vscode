/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { NullHoverService } from '../../../platform/hover/test/browser/nullHoverService.js';
import { Part } from '../../../workbench/browser/part.js';
import { DockedAuxiliaryBarController, IDockedAuxiliaryBarHost } from '../../browser/dockedAuxiliaryBarController.js';
import { FloatingAuxiliaryBarController } from '../../browser/floatingAuxiliaryBarController.js';
import { DetailsPosition } from '../../../workbench/contrib/sessions/common/sessionConfig.js';
import '../../browser/media/workbench.css';

suite('Sessions - Docked Details Position', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost() {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.dock-detail-panel'));
		root.style.setProperty('--vscode-strokeThickness', '1px');
		root.style.setProperty('--vscode-agentsPanel-border', '#abcdef');
		store.add(toDisposable(() => root.remove()));
		const editor = append(root, $('.part.editor'));
		const part = append(editor, $('.part.auxiliarybar'));
		Object.defineProperties(editor, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
		editor.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
		let position: DetailsPosition = 'right';
		let width = 260;
		let height = 200;
		let visible = true;
		let editorVisible = true;
		let contentTop = 65;
		let floating = false;
		let collapses = 0;
		let insets = [0, 0, 0, 0];
		let lastLayout: number[] = [];
		const auxiliaryBarPart = upcastPartial<Part>({
			getContainer: () => part,
			layout: (width, height, top, left) => { part.style.height = ''; lastLayout = [width, height, top, left]; },
		});
		const host: IDockedAuxiliaryBarHost = {
			getPosition: () => position,
			getWidth: () => width, setWidth: value => { width = value; },
			getHeight: () => height, setHeight: value => { height = value; },
			isEditorAreaVisible: () => true,
			isEditorVisible: () => editorVisible,
			isAuxiliaryBarVisible: () => visible,
			hideAuxiliaryBar: () => { visible = false; collapses++; },
			setEditorContentInsets: (right, top, bottom, left) => { insets = [right, top, bottom, left]; },
			getTabsHeight: () => 33,
			getEditorContentTop: () => contentTop,
		};
		const controller = store.add(new DockedAuxiliaryBarController(editor, auxiliaryBarPart, host, {
			isEnabled: () => floating,
			createController: () => new FloatingAuxiliaryBarController(editor, auxiliaryBarPart, {
				getTitle: () => 'Files', getIcon: () => undefined, isChangesViewActive: () => false, onDidChangeTitle: Event.None,
				getWidth: () => 260, setWidth: () => { },
				getHeight: () => 400, setHeight: () => { },
				getContentHeight: () => undefined, onDidChangeContentHeight: Event.None, setSizeToContent: () => { },
				focusEditor: () => { },
			}, upcastPartial<IAccessibilityService>({ isMotionReduced: () => true, onDidChangeReducedMotion: Event.None }), NullHoverService),
		}));
		return {
			editor, part, controller,
			getWidth: () => width,
			setPosition: (value: DetailsPosition) => { position = value; controller.layout(); },
			setEditorVisible: (value: boolean) => { editorVisible = value; controller.layout(); },
			setContentTop: (value: number) => { contentTop = value; controller.layout(); },
			setFloating: (value: boolean) => { floating = value; controller.layout(); },
			show: () => { visible = true; controller.layout(); },
			hide: () => { visible = false; controller.layout(); },
			snapshot: () => ({ insets, layout: lastLayout, requestedHeight: height, collapses }),
		};
	}

	test('places details above or below main content, never outside the editor frame', () => {
		const { part, editor, controller, setPosition, snapshot } = createHost();
		controller.layout();
		const right = snapshot();
		setPosition('left');
		const left = { ...snapshot(), anchors: [part.style.left, part.style.right] };
		setPosition('top');
		const top = { ...snapshot(), allocatedHeight: part.style.height };
		setPosition('bottom');
		const bottom = { ...snapshot(), allocatedHeight: part.style.height };
		setPosition('right');
		assert.deepStrictEqual({ right, left, top, bottom, restored: snapshot(), anchors: [part.style.left, part.style.right], parentPreserved: part.parentElement === editor }, {
			right: { insets: [260, 0, 0, 0], layout: [260, 567, 33, 540], requestedHeight: 200, collapses: 0 },
			left: { insets: [0, 0, 0, 260], layout: [260, 567, 33, 0], requestedHeight: 200, collapses: 0, anchors: ['0px', ''] },
			top: { insets: [0, 200, 0, 0], layout: [800, 199, 65, 0], requestedHeight: 200, collapses: 0, allocatedHeight: '200px' },
			bottom: { insets: [0, 0, 200, 0], layout: [800, 199, 400, 0], requestedHeight: 200, collapses: 0, allocatedHeight: '200px' },
			anchors: ['', '0px'],
			restored: right, parentPreserved: true,
		});
	});

	test('left details resize from the right edge, reset, and retain their width after collapse', () => {
		const { editor, part, controller, setPosition, snapshot, getWidth, show } = createHost();
		setPosition('left');
		const sash = editor.querySelector<HTMLElement>('.monaco-sash.vertical:not(.disabled)')!;
		const drag = (from: number, to: number) => {
			sash.dispatchEvent(new MouseEvent('mousedown', { clientX: from, clientY: 100, bubbles: true }));
			mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: to, clientY: 100 }));
			mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: to, clientY: 100 }));
		};
		const initialSash = sash.style.left;
		drag(260, 320);
		const resized = getWidth();
		sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const reset = getWidth();
		drag(300, 0);
		controller.layout();
		const collapsed = part.style.display;
		show();
		const style = mainWindow.getComputedStyle(part);
		assert.deepStrictEqual({ initialSash, resized, reset, collapsed, width: getWidth(), restored: snapshot(), border: [style.borderLeftWidth, style.borderRightWidth] }, {
			initialSash: '258px', resized: 320, reset: 300, collapsed: 'none', width: 300,
			restored: { insets: [0, 0, 0, 300], layout: [300, 567, 33, 0], requestedHeight: 200, collapses: 1 },
			border: ['0px', '1px'],
		});
	});

	for (const position of ['top', 'bottom'] as const) {
		test(`${position} sash resizes, resets, collapses, and restores the remembered height`, () => {
			const { editor, part, controller, setPosition, snapshot, show } = createHost();
			setPosition(position);
			const sash = editor.querySelector<HTMLElement>('.monaco-sash.horizontal:not(.disabled)')!;
			const drag = (from: number, to: number) => {
				sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, clientY: from, bubbles: true }));
				mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: to }));
				mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 400, clientY: to }));
			};
			drag(300, position === 'top' ? 360 : 240);
			const resized = snapshot().requestedHeight;
			sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			const reset = snapshot().requestedHeight;
			drag(300, position === 'top' ? 0 : 600);
			controller.layout();
			const collapsed = part.style.display;
			show();
			assert.deepStrictEqual({ resized, reset, collapsed, restored: snapshot() }, {
				resized: 260, reset: 240, collapsed: 'none',
				restored: {
					insets: position === 'top' ? [0, 240, 0, 0] : [0, 0, 240, 0],
					layout: [800, 239, position === 'top' ? 65 : 360, 0],
					requestedHeight: 240, collapses: 1,
				},
			});
		});
	}

	test('detail-only presentation fills the frame below tabs and disables the local sash', () => {
		const { editor, setPosition, setEditorVisible, snapshot } = createHost();
		setPosition('bottom');
		setEditorVisible(false);
		assert.deepStrictEqual({ state: snapshot(), enabledSashes: editor.querySelectorAll('.monaco-sash:not(.disabled)').length }, {
			state: { insets: [0, 0, 0, 0], layout: [800, 566, 33, 0], requestedHeight: 200, collapses: 0 }, enabledSashes: 0,
		});
	});

	test('floating presentation overrides stacking and restores the selected position when disabled', () => {
		const { editor, part, setPosition, setFloating, snapshot } = createHost();
		setPosition('top');
		setFloating(true);
		const floating = { insets: snapshot().insets, overlay: part.classList.contains('floating-auxiliarybar') };
		setFloating(false);
		assert.deepStrictEqual({ floating, restored: snapshot(), parentPreserved: part.parentElement === editor }, {
			floating: { insets: [0, 0, 0, 0], overlay: true },
			restored: { insets: [0, 200, 0, 0], layout: [800, 199, 65, 0], requestedHeight: 200, collapses: 0 },
			parentPreserved: true,
		});
	});

	test('floating details start and reset below the editor selector and follow header height changes', () => {
		const { editor, controller, setFloating, setContentTop, snapshot } = createHost();
		setFloating(true);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		const initial = widget.style.top;
		grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
		const moved = parseFloat(widget.style.top) > parseFloat(initial);
		grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const reset = widget.style.top;
		setContentTop(97);
		const tallerHeader = widget.style.top;
		setContentTop(33);
		controller.revealFloatingDetails();
		assert.deepStrictEqual({ initial, moved, reset, tallerHeader, tabsOnly: widget.style.top, expandedContentTop: snapshot().layout[2] }, {
			initial: '73px', moved: true, reset: '73px', tallerHeader: '105px', tabsOnly: '41px', expandedContentTop: 73,
		});
	});

	test('left details clear their inset in floating mode and restore their docked edge afterward', () => {
		const { part, setPosition, setFloating, setEditorVisible, snapshot, editor } = createHost();
		setPosition('left');
		setFloating(true);
		const floating = { insets: snapshot().insets, left: part.classList.contains('docked-auxiliarybar-left') };
		setFloating(false);
		const restored = { insets: snapshot().insets, anchors: [part.style.left, part.style.right] };
		setEditorVisible(false);
		assert.deepStrictEqual({ floating, restored, detailOnly: snapshot().layout, enabledSashes: editor.querySelectorAll('.monaco-sash:not(.disabled)').length }, {
			floating: { insets: [0, 0, 0, 0], left: false },
			restored: { insets: [0, 0, 0, 260], anchors: ['0px', ''] },
			detailOnly: [800, 567, 33, 0], enabledSashes: 0,
		});
	});

	test('a view-focus request pins floating details even when its controller has not been created yet', () => {
		const { editor, part, controller, hide, show, setFloating } = createHost();
		hide();
		setFloating(true);
		controller.revealFloatingDetails();
		show();
		controller.onDidOpenItem();
		assert.deepStrictEqual({
			expanded: editor.querySelector('.floating-details-header .action-label')?.getAttribute('aria-expanded'),
			label: editor.querySelector('.floating-details-header .action-label')?.getAttribute('aria-label'),
			body: part.style.display,
		}, { expanded: 'true', label: 'Unpin Files', body: '' });
	});

	test('a completed view-focus request does not re-pin an unpinned preview on later layouts', () => {
		const { editor, controller, setFloating } = createHost();
		setFloating(true);
		controller.revealFloatingDetails();
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		widget.querySelector<HTMLElement>('.floating-details-toggle')!.click();
		const unpinned = widget.querySelector('.floating-details-toggle')?.getAttribute('aria-pressed');
		controller.layout();
		assert.deepStrictEqual({
			unpinned, afterLayout: widget.querySelector('.floating-details-toggle')?.getAttribute('aria-pressed'),
			expanded: !widget.classList.contains('collapsed'),
		}, { unpinned: 'false', afterLayout: 'false', expanded: true });
	});

	test('leaving floating mode cancels a pending view-focus pin request', () => {
		const { editor, controller, setFloating, hide, show } = createHost();
		hide();
		setFloating(true);
		controller.revealFloatingDetails();
		setFloating(false);
		show();
		setFloating(true);
		assert.deepStrictEqual({
			pinned: editor.querySelector('.floating-details-toggle')?.getAttribute('aria-pressed'),
			collapsed: editor.querySelector('.floating-details')?.classList.contains('collapsed'),
		}, { pinned: 'false', collapsed: true });
	});

	test('exposes sizing only for the active floating presentation', () => {
		const { controller, setFloating, setEditorVisible, hide, show } = createHost();
		setFloating(true);
		const active = controller.floatingDetails;
		hide();
		const hidden = controller.floatingDetails;
		show();
		setEditorVisible(false);
		const detailsOnly = controller.floatingDetails;
		setEditorVisible(true);
		const restored = controller.floatingDetails === active;
		setFloating(false);
		assert.deepStrictEqual({
			active: !!active, hidden, detailsOnly, restored, docked: controller.floatingDetails,
		}, { active: true, hidden: undefined, detailsOnly: undefined, restored: true, docked: undefined });
	});

	test('constrains detail height while reserving editor space and never overflows a small frame', () => {
		assert.deepStrictEqual([535, 200, 80, 0].map(available => DockedAuxiliaryBarController.getEffectiveHeight(1000, available)), [415, 120, 80, 0]);
	});
});
