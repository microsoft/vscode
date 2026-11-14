/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, getActiveElement } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Emitter } from '../../../base/common/event.js';
import { timeout } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { FloatingAuxiliaryBarController } from '../../browser/floatingAuxiliaryBarController.js';
import { DockedAuxiliaryBarController } from '../../browser/dockedAuxiliaryBarController.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { Part } from '../../../workbench/browser/part.js';
import { AbstractPaneCompositePart } from '../../../workbench/browser/parts/paneCompositePart.js';
import { DesktopAuxiliaryBarPart } from '../../browser/parts/desktopAuxiliaryBarPart.js';
import { PaneComposite } from '../../../workbench/browser/panecomposite.js';
import { ViewPane } from '../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IView, ViewContainerLocation } from '../../../workbench/common/views.js';
import { ViewsService } from '../../../workbench/services/views/browser/viewsService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { NullHoverService } from '../../../platform/hover/test/browser/nullHoverService.js';
import { getIconRegistry } from '../../../platform/theme/common/iconRegistry.js';
import { runWithFakedTimers } from '../../../base/test/common/virtualScheduling/index.js';
import '../../browser/media/workbench.css';
import '../../../base/browser/ui/scrollbar/media/scrollbars.css';
import '../../../workbench/contrib/sessions/browser/parts/media/sessionActivityBar.css';

suite('Sessions - Floating Details', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost(pinned = true, contentHeight: number | undefined = undefined, relayoutOnWidthChange = false) {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.dock-detail-panel'));
		store.add(toDisposable(() => root.remove()));
		Object.assign(root.style, { position: 'fixed', top: '0', left: '0', width: '800px', height: '600px' });
		root.style.setProperty('--vscode-spacing-size80', '8px');
		root.style.setProperty('--vscode-spacing-size240', '24px');
		root.style.setProperty('--vscode-strokeThickness', '1px');
		root.style.setProperty('--vscode-fontWeight-semiBold', '600');
		const editor = append(root, $('.part.editor', { tabIndex: 0 }));
		Object.assign(editor.style, { position: 'relative', width: '800px', height: '600px', border: '0', boxSizing: 'border-box' });
		const part = append(editor, $('.part.auxiliarybar', { id: 'floating-details-test-body' }));
		const tree = append(part, $('div', { role: 'tree', tabIndex: 0 }));
		let width = 800;
		let height = 600;
		let requestedWidth = 300;
		let requestedHeight = 400;
		let collapses = 0;
		let title = 'Files';
		let changesViewActive = false;
		const titleChanges = store.add(new Emitter<void>());
		const motionChanges = store.add(new Emitter<void>());
		const contentChanges = store.add(new Emitter<void>());
		let sizeToContent = false;
		let reducedMotion = false;
		const accessibilityService = upcastPartial<IAccessibilityService>({
			isMotionReduced: () => reducedMotion,
			onDidChangeReducedMotion: motionChanges.event,
		});
		const layouts: { width: number; height: number }[] = [];
		editor.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
		const auxiliaryBarPart = {
			getContainer: () => part,
			layout: (width: number, height: number) => { layouts.push({ width, height }); },
		};
		const host = {
			getTitle: () => title,
			getIcon: () => title === 'Changes' ? Codicon.diff : Codicon.files,
			isChangesViewActive: () => changesViewActive,
			onDidChangeTitle: titleChanges.event,
			getWidth: () => requestedWidth,
			setWidth: (value: number) => {
				requestedWidth = value;
				if (relayoutOnWidthChange) {
					controller.layout(33);
				}
			},
			getHeight: () => requestedHeight,
			setHeight: (value: number) => { requestedHeight = value; },
			getContentHeight: () => contentHeight,
			onDidChangeContentHeight: contentChanges.event,
			setSizeToContent: (value: boolean) => { sizeToContent = value; },
			focusEditor: () => { collapses++; editor.focus(); },
		};
		const controller = store.add(new FloatingAuxiliaryBarController(editor, auxiliaryBarPart, host, accessibilityService, NullHoverService));
		controller.setPinned(pinned);
		return {
			editor, part, tree, controller, layouts, host, auxiliaryBarPart, accessibilityService,
			setContentHeight: (value: number | undefined) => { contentHeight = value; contentChanges.fire(); },
			isSizeToContent: () => sizeToContent,
			setReducedMotion: (value: boolean) => { reducedMotion = value; motionChanges.fire(); },
			setTitle: (value: string) => { title = value; titleChanges.fire(); },
			resize: (nextWidth: number, nextHeight: number) => {
				width = nextWidth;
				height = nextHeight;
				Object.assign(editor.style, { width: `${width}px`, height: `${height}px` });
			},
			setChangesViewActive: (value: boolean) => { changesViewActive = value; titleChanges.fire(); },
			snapshot: () => {
				const overlay = editor.querySelector<HTMLElement>('.floating-details')!;
				return {
					width: overlay.style.width, height: overlay.style.height, top: overlay.style.top,
					requestedWidth, requestedHeight, collapses,
					layout: layouts.at(-1),
				};
			},
		};
	}

	function drag(handle: HTMLElement, deltaX: number, deltaY: number): void {
		const bounds = handle.getBoundingClientRect();
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 };
		handle.dispatchEvent(new PointerEvent('pointerdown', pointer));
		handle.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: pointer.clientX + deltaX, clientY: pointer.clientY + deltaY }));
		handle.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientX: pointer.clientX + deltaX, clientY: pointer.clientY + deltaY }));
	}

	test('layout size requests resize both floating dimensions with a synchronously relayouting width host', () => {
		const { controller, snapshot } = createHost(true, undefined, true);
		controller.layout(33);
		const before = controller.getSize();
		controller.setSize({ width: 360, height: 460 });
		const after = controller.getSize();
		assert.deepStrictEqual({
			before: [before.width, before.height], after: [after.width, after.height],
			requested: [snapshot().requestedWidth, snapshot().requestedHeight], rendered: [snapshot().width, snapshot().height],
		}, { before: [300, 400], after: [360, 460], requested: [360, 460], rendered: ['360px', '460px'] });
	});

	test('layout size requests honor short content without clobbering the saved limit and preserve compact presentation', async () => {
		const { controller, snapshot, setContentHeight, editor } = createHost(true, 44, true);
		controller.layout(33);
		const short = controller.getSize();
		controller.setSize({ width: short.width + 60, height: short.height + 60 });
		const fitted = { height: snapshot().height, limit: snapshot().requestedHeight, width: snapshot().requestedWidth };
		setContentHeight(1000);
		await timeout(0);
		controller.setPinned(false);
		controller.setSize({ width: 320, height: 420 });
		const compact = { collapsed: editor.querySelector('.floating-details')!.classList.contains('collapsed'), height: snapshot().height };
		controller.setPinned(true);
		assert.deepStrictEqual({
			short: [short.width, short.height], fitted, compact,
			expanded: [controller.getSize().width, controller.getSize().height], limit: snapshot().requestedHeight,
		}, {
			short: [300, 78], fitted: { height: '78px', limit: 400, width: 360 },
			compact: { collapsed: true, height: '34px' }, expanded: [320, 420], limit: 420,
		});
	});

	test('fits short lists without changing the saved height limit and grows or shrinks with content', async () => {
		const { controller, setContentHeight, snapshot, isSizeToContent } = createHost(true, 44);
		controller.layout(33);
		const short = snapshot();
		setContentHeight(1000);
		await timeout(0);
		const large = snapshot();
		setContentHeight(22);
		await timeout(0);
		const shrunk = snapshot();
		setContentHeight(undefined);
		await timeout(0);
		assert.deepStrictEqual({
			short: [short.height, short.layout?.height, short.requestedHeight],
			large: [large.height, large.layout?.height, large.requestedHeight],
			shrunk: [shrunk.height, shrunk.layout?.height, shrunk.requestedHeight],
			unknown: [snapshot().height, snapshot().requestedHeight], sizing: isSizeToContent(),
		}, {
			short: ['78px', 44, 400], large: ['400px', 366, 400], shrunk: ['56px', 22, 400],
			unknown: ['400px', 400], sizing: true,
		});
	});

	test('content fitting preserves the height limit through width resizing, bounds, and reset', async () => {
		const { editor, controller, host, snapshot, setContentHeight, resize } = createHost(true, 44);
		host.setHeight(250);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const sash = widget.querySelector<HTMLElement>('.monaco-sash.vertical:not(.disabled)')!;
		sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 200, bubbles: true }));
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 460, clientY: 200 }));
		mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 460, clientY: 200 }));
		const resized = snapshot();
		const height = widget.querySelector<HTMLElement>('.floating-details-resize-height')!;
		height.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
		const unchanged = snapshot().requestedHeight;
		height.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', keyCode: 36, bubbles: true }));
		const reset = snapshot();
		host.setHeight(200);
		widget.querySelector<HTMLElement>('.monaco-sash.horizontal:not(.disabled)')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const mouseReset = snapshot();
		setContentHeight(1000);
		await timeout(0);
		resize(800, 140);
		controller.layout(33);
		const bounded = snapshot();
		resize(800, 600);
		controller.layout(33);
		assert.deepStrictEqual({
			resized: [resized.requestedWidth, resized.requestedHeight, resized.height], unchanged,
			reset: [reset.requestedHeight, reset.height], mouseReset: [mouseReset.requestedHeight, mouseReset.height],
			bounded: [bounded.height, bounded.requestedHeight],
			restored: [snapshot().height, snapshot().requestedHeight],
		}, {
			resized: [340, 250, '78px'], unchanged: 250, reset: [400, '78px'], mouseReset: [400, '78px'],
			bounded: ['91px', 400], restored: ['400px', 400],
		});
	});

	test('a width-only sash drag preserves the saved height when content grows between mousemoves', async () => {
		const { editor, controller, host, snapshot, setContentHeight } = createHost(true, 44, true);
		host.setHeight(250);
		controller.layout(33);
		const sash = editor.querySelector<HTMLElement>('.floating-details .monaco-sash.vertical:not(.disabled)')!;
		sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 200, bubbles: true }));
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, clientY: 200 }));
		setContentHeight(1000);
		await timeout(0);
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 460, clientY: 200 }));
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 440, clientY: 200 }));
		mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 440, clientY: 200 }));
		await timeout(0);
		assert.deepStrictEqual({
			width: snapshot().requestedWidth, height: snapshot().requestedHeight, rendered: snapshot().height,
		}, { width: 360, height: 250, rendered: '250px' });
	});

	test('content notifications do not expand a collapsed widget or alter its pin state', async () => {
		const { editor, controller, setContentHeight, snapshot, isSizeToContent } = createHost(false, 44);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		setContentHeight(88);
		await timeout(0);
		const compact = snapshot().height;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const preview = snapshot().height;
		controller.setPinned(true);
		setContentHeight(22);
		await timeout(0);
		const pinned = { height: snapshot().height, pressed: widget.querySelector('.floating-details-toggle')?.getAttribute('aria-pressed') };
		controller.hide();
		setContentHeight(1000);
		await timeout(0);
		assert.deepStrictEqual({ compact, preview, pinned, sizing: isSizeToContent(), hidden: widget.style.display }, {
			compact: '34px', preview: '122px', pinned: { height: '56px', pressed: 'true' }, sizing: false, hidden: 'none',
		});
	});

	test('drags the compact widget in both axes without pinning or changing expanded dimensions', () => {
		const { editor, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		const before = widget.getBoundingClientRect();
		const handle = grip.getBoundingClientRect();
		widget.dispatchEvent(new MouseEvent('mouseenter', { clientX: handle.x + handle.width / 2, clientY: handle.y + handle.height / 2 }));
		drag(grip, -100, 80);
		const after = widget.getBoundingClientRect();
		assert.deepStrictEqual({
			movement: [after.x - before.x, after.y - before.y],
			collapsed: widget.classList.contains('collapsed'),
			pinned: widget.querySelector('.action-label')?.getAttribute('aria-pressed'),
			dragging: widget.classList.contains('dragging'),
			preferences: [snapshot().requestedWidth, snapshot().requestedHeight],
		}, { movement: [-100, 80], collapsed: true, pinned: 'false', dragging: false, preferences: [300, 400] });
	});

	test('keeps the grip stationary when expanding upward and rightward from the bottom-left corner', () => {
		const { editor, part, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		drag(grip, -2000, 2000);
		const compact = widget.getBoundingClientRect();
		const headerTop = grip.getBoundingClientRect().top;
		controller.setPinned(true);
		const expanded = widget.getBoundingClientRect();
		const header = grip.getBoundingClientRect();
		const content = part.getBoundingClientRect();
		const widthHandle = widget.querySelector<HTMLElement>('.floating-details-resize-width')!;
		const heightHandle = widget.querySelector<HTMLElement>('.floating-details-resize-height')!;
		assert.deepStrictEqual({
			compact: [compact.left, compact.bottom],
			expanded: [expanded.left, expanded.bottom, expanded.width, expanded.height],
			headerStayed: header.top === headerTop,
			contentAboveHeader: content.bottom <= header.top,
			edges: [mainWindow.getComputedStyle(widthHandle).right, mainWindow.getComputedStyle(heightHandle).top],
			sashes: [...widget.querySelectorAll<HTMLElement>('.monaco-sash:not(.disabled)')].map(sash => sash.classList.contains('vertical') ? 'vertical' : 'horizontal').sort(),
		}, {
			compact: [8, 592], expanded: [8, 592, 300, 400], headerStayed: true, contentAboveHeader: true,
			edges: ['0px', '0px'], sashes: ['horizontal', 'vertical'],
		});
	});

	test('dragging uses client coordinates without accumulating the editor frame border', () => {
		const { editor, controller } = createHost(false);
		Object.assign(editor.style, { border: '1px solid black', boxSizing: 'border-box' });
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const before = widget.getBoundingClientRect();
		drag(widget.querySelector<HTMLElement>('.floating-details-drag-handle')!, -60, 80);
		const after = widget.getBoundingClientRect();
		assert.deepStrictEqual([after.left - before.left, after.top - before.top], [-60, 80]);
	});

	test('dragging an expanded pinned panel preserves its state, dimensions, and position through hide and show', () => {
		const { editor, controller, snapshot } = createHost();
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		drag(widget.querySelector<HTMLElement>('.floating-details-drag-handle')!, -100, 100);
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		controller.onDidOpenItem();
		controller.hide();
		controller.layout(33);
		assert.deepStrictEqual({
			position: [widget.style.right, widget.style.top],
			pinned: widget.querySelector('.action-label')?.getAttribute('aria-pressed'),
			collapsed: widget.classList.contains('collapsed'),
			dimensions: [snapshot().requestedWidth, snapshot().requestedHeight],
		}, { position: ['108px', '141px'], pinned: 'true', collapsed: false, dimensions: [300, 400] });
	});

	test('the drag grip supports keyboard movement, larger steps, reset, and contextual labels without expanding', () => {
		const { editor, controller, setTitle } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		grip.focus();
		const press = (key: string, keyCode: number, shiftKey = false) => grip.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, shiftKey, bubbles: true, cancelable: true }));
		press('ArrowLeft', 37);
		press('ArrowDown', 40, true);
		const moved = [widget.style.right, widget.style.top];
		press('Home', 36);
		const reset = [widget.style.right, widget.style.top];
		press('ArrowLeft', 37, true);
		grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		setTitle('Changes');
		assert.deepStrictEqual({
			moved, reset, doubleClickReset: [widget.style.right, widget.style.top],
			collapsed: widget.classList.contains('collapsed'),
			role: grip.getAttribute('role'), tabIndex: grip.tabIndex, label: grip.getAttribute('aria-label'),
			decorative: grip.querySelector('span')?.getAttribute('aria-hidden'),
			focused: getActiveElement() === grip,
		}, {
			moved: ['18px', '91px'], reset: ['8px', '41px'], doubleClickReset: ['8px', '41px'],
			collapsed: true, role: 'button', tabIndex: 0, label: 'Move Changes. Use Arrow keys to move, Shift for larger steps, or Home to reset.',
			decorative: 'true', focused: true,
		});
	});

	test('keeps dragged positions within the editor when resized and restores the preferred position afterward', () => {
		const { editor, controller, resize, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		drag(widget.querySelector<HTMLElement>('.floating-details-drag-handle')!, -100, 120);
		const original = widget.getBoundingClientRect();
		resize(180, 140);
		controller.layout(33);
		const small = widget.getBoundingClientRect();
		resize(800, 600);
		controller.layout(33);
		const restored = widget.getBoundingClientRect();
		assert.deepStrictEqual({
			contained: small.left >= 8 && small.right <= 172 && small.top >= 41 && small.bottom <= 132,
			restored: [restored.left, restored.top], original: [original.left, original.top],
			preferences: [snapshot().requestedWidth, snapshot().requestedHeight],
		}, { contained: true, restored: [original.left, original.top], original: [original.left, original.top], preferences: [300, 400] });
	});

	test('hiding or disposing during a drag removes pointer monitoring and ignores late pointer events', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true };
		grip.dispatchEvent(new PointerEvent('pointerdown', pointer));
		controller.hide();
		const position = widget.style.cssText;
		mainWindow.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 100, clientY: 100 }));
		mainWindow.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
		const hidden = { unchanged: widget.style.cssText === position, dragging: widget.classList.contains('dragging') };
		controller.layout(33);
		grip.dispatchEvent(new PointerEvent('pointerdown', pointer));
		controller.dispose();
		mainWindow.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 200, clientY: 200 }));
		assert.deepStrictEqual({ hidden, removed: !editor.contains(widget), dragging: widget.classList.contains('dragging') }, {
			hidden: { unchanged: true, dragging: false }, removed: true, dragging: false,
		});
	});

	test('canceling a pointer drag releases monitoring and allows hover previews again', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		const bounds = grip.getBoundingClientRect();
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 };
		grip.dispatchEvent(new PointerEvent('pointerdown', pointer));
		grip.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: pointer.clientX - 50 }));
		grip.dispatchEvent(new PointerEvent('pointercancel', { ...pointer, buttons: 0 }));
		const position = widget.style.cssText;
		grip.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: pointer.clientX - 100 }));
		const released = { dragging: widget.classList.contains('dragging'), unchanged: widget.style.cssText === position };
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		assert.deepStrictEqual({ released, preview: !widget.classList.contains('collapsed') }, {
			released: { dragging: false, unchanged: true }, preview: true,
		});
	});

	test('a preview cannot time out during dragging and uses the exit grace after releasing outside', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true, clientX: 790, clientY: 50 };
		grip.dispatchEvent(new PointerEvent('pointerdown', pointer));
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(300);
		const during = widget.classList.contains('collapsed');
		grip.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 1000, clientY: 50 }));
		grip.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
		await timeout(249);
		const grace = widget.classList.contains('collapsed');
		await timeout(1);
		assert.deepStrictEqual({ during, grace, collapsed: widget.classList.contains('collapsed') }, { during: false, grace: false, collapsed: true });
	}));

	test('Escape cancels a compact-widget drag and restores editor focus', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		grip.focus();
		const pointer = { pointerId: 1, button: 0, buttons: 1, bubbles: true };
		grip.dispatchEvent(new PointerEvent('pointerdown', pointer));
		grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		const position = widget.style.cssText;
		mainWindow.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 100, clientY: 100 }));
		assert.deepStrictEqual({
			unchanged: widget.style.cssText === position, dragging: widget.classList.contains('dragging'),
			collapsed: widget.classList.contains('collapsed'), focused: getActiveElement() === editor,
		}, { unchanged: true, dragging: false, collapsed: true, focused: true });
	});

	test('keyboard resizing grows away from the anchored bottom and left edges', () => {
		const { editor, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		drag(widget.querySelector<HTMLElement>('.floating-details-drag-handle')!, -2000, 2000);
		controller.setPinned(true);
		widget.querySelector('.floating-details-resize-width')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
		widget.querySelector('.floating-details-resize-height')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', keyCode: 38, bubbles: true }));
		const bounds = widget.getBoundingClientRect();
		assert.deepStrictEqual({ dimensions: [snapshot().requestedWidth, snapshot().requestedHeight], edges: [bounds.left, bounds.bottom] }, {
			dimensions: [310, 410], edges: [8, 592],
		});
	});

	for (const corner of [{ x: -2000, y: 2000 }, { x: 2000, y: -2000 }]) {
		test(`keeps content and the header fixed during motion from corner ${corner.x},${corner.y}`, async () => {
			const { editor, part, controller } = createHost(false);
			controller.layout(33);
			const widget = editor.querySelector<HTMLElement>('.floating-details')!;
			const grip = widget.querySelector<HTMLElement>('.floating-details-drag-handle')!;
			drag(grip, corner.x, corner.y);
			editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
			const header = grip.getBoundingClientRect().top;
			controller.setPinned(true);
			const animation = widget.getAnimations()[0];
			assert.ok(animation);
			const before = part.getBoundingClientRect();
			animation.pause();
			animation.currentTime = 75;
			const middle = part.getBoundingClientRect();
			assert.deepStrictEqual({
				content: [middle.left, middle.top], expectedContent: [before.left, before.top],
				header: grip.getBoundingClientRect().top, expectedHeader: header,
			}, { content: [before.left, before.top], expectedContent: [before.left, before.top], header, expectedHeader: header });
			const finished = new Promise(resolve => animation.addEventListener('finish', resolve, { once: true }));
			animation.finish();
			await finished;
			controller.setPinned(false);
			const closing = widget.getAnimations()[0];
			assert.ok(closing);
			closing.pause();
			closing.currentTime = Number(closing.effect!.getTiming().duration) / 2;
			const closingContent = part.getBoundingClientRect();
			assert.deepStrictEqual({
				content: [closingContent.left, closingContent.top],
				header: grip.getBoundingClientRect().top, inert: part.inert,
			}, { content: [before.left, before.top], header, inert: true });
		});
	}

	for (const theme of ['vs-dark', 'vs', 'hc-black', 'hc-light']) {
		test(`uses the chat action widget's surface, border, shadow, and icon colors in ${theme}`, () => {
			const { editor, part, controller } = createHost(false);
			const root = editor.closest<HTMLElement>('.monaco-workbench')!;
			root.classList.add(theme);
			root.style.setProperty('--vscode-editorWidget-background', '#203040');
			root.style.setProperty('--vscode-editorWidget-border', '#506070');
			root.style.setProperty('--vscode-icon-foreground', '#8090a0');
			root.style.setProperty('--vscode-agentsDetail-background', '#aabbcc');
			root.style.setProperty('--vscode-shadow-md', '0 2px 4px #102030');
			const reference = append(root, $('.menu-activity-bar.session-activity-bar.floating'));
			part.style.backgroundColor = 'var(--vscode-agentsDetail-background)';
			controller.layout(33);
			const surface = mainWindow.getComputedStyle(editor.querySelector<HTMLElement>('.floating-details-surface')!);
			const chat = mainWindow.getComputedStyle(reference);
			assert.deepStrictEqual({
				background: surface.backgroundColor, border: surface.borderTopColor,
				shadow: surface.boxShadow,
				icon: mainWindow.getComputedStyle(editor.querySelector<HTMLElement>('.floating-details-icon')!).color,
				body: mainWindow.getComputedStyle(part).backgroundColor,
			}, {
				background: chat.backgroundColor, border: chat.borderTopColor,
				shadow: theme.startsWith('hc-') ? 'none' : chat.boxShadow,
				icon: 'rgb(128, 144, 160)', body: chat.backgroundColor,
			});
		});
	}

	test('starts as a compact floating widget without changing expanded size preferences', () => {
		const { editor, part, controller, snapshot } = createHost(false);
		Object.assign(editor.style, { position: 'relative', width: '800px', height: '600px' });
		controller.layout(33);
		const control = editor.querySelector<HTMLElement>('.action-label')!;
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		assert.deepStrictEqual({
			collapsed: widget.classList.contains('collapsed'),
			width: widget.style.width, height: widget.style.height,
			label: control.getAttribute('aria-label'),
			expanded: control.getAttribute('aria-expanded'),
			tabIndex: control.tabIndex,
			controls: control.getAttribute('aria-controls'),
			body: part.style.display,
			resizeHandles: [...widget.querySelectorAll<HTMLElement>('[role="separator"]')].map(handle => handle.hidden),
			sashes: widget.querySelectorAll('.monaco-sash:not(.disabled)').length,
			preferences: [snapshot().requestedWidth, snapshot().requestedHeight],
		}, {
			collapsed: true, width: 'max-content', height: '34px', label: 'Expand Files',
			expanded: 'false', tabIndex: 0, controls: 'floating-details-test-body', body: 'none',
			resizeHandles: [true, true], sashes: 0, preferences: [300, 400],
		});
	});

	for (const theme of ['vs-dark', 'vs', 'hc-black', 'hc-light']) {
		test(`indicates pin state with its glyph and ARIA state without a persistent background in ${theme}`, () => {
			const { editor, controller } = createHost(false);
			const root = editor.closest<HTMLElement>('.monaco-workbench')!;
			root.classList.add(theme);
			root.style.setProperty('--vscode-toolbar-activeBackground', '#abcdef');
			controller.layout(33);
			const widget = editor.querySelector<HTMLElement>('.floating-details')!;
			const button = widget.querySelector<HTMLElement>('.floating-details-toggle')!;
			widget.dispatchEvent(new MouseEvent('mouseenter'));
			const preview = mainWindow.getComputedStyle(button).backgroundColor;
			button.click();
			const pinned = {
				background: mainWindow.getComputedStyle(button).backgroundColor,
				glyph: !!button.querySelector('.codicon-sessions-floating-details-pinned'),
				pressed: button.getAttribute('aria-pressed'),
			};
			button.click();
			assert.deepStrictEqual({
				preview, pinned,
				unpinned: {
					background: mainWindow.getComputedStyle(button).backgroundColor,
					glyph: !!button.querySelector('.codicon-sessions-floating-details-keep-expanded'),
					pressed: button.getAttribute('aria-pressed'),
				},
			}, {
				preview: 'rgba(0, 0, 0, 0)',
				pinned: { background: 'rgba(0, 0, 0, 0)', glyph: true, pressed: 'true' },
				unpinned: { background: 'rgba(0, 0, 0, 0)', glyph: true, pressed: 'false' },
			});
		});
	}

	test('only exposes the pin toggle while expanded and restores the compact focus target on Escape', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const button = widget.querySelector<HTMLElement>('.floating-details-toggle')!;
		const collapsed = { visible: button.checkVisibility(), tabIndex: widget.tabIndex };
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const preview = {
			visible: button.checkVisibility(), tabIndex: widget.tabIndex,
			icon: !!button.querySelector('.codicon-sessions-floating-details-keep-expanded'),
			label: button.getAttribute('aria-label'),
		};
		button.click();
		const expanded = {
			visible: button.checkVisibility(),
			pinnedIcon: !!button.querySelector('.codicon-sessions-floating-details-pinned'),
			pressed: button.getAttribute('aria-pressed'),
		};
		button.click();
		const unpinned = {
			visible: button.checkVisibility(), pressed: button.getAttribute('aria-pressed'), expanded: button.getAttribute('aria-expanded'),
			pinIcon: !!button.querySelector('.codicon-sessions-floating-details-keep-expanded'),
		};
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({
			collapsed, preview, expanded, unpinned,
			restored: { visible: button.checkVisibility(), tabIndex: widget.tabIndex },
			iconDefault: getIconRegistry().getIcon('sessions-floating-details-keep-expanded')?.defaults,
			pinnedIconDefault: getIconRegistry().getIcon('sessions-floating-details-pinned')?.defaults,
		}, {
			collapsed: { visible: false, tabIndex: 0 },
			preview: { visible: true, tabIndex: -1, icon: true, label: 'Keep Files Expanded' },
			expanded: { visible: true, pinnedIcon: true, pressed: 'true' },
			unpinned: { visible: true, pressed: 'false', expanded: 'true', pinIcon: true },
			restored: { visible: false, tabIndex: 0 }, iconDefault: Codicon.pin, pinnedIconDefault: Codicon.pinned,
		});
	});

	test('pointer exit waits for a short grace period before returning to the compact widget', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, part, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const control = widget.querySelector<HTMLElement>('.action-label')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const preview = { label: control.getAttribute('aria-label'), expanded: control.getAttribute('aria-expanded'), body: part.style.display, height: widget.style.height };
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(249);
		const duringGrace = widget.classList.contains('collapsed');
		await timeout(1);
		assert.deepStrictEqual({ preview, duringGrace, collapsed: widget.classList.contains('collapsed'), body: part.style.display, preferences: [snapshot().requestedWidth, snapshot().requestedHeight] }, {
			preview: { label: 'Keep Files Expanded', expanded: 'true', body: '', height: '400px' },
			duringGrace: false, collapsed: true, body: 'none', preferences: [300, 400],
		});
	}));

	test('re-entering or pinning cancels a pending mouse-exit collapse', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(150);
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(500);
		const reentered = widget.classList.contains('collapsed');
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		controller.setPinned(true);
		await timeout(500);
		assert.deepStrictEqual({
			reentered, pinned: widget.classList.contains('collapsed'),
			label: widget.querySelector('.action-label')?.getAttribute('aria-label'),
		}, { reentered: false, pinned: false, label: 'Unpin Files' });
	}));

	test('opening a file collapses a preview but clicking or expanding a folder does not', () => {
		const { editor, tree, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		tree.focus();
		tree.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const afterFolderClick = widget.classList.contains('collapsed');
		controller.onDidOpenItem();
		assert.deepStrictEqual({
			afterFolderClick, afterOpen: widget.classList.contains('collapsed'),
			focusRestored: getActiveElement() === editor, restores: snapshot().collapses,
		}, { afterFolderClick: false, afterOpen: true, focusRestored: true, restores: 1 });
	});

	for (const phase of ['expanded', 'opening', 'pending dismissal']) {
		test(`item selection instantly collapses an unpinned ${phase} preview without any exit animation`, async () => {
			const { editor, tree, part, controller, snapshot } = createHost(false);
			editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
			controller.layout(33);
			const widget = editor.querySelector<HTMLElement>('.floating-details')!;
			widget.dispatchEvent(new MouseEvent('mouseenter'));
			const opening = widget.getAnimations()[0];
			assert.ok(opening);
			if (phase === 'opening') {
				opening.pause();
				opening.currentTime = 40;
			} else {
				const finished = new Promise(resolve => opening.addEventListener('finish', resolve, { once: true }));
				opening.finish();
				await finished;
			}
			tree.focus();
			if (phase === 'pending dismissal') {
				widget.dispatchEvent(new MouseEvent('mouseleave'));
			}
			controller.onDidOpenItem();
			assert.deepStrictEqual({
				collapsed: widget.classList.contains('collapsed'),
				height: widget.getBoundingClientRect().height,
				animations: widget.getAnimations().length,
				animating: widget.classList.contains('animating'),
				body: part.style.display,
				inert: part.inert,
				expanded: widget.querySelector('.floating-details-toggle')?.getAttribute('aria-expanded'),
				focusedEditor: getActiveElement() === editor,
				preferences: [snapshot().requestedWidth, snapshot().requestedHeight],
				sashes: widget.querySelectorAll('.monaco-sash:not(.disabled)').length,
			}, {
				collapsed: true, height: 34, animations: 0, animating: false,
				body: 'none', inert: false, expanded: 'false', focusedEditor: true,
				preferences: [300, 400], sashes: 0,
			});
		});
	}

	test('item selection preserves pinned motion but instantly collapses after unpinning', () => {
		const { editor, part, controller } = createHost(false);
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const opening = widget.getAnimations()[0];
		assert.ok(opening);
		opening.pause();
		opening.currentTime = 40;
		controller.setPinned(true);
		controller.onDidOpenItem();
		const pinned = {
			sameMotion: widget.getAnimations()[0] === opening,
			expanded: !widget.classList.contains('collapsed'),
			bodyVisible: part.checkVisibility(),
		};
		controller.setPinned(false);
		controller.onDidOpenItem();
		assert.deepStrictEqual({
			pinned, collapsed: widget.classList.contains('collapsed'),
			animations: widget.getAnimations().length, height: widget.getBoundingClientRect().height,
			cancelled: opening.playState, body: part.style.display,
		}, {
			pinned: { sameMotion: true, expanded: true, bodyVisible: true },
			collapsed: true, animations: 0, height: 34, cancelled: 'idle', body: 'none',
		});
	});

	test('unpinning keeps the hovered view expanded and resumes the exit grace period', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, part, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const control = widget.querySelector<HTMLElement>('.action-label')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		control.focus();
		control.click();
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(500);
		controller.onDidOpenItem();
		const pinned = { label: control.getAttribute('aria-label'), expanded: control.getAttribute('aria-expanded'), body: part.style.display };
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const bounds = widget.getBoundingClientRect();
		control.click();
		await timeout(500);
		const unpinned = {
			collapsed: widget.classList.contains('collapsed'), pressed: control.getAttribute('aria-pressed'),
			label: control.getAttribute('aria-label'), focused: getActiveElement() === control,
			dimensions: [widget.getBoundingClientRect().width, widget.getBoundingClientRect().height],
			restores: snapshot().collapses,
		};
		editor.focus();
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(249);
		const duringGrace = widget.classList.contains('collapsed');
		await timeout(1);
		assert.deepStrictEqual({ pinned, unpinned, duringGrace, collapsed: widget.classList.contains('collapsed'), restores: snapshot().collapses }, {
			pinned: { label: 'Unpin Files', expanded: 'true', body: '' },
			unpinned: { collapsed: false, pressed: 'false', label: 'Keep Files Expanded', focused: true, dimensions: [bounds.width, bounds.height], restores: 0 },
			duringGrace: false, collapsed: true, restores: 0,
		});
	}));

	test('pointer exit cannot collapse a preview while its tree keeps keyboard focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, tree, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		tree.focus();
		tree.dispatchEvent(new FocusEvent('focus'));
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(500);
		const focused = {
			expanded: !widget.classList.contains('collapsed'), focus: getActiveElement() === tree,
			restores: snapshot().collapses,
		};
		editor.focus();
		tree.dispatchEvent(new FocusEvent('blur'));
		await timeout(0);
		assert.deepStrictEqual({
			focused, collapsed: widget.classList.contains('collapsed'), focus: getActiveElement() === editor,
		}, { focused: { expanded: true, focus: true, restores: 0 }, collapsed: true, focus: true });
	}));

	test('keyboard focus previews the widget, Enter pins it, and Escape collapses it with editor focus', () => {
		const { editor, controller, snapshot } = createHost(false);
		controller.layout(33);
		const control = editor.querySelector<HTMLElement>('.action-label')!;
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.focus();
		// Background Electron windows can defer native focus events.
		widget.dispatchEvent(new FocusEvent('focus'));
		control.dispatchEvent(new FocusEvent('focus'));
		const preview = control.getAttribute('aria-label');
		const focused = getActiveElement() === control;
		const focusRestores = snapshot().collapses;
		const controlSize = control.getBoundingClientRect();
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		control.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		const pinned = control.getAttribute('aria-label');
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		control.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		const unpinned = { expanded: control.getAttribute('aria-expanded'), pressed: control.getAttribute('aria-pressed'), focused: getActiveElement() === control };
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			preview, pinned, unpinned, focused, focusRestores, controlVisible: controlSize.width > 0 && controlSize.height > 0, collapsed: control.getAttribute('aria-expanded'),
			focusRestored: getActiveElement() === editor, restores: snapshot().collapses,
		}, { preview: 'Keep Files Expanded', pinned: 'Unpin Files', unpinned: { expanded: 'true', pressed: 'false', focused: true }, focused: true, focusRestores: 0, controlVisible: true, collapsed: 'false', focusRestored: true, restores: 1 });
	});

	test('unpinning preserves tree focus and dismisses the preview only after focus leaves', async () => {
		const { editor, tree, controller, snapshot } = createHost();
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		tree.focus();
		tree.dispatchEvent(new FocusEvent('focus'));
		controller.setPinned(false);
		const unpinned = {
			expanded: !widget.classList.contains('collapsed'), focused: getActiveElement() === tree,
			pressed: widget.querySelector('.floating-details-toggle')?.getAttribute('aria-pressed'),
		};
		editor.focus();
		tree.dispatchEvent(new FocusEvent('blur'));
		await timeout(0);
		assert.deepStrictEqual({
			unpinned, collapsed: widget.classList.contains('collapsed'), focusedEditor: getActiveElement() === editor,
			restores: snapshot().collapses,
		}, { unpinned: { expanded: true, focused: true, pressed: 'false' }, collapsed: true, focusedEditor: true, restores: 0 });
	});

	test('moving keyboard focus from the drag grip to the compact widget reveals and focuses Keep Expanded', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const button = widget.querySelector<HTMLElement>('.floating-details-toggle')!;
		widget.querySelector<HTMLElement>('.floating-details-drag-handle')!.focus();
		const collapsed = widget.classList.contains('collapsed');
		widget.focus();
		widget.dispatchEvent(new FocusEvent('focus'));
		assert.deepStrictEqual({
			collapsed, expanded: !widget.classList.contains('collapsed'),
			focused: getActiveElement() === button, visible: button.checkVisibility(),
		}, { collapsed: true, expanded: true, focused: true, visible: true });
	});

	test('focusing the already expanded region does not move focus to its action button', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		widget.focus();
		widget.dispatchEvent(new FocusEvent('focus'));
		assert.deepStrictEqual({ expanded: !widget.classList.contains('collapsed'), focused: getActiveElement() === widget }, {
			expanded: true, focused: true,
		});
	});

	test('keyboard focus leaving an unpinned preview collapses it without stealing focus', async () => {
		const { editor, controller, snapshot } = createHost(false);
		controller.layout(33);
		const control = editor.querySelector<HTMLElement>('.action-label')!;
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.focus();
		widget.dispatchEvent(new FocusEvent('focus'));
		editor.focus();
		control.dispatchEvent(new FocusEvent('blur'));
		await timeout(0);
		assert.deepStrictEqual({
			expanded: control.getAttribute('aria-expanded'),
			focusedEditor: getActiveElement() === editor, restores: snapshot().collapses,
		}, { expanded: 'false', focusedEditor: true, restores: 0 });
	});

	test('collapsing and expanding preserves the resizable frame dimensions', () => {
		const { editor, controller, snapshot } = createHost();
		controller.layout(33);
		controller.setPinned(false);
		const compactHeight = editor.querySelector<HTMLElement>('.floating-details')!.style.height;
		controller.setPinned(true);
		assert.deepStrictEqual({ compactHeight, restored: snapshot() }, {
			compactHeight: '34px',
			restored: { width: '300px', height: '400px', top: '41px', requestedWidth: 300, requestedHeight: 400, collapses: 0, layout: { width: 298, height: 366 } },
		});
	});

	test('uses Fluent reveal/dismiss curves and clips stationary content instead of blanking it during collapse', async () => {
		const { editor, part, controller, snapshot } = createHost();
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const contentBounds = part.getBoundingClientRect();
		controller.setPinned(false);
		const closing = widget.getAnimations()[0];
		assert.ok(closing?.effect instanceof KeyframeEffect);
		const closeFrames = closing.effect.getKeyframes();
		const closingState = {
			duration: closing.effect.getTiming().duration,
			easing: closing.effect.getTiming().easing,
			shrinks: Number.parseFloat(String(closeFrames[0].width)) > Number.parseFloat(String(closeFrames[1].width)),
			heights: closeFrames.map(frame => frame.height),
			contentAnimations: part.getAnimations().length,
			contentVisible: part.checkVisibility(),
			contentInert: part.inert,
			pointerEvents: mainWindow.getComputedStyle(widget).pointerEvents,
			sashes: widget.querySelectorAll('.monaco-sash:not(.disabled)').length,
		};
		closing.pause();
		closing.currentTime = 75;
		const closingContent = part.getBoundingClientRect();
		const closed = new Promise(resolve => closing.addEventListener('finish', resolve, { once: true }));
		closing.finish();
		await closed;
		const compact = {
			width: widget.style.width, height: widget.style.height, animating: widget.classList.contains('animating'),
			contentVisible: part.checkVisibility(), contentInert: part.inert,
		};
		controller.setPinned(true);
		const opening = widget.getAnimations()[0];
		assert.ok(opening?.effect instanceof KeyframeEffect);
		const openFrames = opening.effect.getKeyframes();
		const opened = new Promise(resolve => opening.addEventListener('finish', resolve, { once: true }));
		opening.finish();
		await opened;
		assert.deepStrictEqual({
			closingState, compact,
			stationaryContent: [closingContent.left, closingContent.top, closingContent.width, closingContent.height],
			opening: {
				duration: opening.effect.getTiming().duration, easing: opening.effect.getTiming().easing,
				grows: Number.parseFloat(String(openFrames[0].width)) < Number.parseFloat(String(openFrames[1].width)), heights: openFrames.map(frame => frame.height),
			},
			expanded: { width: widget.style.width, height: widget.style.height, animations: widget.getAnimations().length, sashes: widget.querySelectorAll('.monaco-sash:not(.disabled)').length },
			preferences: [snapshot().requestedWidth, snapshot().requestedHeight],
		}, {
			closingState: {
				duration: 150, easing: 'cubic-bezier(0.9, 0.1, 1, 0.2)', shrinks: true, heights: ['400px', '34px'],
				contentAnimations: 0, contentVisible: true, contentInert: true, pointerEvents: 'none', sashes: 0,
			},
			compact: { width: 'max-content', height: '34px', animating: false, contentVisible: false, contentInert: false },
			stationaryContent: [contentBounds.left, contentBounds.top, contentBounds.width, contentBounds.height],
			opening: { duration: 250, easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)', grows: true, heights: ['34px', '400px'] },
			expanded: { width: '300px', height: '400px', animations: 0, sashes: 2 },
			preferences: [300, 400],
		});
	});

	test('gives short content a faster reveal and dismissal without scaling or sliding the tree', async () => {
		const { editor, part, controller, host } = createHost(false, 44);
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		// The motion is short when neither the width nor the height changes by more than 240px. The compact caption's
		// width depends on the browser's font metrics, so the width is set relative to it.
		host.setWidth(widget.getBoundingClientRect().width + 200);
		controller.setPinned(true);
		const opening = widget.getAnimations()[0];
		assert.ok(opening?.effect instanceof KeyframeEffect);
		const reveal = {
			duration: opening.effect.getTiming().duration, easing: opening.effect.getTiming().easing,
			heights: opening.effect.getKeyframes().map(frame => frame.height),
		};
		const opened = new Promise(resolve => opening.addEventListener('finish', resolve, { once: true }));
		opening.finish();
		await opened;
		controller.setPinned(false);
		const closing = widget.getAnimations()[0];
		assert.ok(closing?.effect instanceof KeyframeEffect);
		assert.deepStrictEqual({
			reveal, dismiss: { duration: closing.effect.getTiming().duration, easing: closing.effect.getTiming().easing },
			tree: { transform: mainWindow.getComputedStyle(part).transform, animations: part.getAnimations().length },
		}, {
			reveal: { duration: 200, easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)', heights: ['34px', '78px'] },
			dismiss: { duration: 100, easing: 'cubic-bezier(0.9, 0.1, 1, 0.2)' },
			tree: { transform: 'none', animations: 0 },
		});
	});

	test('measures a changed compact caption before choosing its motion distance and duration', () => {
		const { editor, controller, host, setTitle } = createHost(false, 44);
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		setTitle('A Much Longer View Name');
		const compact = widget.getBoundingClientRect();
		host.setWidth(compact.width + 230);
		controller.setPinned(true);
		const opening = widget.getAnimations()[0];
		assert.ok(opening?.effect instanceof KeyframeEffect);
		assert.deepStrictEqual({
			duration: opening.effect.getTiming().duration,
			continuous: Math.abs(Number.parseFloat(String(opening.effect.getKeyframes()[0].width)) - compact.width) < 0.1,
		}, { duration: 200, continuous: true });
	});

	test('rapid hover reversal starts from the current size and pinning does not restart the motion', () => {
		const { editor, part, controller } = createHost();
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		controller.setPinned(false);
		const closing = widget.getAnimations()[0];
		assert.ok(closing);
		closing.pause();
		closing.currentTime = 75;
		const partial = widget.getBoundingClientRect();
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const opening = widget.getAnimations()[0];
		assert.ok(opening?.effect instanceof KeyframeEffect);
		const frames = opening.effect.getKeyframes();
		controller.setPinned(true);
		const sameAfterPin = widget.getAnimations()[0] === opening;
		controller.setPinned(false);
		assert.deepStrictEqual({
			cancelled: closing.playState,
			continuesWidth: Math.abs(Number.parseFloat(String(frames[0].width)) - partial.width) < 0.1,
			continuesHeight: Math.abs(Number.parseFloat(String(frames[0].height)) - partial.height) < 0.1,
			target: [frames[1].width, frames[1].height],
			duration: opening.effect.getTiming().duration,
			contentInteractive: !part.inert && part.checkVisibility(),
			sameAfterPin, sameAfterUnpin: widget.getAnimations()[0] === opening,
		}, {
			cancelled: 'idle', continuesWidth: true, continuesHeight: true, target: ['300px', '400px'],
			duration: Math.max(50, Math.round(250 * Math.max(Math.abs(300 - partial.width), Math.abs(400 - partial.height)) / 366)),
			contentInteractive: true, sameAfterPin: true, sameAfterUnpin: true,
		});
	});

	test('reverses a partial reveal with a shorter dismissal and keeps the content clipped and inert', () => {
		const { editor, part, controller } = createHost(false);
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		controller.setPinned(true);
		const opening = widget.getAnimations()[0];
		assert.ok(opening);
		opening.pause();
		opening.currentTime = 25;
		const partial = widget.getBoundingClientRect();
		const content = part.getBoundingClientRect();
		controller.setPinned(false);
		const closing = widget.getAnimations()[0];
		assert.ok(closing?.effect instanceof KeyframeEffect);
		const frames = closing.effect.getKeyframes();
		closing.pause();
		closing.currentTime = 25;
		const clippedContent = part.getBoundingClientRect();
		assert.deepStrictEqual({
			cancelled: opening.playState,
			continuous: Math.abs(Number.parseFloat(String(frames[0].width)) - partial.width) < 0.1 && Math.abs(Number.parseFloat(String(frames[0].height)) - partial.height) < 0.1,
			faster: Number(closing.effect.getTiming().duration) < 150,
			content: [clippedContent.left, clippedContent.top, clippedContent.width, clippedContent.height],
			inert: part.inert,
		}, {
			cancelled: 'idle', continuous: true, faster: true,
			content: [content.left, content.top, content.width, content.height], inert: true,
		});
	});

	test('retargets an active reveal smoothly when intrinsic content height arrives', async () => {
		const { editor, controller, setContentHeight, snapshot } = createHost(false);
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		controller.setPinned(true);
		const opening = widget.getAnimations()[0];
		assert.ok(opening);
		opening.pause();
		opening.currentTime = 60;
		const partial = widget.getBoundingClientRect();
		setContentHeight(44);
		await timeout(0);
		const retargeted = widget.getAnimations()[0];
		assert.ok(retargeted?.effect instanceof KeyframeEffect);
		const frames = retargeted.effect.getKeyframes();
		const retarget = {
			cancelled: opening.playState,
			continuous: Math.abs(Number.parseFloat(String(frames[0].width)) - partial.width) < 0.1 && Math.abs(Number.parseFloat(String(frames[0].height)) - partial.height) < 0.1,
			target: [frames[1].width, frames[1].height],
		};
		const finished = new Promise(resolve => retargeted.addEventListener('finish', resolve, { once: true }));
		retargeted.finish();
		await finished;
		assert.deepStrictEqual({ retarget, height: widget.style.height, preference: snapshot().requestedHeight }, {
			retarget: { cancelled: 'idle', continuous: true, target: ['300px', '78px'] }, height: '78px', preference: 400,
		});
	});

	for (const cancel of ['reduced motion', 'layout', 'hide', 'dispose']) {
		test(`cleans up clipped exit content immediately on ${cancel}`, () => {
			const { editor, part, controller, setReducedMotion } = createHost();
			editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
			controller.layout(33);
			const widget = editor.querySelector<HTMLElement>('.floating-details')!;
			controller.setPinned(false);
			const closing = widget.getAnimations()[0];
			assert.ok(closing);
			if (cancel === 'reduced motion') {
				setReducedMotion(true);
			} else if (cancel === 'layout') {
				controller.layout(33);
			} else if (cancel === 'hide') {
				controller.hide();
			} else {
				controller.dispose();
			}
			assert.deepStrictEqual({
				animation: closing.playState, animating: widget.classList.contains('animating'),
				content: part.style.display, inert: part.inert,
			}, { animation: 'idle', animating: false, content: 'none', inert: false });
		});
	}

	test('reduced motion skips transitions and cancels an in-progress transition immediately', () => {
		const { editor, controller, setReducedMotion } = createHost();
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		setReducedMotion(true);
		controller.setPinned(false);
		const reduced = { width: widget.style.width, height: widget.style.height, animations: widget.getAnimations().length };
		setReducedMotion(false);
		controller.setPinned(true);
		const animation = widget.getAnimations()[0];
		assert.ok(animation);
		setReducedMotion(true);
		assert.deepStrictEqual({
			reduced,
			cancelled: animation.playState,
			expanded: { width: widget.style.width, height: widget.style.height, animations: widget.getAnimations().length, animating: widget.classList.contains('animating') },
		}, {
			reduced: { width: 'max-content', height: '34px', animations: 0 },
			cancelled: 'idle',
			expanded: { width: '300px', height: '400px', animations: 0, animating: false },
		});
	});

	test('hiding the surface dismisses previews but preserves explicitly pinned state', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		controller.hide();
		controller.layout(33);
		const restoredPreview = widget.classList.contains('collapsed');
		controller.setPinned(true);
		controller.hide();
		controller.layout(33);
		assert.deepStrictEqual({ restoredPreview, restoredPinned: widget.classList.contains('collapsed') }, {
			restoredPreview: true, restoredPinned: false,
		});
	});

	test('view focus commands reveal floating content before the tree is focused', async () => {
		const calls: string[] = [];
		const open = sinon.stub(AbstractPaneCompositePart.prototype, 'openPaneComposite').callsFake(async (_id, focus) => {
			calls.push(`open:${focus}`);
			return undefined;
		});
		store.add(toDisposable(() => open.restore()));
		const host = { beforeFocus: () => calls.push('reveal') };
		const openPane = Reflect.get(DesktopAuxiliaryBarPart.prototype, 'openPaneComposite') as (this: typeof host, id: string, focus: boolean) => ReturnType<DesktopAuxiliaryBarPart['openPaneComposite']>;
		await openPane.call(host, 'files', false);
		await openPane.call(host, 'files', true);
		assert.deepStrictEqual(calls, ['open:false', 'reveal', 'open:true']);
	});

	test('opening an individual view reveals and pins floating details before focusing its tree', async () => {
		const { editor, tree, part, controller } = createHost(false);
		controller.layout(33);
		const calls: string[] = [];
		const view = upcastPartial<ViewPane>({
			id: 'files',
			setExpanded: () => false,
			focus: () => {
				calls.push(part.style.display === 'none' ? 'focus:hidden' : 'focus:visible');
				tree.focus();
			},
		});
		const container = upcastPartial<ViewPaneContainer>({ getView: () => view });
		Object.setPrototypeOf(container, ViewPaneContainer.prototype);
		const composite = upcastPartial<PaneComposite>({});
		Object.setPrototypeOf(composite, PaneComposite.prototype);
		Reflect.set(composite, 'viewPaneContainer', container);
		let activeComposite: PaneComposite | undefined = composite;
		const auxiliaryBar = upcastPartial<DesktopAuxiliaryBarPart>({
			getActivePaneComposite: () => activeComposite,
			beforeFocus: () => { calls.push('reveal'); controller.setPinned(true); },
		});
		Object.setPrototypeOf(auxiliaryBar, DesktopAuxiliaryBarPart.prototype);
		Reflect.set(auxiliaryBar, 'contentHeightListener', store.add(new MutableDisposable()));
		Reflect.set(auxiliaryBar, 'focusPreparation', store.add(new MutableDisposable()));
		Reflect.set(auxiliaryBar, '_onDidChangeContentHeight', store.add(new Emitter<void>()));
		auxiliaryBar.setSizeToContent(false);
		const open = sinon.stub(AbstractPaneCompositePart.prototype, 'openPaneComposite').callsFake(async (_id, focus) => {
			calls.push(`open:${focus}`);
			return composite;
		});
		store.add(toDisposable(() => open.restore()));
		const viewsHost = {
			viewDescriptorService: {
				getViewContainerByViewId: () => ({ id: 'files-container' }),
				getViewContainerModel: () => ({ activeViewDescriptors: [{ id: 'files' }] }),
				getViewContainerLocation: () => ViewContainerLocation.AuxiliaryBar,
			},
			paneCompositeService: {
				getPaneComposite: () => ({ id: 'files-container', name: 'Files' }),
				openPaneComposite: (id: string, _location: ViewContainerLocation, focus?: boolean) => auxiliaryBar.openPaneComposite(id, focus),
			},
		};
		Object.setPrototypeOf(viewsHost, ViewsService.prototype);
		const openView = Reflect.get(ViewsService.prototype, 'openView') as (this: typeof viewsHost, id: string, focus: boolean) => Promise<IView | null>;
		await openView.call(viewsHost, 'files', false);
		const nonFocusingOpen = editor.querySelector('.floating-details')!.classList.contains('collapsed');
		const opened = await openView.call(viewsHost, 'files', true);
		assert.deepStrictEqual({
			nonFocusingOpen, opened: opened === view, focused: getActiveElement() === tree,
			pinned: editor.querySelector('.floating-details-toggle')?.getAttribute('aria-pressed'), calls,
		}, { nonFocusingOpen: true, opened: true, focused: true, pinned: 'true', calls: ['open:undefined', 'open:undefined', 'reveal', 'focus:visible'] });

		activeComposite = undefined;
		auxiliaryBar.setSizeToContent(false);
		controller.setPinned(false);
		controller.hide();
		controller.layout(33);
		calls.length = 0;
		container.openView('files', true);
		assert.deepStrictEqual(calls, ['focus:hidden']);
	});

	test('focus preparation is opt-in and is released without changing ordinary container focus', () => {
		const calls: string[] = [];
		const view = upcastPartial<ViewPane>({ isExpanded: () => true, focus: () => calls.push('focus') });
		const container = upcastPartial<ViewPaneContainer>({});
		Object.setPrototypeOf(container, ViewPaneContainer.prototype);
		Reflect.set(container, 'paneItems', [{ pane: view }]);
		container.focus();
		const preparation = store.add(container.setFocusPreparation(() => calls.push('prepare')));
		container.focus();
		preparation.dispose();
		container.focus();
		assert.deepStrictEqual(calls, ['focus', 'prepare', 'focus', 'focus']);
	});

	test('a preview stays open during resize and uses the exit grace period after releasing outside it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { editor, controller, snapshot } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		const sash = widget.querySelector<HTMLElement>('.monaco-sash.vertical:not(.disabled)')!;
		sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 200, bubbles: true }));
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, clientY: 200 }));
		const duringDrag = widget.classList.contains('collapsed');
		mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 480, clientY: 200 }));
		const afterRelease = widget.classList.contains('collapsed');
		await timeout(250);
		assert.deepStrictEqual({ duringDrag, afterRelease, afterDrag: widget.classList.contains('collapsed'), preferences: [snapshot().requestedWidth, snapshot().requestedHeight] }, {
			duringDrag: false, afterRelease: false, afterDrag: true, preferences: [320, 400],
		});
	}));

	test('late resize events cannot reopen a hidden floating surface', () => {
		const { editor, controller, snapshot } = createHost();
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const sash = widget.querySelector<HTMLElement>('.monaco-sash.vertical:not(.disabled)')!;
		sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, clientY: 200, bubbles: true }));
		controller.hide();
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 450, clientY: 200 }));
		mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 450, clientY: 200 }));
		assert.deepStrictEqual({ display: widget.style.display, preferences: [snapshot().requestedWidth, snapshot().requestedHeight] }, {
			display: 'none', preferences: [300, 400],
		});
	});

	test('overlays the existing tree below tabs and restores it when hidden or disposed', () => {
		const { editor, part, tree, controller, snapshot } = createHost();
		tree.focus();
		controller.layout(33);
		const overlay = snapshot();
		const focusedInOverlay = getActiveElement() === tree;
		const isolated = editor.classList.contains('floating-details-visible');
		controller.hide();
		const restored = part.parentElement === editor && getActiveElement() === tree;
		const restoredStacking = !editor.classList.contains('floating-details-visible');
		controller.layout(33);
		controller.dispose();
		assert.deepStrictEqual({
			overlay, focusedInOverlay, isolated, restored, restoredStacking,
			disposed: part.parentElement === editor && !editor.querySelector('.floating-details'),
			disposedStacking: !editor.classList.contains('floating-details-visible'),
		}, {
			overlay: { width: '300px', height: '400px', top: '41px', requestedWidth: 300, requestedHeight: 400, collapses: 0, layout: { width: 298, height: 366 } },
			focusedInOverlay: true, isolated: true, restored: true, restoredStacking: true, disposed: true, disposedStacking: true,
		});
	});

	for (const glass of [false, true]) {
		test(`keeps editor scrollbars behind the ${glass ? 'frosted' : 'solid'} floating panel without blocking either scrollbar`, () => {
			const { editor, part, controller, resize } = createHost();
			const width = Math.min(800, mainWindow.document.documentElement.clientWidth);
			const height = Math.min(600, mainWindow.document.documentElement.clientHeight);
			resize(width, height);
			const root = editor.closest<HTMLElement>('.monaco-workbench')!;
			root.classList.toggle('modern-ui-frosted-glass', glass);
			root.style.setProperty('--vscode-spacing-size80', '8px');
			root.style.setProperty('--vscode-strokeThickness', '1px');
			Object.assign(root.style, { position: 'fixed', top: '0', left: '0', width: `${width}px`, height: `${height}px` });
			Object.assign(editor.style, { position: 'relative', overflow: 'hidden' });
			const content = append(editor, $('.content'));
			Object.assign(content.style, { position: 'absolute', inset: '0' });
			const group = append(content, $('.editor-group-container'));
			Object.assign(group.style, { position: 'absolute', inset: '0' });
			const pane = append(group, $('.editor-container'));
			Object.assign(pane.style, { position: 'absolute', inset: '0' });
			const editorScroll = append(pane, $('.monaco-scrollable-element'));
			Object.assign(editorScroll.style, { position: 'absolute', inset: '0' });
			const editorScrollbar = append(editorScroll, $('.scrollbar.vertical.visible'));
			Object.assign(editorScrollbar.style, { position: 'absolute', right: '0', top: '0', width: '14px', height: '100%' });
			const panelScroll = append(part, $('.monaco-scrollable-element'));
			Object.assign(panelScroll.style, { position: 'absolute', inset: '0' });
			const panelScrollbar = append(panelScroll, $('.scrollbar.vertical.visible'));
			Object.assign(panelScrollbar.style, { position: 'absolute', right: '0', top: '0', width: '14px', height: '100%' });

			controller.layout(33);
			const overlay = editor.querySelector<HTMLElement>('.floating-details')!;
			const panelBounds = panelScrollbar.getBoundingClientRect();
			const scrollbarBounds = editorScrollbar.getBoundingClientRect();
			const left = Math.max(panelBounds.left, scrollbarBounds.left);
			const right = Math.min(panelBounds.right, scrollbarBounds.right);
			assert.ok(right > left, 'The scrollbar tracks must overlap for this regression test');
			const x = (left + right) / 2;
			const y = panelBounds.top + 60;
			const panelOnTop = panelScrollbar.contains(mainWindow.document.elementFromPoint(x, y));
			const outsideY = (overlay.getBoundingClientRect().bottom + scrollbarBounds.bottom) / 2;
			const editorOutsidePanel = editorScrollbar.contains(mainWindow.document.elementFromPoint(x, outsideY));
			controller.hide();
			part.style.display = 'none';
			const editorAfterCollapse = editorScrollbar.contains(mainWindow.document.elementFromPoint(x, y));
			assert.deepStrictEqual({ panelOnTop, editorOutsidePanel, editorAfterCollapse }, {
				panelOnTop: true, editorOutsidePanel: true, editorAfterCollapse: true,
			});
		});
	}

	test('constrains both dimensions without losing requested sizes on window resize', () => {
		const { controller, resize, snapshot } = createHost();
		resize(180, 140);
		controller.layout(33);
		const small = snapshot();
		resize(800, 600);
		controller.layout(33);
		const restored = snapshot();
		resize(0, 0);
		controller.layout(33);
		assert.deepStrictEqual({ small, restored, zero: snapshot() }, {
			small: { width: '164px', height: '91px', top: '41px', requestedWidth: 300, requestedHeight: 400, collapses: 0, layout: { width: 162, height: 57 } },
			restored: { width: '300px', height: '400px', top: '41px', requestedWidth: 300, requestedHeight: 400, collapses: 0, layout: { width: 298, height: 366 } },
			zero: { width: '0px', height: '0px', top: '41px', requestedWidth: 300, requestedHeight: 400, collapses: 0, layout: { width: 0, height: 0 } },
		});
	});

	test('supports keyboard resizing, reset, bounds, and Escape with focus restoration', () => {
		const { editor, controller, snapshot } = createHost();
		controller.layout(33);
		const width = editor.querySelector<HTMLElement>('.floating-details-resize-width')!;
		const height = editor.querySelector<HTMLElement>('.floating-details-resize-height')!;
		const press = (target: HTMLElement, key: string, keyCode: number, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, shiftKey, bubbles: true, cancelable: true }));
		width.focus();
		press(width, 'ArrowLeft', 37, true);
		height.focus();
		press(height, 'ArrowDown', 40);
		const resized = snapshot();
		press(width, 'Home', 36);
		press(height, 'Home', 36);
		const reset = snapshot();
		for (let i = 0; i < 20; i++) {
			press(width, 'ArrowRight', 39, true);
			press(height, 'ArrowUp', 38, true);
		}
		const bounded = snapshot();
		press(height, 'Escape', 27);
		assert.deepStrictEqual({
			resized: [resized.requestedWidth, resized.requestedHeight],
			reset: [reset.requestedWidth, reset.requestedHeight],
			bounded: [bounded.requestedWidth, bounded.requestedHeight],
			aria: [width.getAttribute('role'), width.getAttribute('aria-valuenow'), height.getAttribute('aria-valuenow')],
			collapses: snapshot().collapses,
			focusRestored: getActiveElement() === editor,
		}, {
			resized: [350, 410], reset: [300, 400], bounded: [220, 160],
			aria: ['separator', '220', '160'], collapses: 1, focusRestored: true,
		});
	});

	test('resizes from both mouse sashes and resets dimensions on double click', () => {
		const { editor, controller, snapshot } = createHost();
		controller.layout(33);
		const width = editor.querySelector<HTMLElement>('.floating-details .monaco-sash.vertical:not(.disabled)')!;
		const height = editor.querySelector<HTMLElement>('.floating-details .monaco-sash.horizontal:not(.disabled)')!;
		const drag = (handle: HTMLElement, x: number, y: number, toX: number, toY: number) => {
			handle.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
			mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: toX, clientY: toY, bubbles: true }));
			mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: toX, clientY: toY, bubbles: true }));
		};
		drag(width, 500, 200, 460, 200);
		drag(height, 650, 440, 650, 490);
		const resized = snapshot();
		width.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		height.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const reset = snapshot();
		assert.deepStrictEqual({ resized: [resized.requestedWidth, resized.requestedHeight], reset: [reset.requestedWidth, reset.requestedHeight] }, {
			resized: [340, 450], reset: [300, 400],
		});
	});

	test('uses a passive contextual caption beside the labelled pin toggle', () => {
		const { editor, controller, snapshot } = createHost();
		controller.layout(33);
		const button = editor.querySelector<HTMLElement>('[aria-label="Unpin Files"]')!;
		const pinnedIcon = button.querySelector('.floating-details-state-icon')?.classList.contains('codicon-sessions-floating-details-pinned');
		button.focus();
		button.click();
		assert.deepStrictEqual({
			caption: editor.querySelector('.floating-details-title')?.textContent,
			label: button.textContent,
			pinnedIcon,
			icon: editor.querySelector('.floating-details-icon')?.classList.contains('codicon-files'),
			noChevron: !button.querySelector('.codicon-chevron-down'),
			semibold: mainWindow.getComputedStyle(editor.querySelector<HTMLElement>('.floating-details-title')!).fontWeight,
			decorative: editor.querySelector('.floating-details-icon')?.getAttribute('aria-hidden'),
			role: button.getAttribute('role'),
			collapses: snapshot().collapses,
			focused: getActiveElement() === button,
		}, {
			caption: 'Files', label: '', pinnedIcon: true, icon: true, noChevron: true, semibold: '600', decorative: 'true', role: 'button', collapses: 0, focused: true,
		});
	});

	test('header and caption clicks never change pin state; only the icon button toggles it', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const header = widget.querySelector<HTMLElement>('.floating-details-header')!;
		const caption = widget.querySelector<HTMLElement>('.floating-details-caption')!;
		const title = caption.querySelector<HTMLElement>('.floating-details-title')!;
		const viewIcon = caption.querySelector<HTMLElement>('.floating-details-icon')!;
		const button = header.querySelector<HTMLElement>('.floating-details-toggle')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		for (const element of [header, caption, title, viewIcon]) {
			element.click();
		}
		const preview = { pinned: button.getAttribute('aria-pressed'), collapsed: widget.classList.contains('collapsed') };
		button.click();
		for (const element of [header, caption, title, viewIcon]) {
			element.click();
		}
		const pinned = { pinned: button.getAttribute('aria-pressed'), collapsed: widget.classList.contains('collapsed') };
		const bounds = button.getBoundingClientRect();
		button.click();
		assert.deepStrictEqual({
			preview, pinned, collapsed: widget.classList.contains('collapsed'),
			titleInsideButton: button.contains(title),
			captionRole: caption.getAttribute('role'),
			captionCursor: mainWindow.getComputedStyle(caption).cursor,
			captionBackground: mainWindow.getComputedStyle(caption).backgroundColor,
			buttonSize: [bounds.width, bounds.height],
		}, {
			preview: { pinned: 'false', collapsed: false }, pinned: { pinned: 'true', collapsed: false }, collapsed: false,
			titleInsideButton: false, captionRole: null, captionCursor: 'default', captionBackground: 'rgba(0, 0, 0, 0)',
			buttonSize: [24, 24],
		});
	});

	test('Escape does not immediately reopen the caption underneath the pointer', () => {
		const { editor, controller } = createHost(false);
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const button = widget.querySelector<HTMLElement>('.floating-details-toggle')!;
		const caption = widget.querySelector<HTMLElement>('.floating-details-caption')!;
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		button.click();
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		caption.dispatchEvent(new MouseEvent('mouseenter', { relatedTarget: button }));
		const minimized = widget.classList.contains('collapsed');
		widget.dispatchEvent(new MouseEvent('mouseleave'));
		widget.dispatchEvent(new MouseEvent('mouseenter'));
		assert.deepStrictEqual({ minimized, reopened: !widget.classList.contains('collapsed'), visible: button.checkVisibility() }, {
			minimized: true, reopened: true, visible: true,
		});
	});

	test('updates the caption, region, action, and resize labels when the active view changes', () => {
		const { editor, controller, setTitle } = createHost();
		controller.layout(33);
		setTitle('Changes');
		assert.deepStrictEqual({
			caption: editor.querySelector('.floating-details-title')?.textContent,
			icon: editor.querySelector('.floating-details-icon')?.classList.contains('codicon-diff'),
			region: editor.querySelector('.floating-details')?.getAttribute('aria-label'),
			action: editor.querySelector('.action-label')?.getAttribute('aria-label'),
			width: editor.querySelector('.floating-details-resize-width')?.getAttribute('aria-label'),
			height: editor.querySelector('.floating-details-resize-height')?.getAttribute('aria-label'),
		}, {
			caption: 'Changes', icon: true, region: 'Changes', action: 'Unpin Changes',
			width: 'Resize Changes Width. Use Left and Right Arrow keys.',
			height: 'Resize Changes Height. Use Up and Down Arrow keys.',
		});
	});

	test('marks the floating panel as opaque only while Changes is active', () => {
		const { editor, controller, setChangesViewActive } = createHost();
		controller.layout(33);
		const widget = editor.querySelector<HTMLElement>('.floating-details')!;
		const states = [widget.classList.contains('changes-view-active')];
		setChangesViewActive(true);
		states.push(widget.classList.contains('changes-view-active'));
		setChangesViewActive(false);
		states.push(widget.classList.contains('changes-view-active'));

		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('floating contents do not inherit the pane reveal slide or fade', () => {
		const { editor, part, controller } = createHost();
		editor.closest('.monaco-workbench')!.classList.add('monaco-enable-motion');
		controller.layout(33);
		const style = mainWindow.getComputedStyle(part);
		assert.deepStrictEqual({
			duration: style.transitionDuration,
			margins: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft],
			opacity: style.opacity,
			animations: part.getAnimations().length,
		}, { duration: '0s', margins: ['0px', '0px', '0px', '0px'], opacity: '1', animations: 0 });
	});

	test('clears floating left/bottom anchors before docking the existing tree on the right', () => {
		const { editor, part, host, auxiliaryBarPart, accessibilityService } = createHost(false);
		let floating = true;
		const controller = store.add(new DockedAuxiliaryBarController(editor, upcastPartial<Part>(auxiliaryBarPart), {
			getPosition: () => 'right',
			getHeight: () => 240, setHeight: () => { }, getEditorContentTop: () => 65,
			getWidth: host.getWidth, setWidth: host.setWidth,
			isEditorAreaVisible: () => true, isEditorVisible: () => true, isAuxiliaryBarVisible: () => true,
			hideAuxiliaryBar: host.focusEditor, setEditorContentInsets: () => { }, getTabsHeight: () => 33,
		}, {
			isEnabled: () => floating,
			createController: () => new FloatingAuxiliaryBarController(editor, auxiliaryBarPart, host, accessibilityService, NullHoverService),
		}));
		controller.layout();
		const grip = editor.querySelector<HTMLElement>('.floating-details-drag-handle')!;
		drag(grip, -2000, 2000);
		controller.revealFloatingDetails();
		controller.layout();
		const anchored = [part.style.left, part.style.bottom];
		floating = false;
		controller.layout();
		assert.deepStrictEqual({
			anchored, docked: [part.style.left, part.style.bottom, part.style.right],
			x: part.getBoundingClientRect().left - editor.getBoundingClientRect().left,
		}, { anchored: ['0px', '32px'], docked: ['', '', '0px'], x: 500 });
	});

	test('switches docked and floating presentations without replacing the tree or reserving editor width', () => {
		const { editor, part, tree, host, auxiliaryBarPart, accessibilityService } = createHost();
		let floating = true;
		let editorVisible = true;
		let auxiliaryBarVisible = true;
		let inset = -1;
		const controller = store.add(new DockedAuxiliaryBarController(editor, upcastPartial<Part>(auxiliaryBarPart), {
			getPosition: () => 'right',
			getHeight: () => 240, setHeight: () => { }, getEditorContentTop: () => 65,
			getWidth: host.getWidth, setWidth: host.setWidth,
			isEditorAreaVisible: () => true,
			isEditorVisible: () => editorVisible,
			isAuxiliaryBarVisible: () => auxiliaryBarVisible,
			hideAuxiliaryBar: host.focusEditor,
			setEditorContentInsets: value => { inset = value; },
			getTabsHeight: () => 33,
		}, {
			isEnabled: () => floating,
			createController: () => new FloatingAuxiliaryBarController(editor, auxiliaryBarPart, host, accessibilityService, NullHoverService),
		}));
		controller.layout();
		const overlaid = { inset, floating: part.classList.contains('floating-auxiliarybar') };
		floating = false;
		controller.layout();
		const docked = { inset, parent: part.parentElement === editor, tree: part.firstChild === tree };
		floating = true;
		editorVisible = false;
		controller.layout();
		const detailsOnly = { inset, width: part.style.width, floating: part.classList.contains('floating-auxiliarybar') };
		auxiliaryBarVisible = false;
		controller.layout();
		assert.deepStrictEqual({ overlaid, docked, detailsOnly, hidden: part.style.display }, {
			overlaid: { inset: 0, floating: true },
			docked: { inset: 300, parent: true, tree: true },
			detailsOnly: { inset: 800, width: '800px', floating: false },
			hidden: 'none',
		});
	});
});
