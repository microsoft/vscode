/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IEditorMouseEvent, MouseTargetType } from '../../../../browser/editorBrowser.js';
import { Range } from '../../../../common/core/range.js';
import { ContentHoverController } from '../../browser/contentHoverController.js';
import { HoverStartMode, HoverStartSource } from '../../browser/hoverOperation.js';
import { HoverAnchor, HoverParticipantRegistry, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, RenderedHoverParts } from '../../browser/hoverTypes.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';

suite('Content Hover Controller', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	class TestHoverParticipant implements IEditorHoverParticipant {
		readonly hoverOrdinal = 0;
		readonly hideCopyButton = true;

		computeSync(anchor: HoverAnchor): IHoverPart[] {
			return [{ owner: this, range: anchor.range, isValidForHoverAnchor: () => true }];
		}

		renderHoverParts(context: IEditorHoverRenderContext, hoverParts: IHoverPart[]): RenderedHoverParts<IHoverPart> {
			const hoverElement = dom.$('div');
			hoverElement.textContent = 'Hover content';
			context.fragment.appendChild(hoverElement);
			return new RenderedHoverParts([{ hoverPart: hoverParts[0], hoverElement, dispose: () => { } }]);
		}

		getAccessibleContent(): string {
			return 'Hover content';
		}
	}

	function withHover(callback: (controller: ContentHoverController, node: HTMLElement, mouseMove: Emitter<IEditorMouseEvent>) => void): void {
		withTestCodeEditor('const value = 1;', { hover: { enabled: 'on', sticky: true, hidingDelay: 0 } }, (editor, _viewModel, instantiationService) => {
			const store = new DisposableStore();
			try {
				const root = dom.append(mainWindow.document.body, dom.$('div'));
				store.add(toDisposable(() => root.remove()));
				dom.append(root, editor.getDomNode()!);
				const overflow = dom.append(root, dom.$('div'));
				sinon.stub(editor, 'addContentWidget').callsFake(widget => {
					dom.append(overflow, widget.getDomNode());
				});
				const mouseMove = store.add(new Emitter<IEditorMouseEvent>());
				sinon.stub(editor, 'onMouseMove').callsFake(mouseMove.event);
				instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
					override onDidShowContextMenu = Event.None;
					override onDidHideContextMenu = Event.None;
				});
				sinon.stub(HoverParticipantRegistry, 'getAll').returns([TestHoverParticipant]);
				const controller = store.add(instantiationService.createInstance(ContentHoverController, editor));
				controller.showContentHover(new Range(1, 1, 1, 6), HoverStartMode.Immediate, HoverStartSource.Mouse, false);
				const node = overflow.querySelector<HTMLElement>('.monaco-resizable-hover');
				assert.ok(node);
				assert.strictEqual(controller.isHoverVisible, true);
				callback(controller, node, mouseMove);
			} finally {
				store.dispose();
			}
		});
	}

	function mouseEvent(target: HTMLElement, clientX: number, clientY: number): IEditorMouseEvent {
		const event = new MouseEvent('mousemove', { clientX, clientY, view: mainWindow });
		target.dispatchEvent(event);
		return {
			event: new StandardMouseEvent(mainWindow, event),
			target: { type: MouseTargetType.UNKNOWN, element: target, mouseColumn: 1, position: null, range: null }
		};
	}

	test('keeps the hover visible over resize sashes and corner handles outside its bounds', () => {
		withHover((controller, node, mouseMove) => {
			const handles = node.querySelectorAll<HTMLElement>('.monaco-sash:not(.disabled), .monaco-sash:not(.disabled) .orthogonal-drag-handle');
			assert.ok(handles.length > 0);
			const bounds = node.getBoundingClientRect();
			const visibility: (boolean | undefined)[] = [];
			for (const handle of handles) {
				mouseMove.fire(mouseEvent(handle, bounds.right + 1, bounds.top - 1));
				visibility.push(controller.isHoverVisible);
			}
			assert.deepStrictEqual(visibility, Array.from(handles, () => true));
		});
	});

	test('hides the hover when the mouse moves outside the widget', () => {
		withHover((controller, node, mouseMove) => {
			const bounds = node.getBoundingClientRect();
			mouseMove.fire(mouseEvent(mainWindow.document.body, bounds.right + 20, bounds.bottom + 20));
			assert.strictEqual(controller.isHoverVisible, false);
		});
	});

	test('keeps the hover visible when a resize leaves the editor and dismisses normally after resizing', () => {
		withHover((controller, node) => {
			const sash = node.querySelector<HTMLElement>('.monaco-sash.vertical:not(.disabled)');
			assert.ok(sash);
			const bounds = node.getBoundingClientRect();
			const clientX = bounds.right;
			const clientY = bounds.top + bounds.height / 2;
			sash.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX, clientY, view: mainWindow }));
			try {
				node.dispatchEvent(new MouseEvent('mouseleave', { clientX: -100, clientY: -100, view: mainWindow }));
				assert.strictEqual(controller.isHoverVisible, true);
			} finally {
				mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY, view: mainWindow }));
			}
			node.dispatchEvent(new MouseEvent('mouseleave', { clientX: -100, clientY: -100, view: mainWindow }));
			assert.strictEqual(controller.isHoverVisible, false);
		});
	});
});
