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

suite('Sessions - Docked Details Position', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHost() {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.dock-detail-panel'));
		store.add(toDisposable(() => root.remove()));
		const editor = append(root, $('.part.editor'));
		const part = append(editor, $('.part.auxiliarybar'));
		Object.defineProperties(editor, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
		editor.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
		let position: DetailsPosition = 'right';
		let height = 200;
		let visible = true;
		let editorVisible = true;
		let floating = false;
		let collapses = 0;
		let insets = [0, 0, 0];
		let lastLayout: number[] = [];
		const auxiliaryBarPart = upcastPartial<Part>({
			getContainer: () => part,
			layout: (width, height, top, left) => { part.style.height = ''; lastLayout = [width, height, top, left]; },
		});
		const host: IDockedAuxiliaryBarHost = {
			getPosition: () => position,
			getWidth: () => 260, setWidth: () => { },
			getHeight: () => height, setHeight: value => { height = value; },
			isEditorAreaVisible: () => true,
			isEditorVisible: () => editorVisible,
			isAuxiliaryBarVisible: () => visible,
			hideAuxiliaryBar: () => { visible = false; collapses++; },
			setEditorContentInsets: (right, top, bottom) => { insets = [right, top, bottom]; },
			getTabsHeight: () => 33,
			getEditorContentTop: () => 65,
		};
		const controller = store.add(new DockedAuxiliaryBarController(editor, auxiliaryBarPart, host, {
			isEnabled: () => floating,
			createController: () => new FloatingAuxiliaryBarController(editor, auxiliaryBarPart, {
				getTitle: () => 'Files', getIcon: () => undefined, onDidChangeTitle: Event.None,
				getWidth: () => 260, setWidth: () => { },
				getHeight: () => 400, setHeight: () => { },
				getContentHeight: () => undefined, onDidChangeContentHeight: Event.None, setSizeToContent: () => { },
				focusEditor: () => { },
			}, upcastPartial<IAccessibilityService>({ isMotionReduced: () => true, onDidChangeReducedMotion: Event.None }), NullHoverService),
		}));
		return {
			editor, part, controller,
			setPosition: (value: DetailsPosition) => { position = value; controller.layout(); },
			setEditorVisible: (value: boolean) => { editorVisible = value; controller.layout(); },
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
		setPosition('top');
		const top = { ...snapshot(), allocatedHeight: part.style.height };
		setPosition('bottom');
		const bottom = { ...snapshot(), allocatedHeight: part.style.height };
		setPosition('right');
		assert.deepStrictEqual({ right, top, bottom, restored: snapshot(), parentPreserved: part.parentElement === editor }, {
			right: { insets: [260, 0, 0], layout: [260, 567, 33, 540], requestedHeight: 200, collapses: 0 },
			top: { insets: [0, 200, 0], layout: [800, 199, 65, 0], requestedHeight: 200, collapses: 0, allocatedHeight: '200px' },
			bottom: { insets: [0, 0, 200], layout: [800, 199, 400, 0], requestedHeight: 200, collapses: 0, allocatedHeight: '200px' },
			restored: right, parentPreserved: true,
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
					insets: position === 'top' ? [0, 240, 0] : [0, 0, 240],
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
			state: { insets: [0, 0, 0], layout: [800, 566, 33, 0], requestedHeight: 200, collapses: 0 }, enabledSashes: 0,
		});
	});

	test('floating presentation overrides stacking and restores the selected position when disabled', () => {
		const { editor, part, setPosition, setFloating, snapshot } = createHost();
		setPosition('top');
		setFloating(true);
		const floating = { insets: snapshot().insets, overlay: part.classList.contains('floating-auxiliarybar') };
		setFloating(false);
		assert.deepStrictEqual({ floating, restored: snapshot(), parentPreserved: part.parentElement === editor }, {
			floating: { insets: [0, 0, 0], overlay: true },
			restored: { insets: [0, 200, 0], layout: [800, 199, 65, 0], requestedHeight: 200, collapses: 0 },
			parentPreserved: true,
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
