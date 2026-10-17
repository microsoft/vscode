/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContentWidgetPositionPreference, IContentWidget, IOverlayWidget, MouseTargetType, OverlayWidgetPositionPreference } from '../../../../browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption, IEditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { TextDirection } from '../../../../common/model.js';
import { createCodeEditorServices } from '../../../../test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { DragAndDropController } from '../../browser/dnd.js';

interface Point {
	x: number;
	y: number;
}

suite('DragAndDropController - mouse handler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const text = 'drag me\nabcdef\nghijkl';
	const selection = new Selection(1, 1, 1, 5);
	const copyModifier: MouseEventInit = isMacintosh ? { altKey: true } : { ctrlKey: true };

	function createEditor(value = text, options: IEditorOptions = {}): CodeEditorWidget {
		const container = document.createElement('div');
		container.style.position = 'fixed';
		container.style.left = '50px';
		container.style.top = '50px';
		container.style.width = '500px';
		container.style.height = '300px';
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const instantiationService = createCodeEditorServices(store);
		const editor = store.add(instantiationService.createInstance(CodeEditorWidget, container, {
			fontFamily: 'monospace',
			fontSize: 14,
			lineHeight: 20,
			glyphMargin: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			wordWrap: 'off',
			...options,
		}, { contributions: [] }));
		editor.setModel(store.add(createTextModel(value)));
		store.add(new DragAndDropController(editor));
		editor.layout({ width: 500, height: 300 });
		editor.render();
		return editor;
	}

	function pointAt(editor: CodeEditorWidget, position: Position): Point {
		const visiblePosition = editor.getScrolledVisiblePosition(position);
		assert.ok(visiblePosition);
		const bounds = editor.getDomNode()!.getBoundingClientRect();
		const layout = editor.getLayoutInfo();
		return {
			x: bounds.left + (visiblePosition.left + 1) * bounds.width / layout.width,
			y: bounds.top + (visiblePosition.top + visiblePosition.height / 2) * bounds.height / layout.height,
		};
	}

	function gutterPoint(editor: CodeEditorWidget, offset: number, lineNumber = 2): Point {
		const bounds = editor.getDomNode()!.getBoundingClientRect();
		return {
			x: bounds.left + offset * bounds.width / editor.getLayoutInfo().width,
			y: pointAt(editor, new Position(lineNumber, 1)).y,
		};
	}

	function markerPositions(editor: CodeEditorWidget): Position[] {
		return editor.getModel()!.getAllDecorations()
			.filter(decoration => decoration.options.description === 'dnd-target')
			.map(decoration => decoration.range.getStartPosition());
	}

	function startDrag(editor: CodeEditorWidget, sourceSelection = selection) {
		editor.setSelection(sourceSelection);
		editor.render();
		let point = pointAt(editor, new Position(sourceSelection.startLineNumber, sourceSelection.startColumn + 2));
		let modifiers: MouseEventInit = {};
		const viewLines = editor.getDomNode()!.querySelector<HTMLElement>('.view-lines');
		assert.ok(viewLines);
		const source = document.elementFromPoint(point.x, point.y);
		assert.ok(source);
		const eventOptions = (): PointerEventInit => ({
			bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
			button: 0, buttons: 1, clientX: point.x, clientY: point.y, ...modifiers,
		});
		source.dispatchEvent(new PointerEvent('pointerdown', eventOptions()));
		source.dispatchEvent(new MouseEvent('mousedown', { ...eventOptions(), detail: 1 }));

		const moveTo = (destination: Point, keys: MouseEventInit = {}) => {
			point = destination;
			modifiers = keys;
			// Captured moves target the view lines, not the element underneath the pointer.
			viewLines.dispatchEvent(new PointerEvent('pointermove', eventOptions()));
			editor.render();
		};
		moveTo(point);
		return {
			moveTo,
			drop: () => {
				viewLines.dispatchEvent(new PointerEvent('pointerup', { ...eventOptions(), buttons: 0 }));
				editor.render();
			},
			cancel: () => {
				document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', code: 'Escape', keyCode: 27 }));
				editor.render();
			},
		};
	}

	const destinations = [
		{
			name: 'content text', type: MouseTargetType.CONTENT_TEXT, column: 3,
			point: (editor: CodeEditorWidget) => pointAt(editor, new Position(2, 3)),
		},
		{
			name: 'empty content', type: MouseTargetType.CONTENT_EMPTY, column: 7,
			point: (editor: CodeEditorWidget) => ({ ...pointAt(editor, new Position(2, 7)), x: pointAt(editor, new Position(2, 7)).x + 30 }),
		},
		{
			name: 'glyph margin', type: MouseTargetType.GUTTER_GLYPH_MARGIN, column: 1,
			point: (editor: CodeEditorWidget) => gutterPoint(editor, editor.getLayoutInfo().glyphMarginLeft + 5),
		},
		{
			name: 'line numbers', type: MouseTargetType.GUTTER_LINE_NUMBERS, column: 1,
			point: (editor: CodeEditorWidget) => gutterPoint(editor, editor.getLayoutInfo().lineNumbersLeft + 5),
		},
		{
			name: 'line decorations', type: MouseTargetType.GUTTER_LINE_DECORATIONS, column: 1,
			point: (editor: CodeEditorWidget) => gutterPoint(editor, editor.getLayoutInfo().decorationsLeft + 2),
		},
	];

	for (const destination of destinations) {
		for (const copy of [false, true]) {
			test(`${copy ? 'copies' : 'moves'} to ${destination.name} and can undo`, async () => {
				const editor = createEditor();
				const dragTargets: (MouseTargetType | null)[] = [];
				const dropTargets: (MouseTargetType | null)[] = [];
				store.add(editor.onMouseDrag(e => dragTargets.push(e.target?.type ?? null)));
				store.add(editor.onMouseDrop(e => dropTargets.push(e.target?.type ?? null)));
				const drag = startDrag(editor);
				drag.moveTo(destination.point(editor), copy ? copyModifier : {});
				const marker = markerPositions(editor);
				drag.drop();
				const result = editor.getValue();
				const resultMarkers = markerPositions(editor);
				await editor.getModel()!.undo();

				const offset = destination.column - 1;
				assert.deepStrictEqual({
					dragTarget: dragTargets.at(-1), dropTargets, marker, result, resultMarkers, undo: editor.getValue(),
				}, {
					dragTarget: destination.type, dropTargets: [destination.type],
					marker: [new Position(2, destination.column)],
					result: `${copy ? 'drag me' : ' me'}\n${'abcdef'.slice(0, offset)}drag${'abcdef'.slice(offset)}\nghijkl`,
					resultMarkers: [], undo: text,
				});
			});
		}
	}

	const outsidePoints = [
		{ name: 'left of the widget', point: (bounds: DOMRect, point: Point) => ({ x: bounds.left - 10, y: point.y }) },
		{ name: 'right of the widget', point: (bounds: DOMRect, point: Point) => ({ x: bounds.right + 10, y: point.y }) },
		{ name: 'below the widget', point: (bounds: DOMRect, point: Point) => ({ x: point.x, y: bounds.bottom + 10 }) },
		{ name: 'outside the window', point: (_bounds: DOMRect, point: Point) => ({ x: -100, y: point.y }) },
	];

	function checkInvalidTarget(editor: CodeEditorWidget, invalidPoint: Point, expectedTarget: MouseTargetType | null): void {
		const dragTargets: (MouseTargetType | null)[] = [];
		const dropTargets: (MouseTargetType | null)[] = [];
		store.add(editor.onMouseDrag(e => dragTargets.push(e.target?.type ?? null)));
		store.add(editor.onMouseDrop(e => dropTargets.push(e.target?.type ?? null)));

		const drag = startDrag(editor);
		drag.moveTo(pointAt(editor, new Position(3, 3)));
		const validMarker = markerPositions(editor);
		const validMarkerVisible = !!editor.getDomNode()!.querySelector('.dnd-target');
		const beforeInvalid = dragTargets.length;
		drag.moveTo(invalidPoint);
		const invalidMarker = markerPositions(editor);
		const invalidMarkerVisible = !!editor.getDomNode()!.querySelector('.dnd-target');
		const invalidTarget = dragTargets.at(-1);
		const invalidNotified = dragTargets.length === beforeInvalid + 1;
		drag.drop();
		const rejected = editor.getValue();

		const nextDrag = startDrag(editor);
		nextDrag.moveTo(pointAt(editor, new Position(3, 3)));
		nextDrag.moveTo(invalidPoint);
		nextDrag.moveTo(pointAt(editor, new Position(3, 3)));
		const reentryMarker = markerPositions(editor);
		const reentryMarkerVisible = !!editor.getDomNode()!.querySelector('.dnd-target');
		nextDrag.drop();

		assert.deepStrictEqual({
			validMarker, validMarkerVisible, invalidMarker, invalidMarkerVisible, invalidTarget, invalidNotified, rejected,
			reentryMarker, reentryMarkerVisible, dropTargets, result: editor.getValue(), resultMarkers: markerPositions(editor),
		}, {
			validMarker: [new Position(3, 3)], validMarkerVisible: true, invalidMarker: [], invalidMarkerVisible: false,
			invalidTarget: expectedTarget, invalidNotified: true, rejected: text,
			reentryMarker: [new Position(3, 3)], reentryMarkerVisible: true, dropTargets: [expectedTarget, MouseTargetType.CONTENT_TEXT],
			result: ' me\nabcdef\nghdragijkl', resultMarkers: [],
		});
	}

	test('rejects a release above the widget even when hit testing projects outside the source selection', () => {
		const value = 'abcdef\ndrag me\nghijkl';
		const editor = createEditor(value);
		const sourceSelection = new Selection(2, 1, 2, 5);
		const drag = startDrag(editor, sourceSelection);
		drag.moveTo(pointAt(editor, new Position(3, 3)));
		const validMarker = markerPositions(editor);
		drag.moveTo({
			x: pointAt(editor, new Position(1, 3)).x,
			y: editor.getDomNode()!.getBoundingClientRect().top - 10,
		});
		const invalidMarker = markerPositions(editor);
		drag.drop();
		const rejected = editor.getValue();
		const nextDrag = startDrag(editor, sourceSelection);
		nextDrag.moveTo(pointAt(editor, new Position(3, 3)));
		nextDrag.drop();
		assert.deepStrictEqual({ validMarker, invalidMarker, rejected, result: editor.getValue() }, {
			validMarker: [new Position(3, 3)], invalidMarker: [], rejected: value, result: 'abcdef\n me\nghdragijkl',
		});
	});

	for (const outside of outsidePoints) {
		test(`clears feedback ${outside.name}, rejects release, and supports reentry`, () => {
			const editor = createEditor();
			const point = outside.point(editor.getDomNode()!.getBoundingClientRect(), pointAt(editor, new Position(2, 3)));
			checkInvalidTarget(editor, point, null);
		});
	}

	for (const gutter of [false, true]) {
		test(`rejects ${gutter ? 'gutter' : 'content'} view zones without ending the drag`, () => {
			const editor = createEditor();
			const zone = document.createElement('div');
			const margin = document.createElement('div');
			zone.textContent = 'view zone';
			margin.textContent = 'margin zone';
			editor.changeViewZones(accessor => accessor.addZone({ afterLineNumber: 2, heightInLines: 2, domNode: zone, marginDomNode: margin }));
			editor.render();
			const bounds = (gutter ? margin : zone).getBoundingClientRect();
			checkInvalidTarget(editor, { x: bounds.left + 5, y: bounds.top + bounds.height / 2 },
				gutter ? MouseTargetType.GUTTER_VIEW_ZONE : MouseTargetType.CONTENT_VIEW_ZONE);
		});
	}

	for (const minimap of [false, true]) {
		test(`rejects the ${minimap ? 'minimap' : 'scrollbar'} without ending the drag`, () => {
			const editor = createEditor(text, { minimap: { enabled: minimap } });
			const layout = editor.getLayoutInfo();
			const offset = minimap ? layout.minimap.minimapLeft + layout.minimap.minimapWidth / 2 : layout.width - 5;
			checkInvalidTarget(editor, gutterPoint(editor, offset), MouseTargetType.SCROLLBAR);
		});
	}

	for (const content of [false, true]) {
		test(`clears feedback over ${content ? 'a content' : 'an overlay'} widget with no position`, () => {
			const editor = createEditor();
			const node = document.createElement('div');
			node.textContent = 'widget';
			node.style.width = '100px';
			node.style.height = '20px';
			if (content) {
				const widget: IContentWidget = {
					getId: () => 'test.contentWidget', getDomNode: () => node,
					getPosition: () => ({ position: new Position(2, 3), preference: [ContentWidgetPositionPreference.EXACT] }),
				};
				editor.addContentWidget(widget);
				store.add(toDisposable(() => editor.removeContentWidget(widget)));
			} else {
				const widget: IOverlayWidget = {
					getId: () => 'test.overlayWidget', getDomNode: () => node,
					getPosition: () => ({ preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER }),
				};
				editor.addOverlayWidget(widget);
				store.add(toDisposable(() => editor.removeOverlayWidget(widget)));
			}
			editor.render();
			const bounds = node.getBoundingClientRect();
			checkInvalidTarget(editor, { x: bounds.left + 5, y: bounds.top + 10 }, null);
		});
	}

	test('uses widget bounds with a scaled editor', () => {
		const editor = createEditor();
		editor.getContainerDomNode().style.transform = 'scale(0.8)';
		editor.getContainerDomNode().style.transformOrigin = 'top left';
		checkInvalidTarget(editor, {
			x: editor.getDomNode()!.getBoundingClientRect().left - 1,
			y: pointAt(editor, new Position(2, 3)).y,
		}, null);
	});

	for (const column of [selection.startColumn, selection.endColumn]) {
		test(`preserves copying to selection endpoint ${column}`, () => {
			const editor = createEditor();
			const drag = startDrag(editor);
			drag.moveTo(pointAt(editor, new Position(1, column)), copyModifier);
			drag.drop();
			assert.deepStrictEqual({ value: editor.getValue(), markers: markerPositions(editor) }, {
				value: 'dragdrag me\nabcdef\nghijkl', markers: [],
			});
		});
	}

	test('Escape clears the marker and cancels the edit', () => {
		const editor = createEditor();
		const drag = startDrag(editor);
		drag.moveTo(pointAt(editor, new Position(2, 3)));
		const marker = markerPositions(editor);
		drag.cancel();
		drag.drop();
		assert.deepStrictEqual({ marker, value: editor.getValue(), markers: markerPositions(editor), mouseStyle: editor.getOption(EditorOption.mouseStyle) }, {
			marker: [new Position(2, 3)], value: text, markers: [], mouseStyle: 'text',
		});
	});

	test('converts wrapped drag targets to model positions', () => {
		const editor = createEditor('drag me\nabcdefghijklmnopqrstuvwxyz\nghijkl', { wordWrap: 'wordWrapColumn', wordWrapColumn: 10 });
		const drag = startDrag(editor);
		drag.moveTo(pointAt(editor, new Position(2, 23)));
		const marker = markerPositions(editor);
		drag.drop();
		assert.deepStrictEqual({ marker, value: editor.getValue() }, {
			marker: [new Position(2, 23)], value: ' me\nabcdefghijklmnopqrstuvdragwxyz\nghijkl',
		});
	});

	test('uses the release position for an RTL gutter rather than the selection projection', () => {
		const editor = createEditor();
		editor.createDecorationsCollection([{ range: new Range(2, 1, 2, 7), options: { description: 'rtl', textDirection: TextDirection.RTL } }]);
		editor.render();
		const drag = startDrag(editor);
		drag.moveTo(gutterPoint(editor, editor.getLayoutInfo().lineNumbersLeft + 5));
		const marker = markerPositions(editor);
		drag.drop();
		assert.deepStrictEqual({ marker, value: editor.getValue() }, {
			marker: [new Position(2, 1)], value: ' me\ndragabcdef\nghijkl',
		});
	});

	test('scrolls while outside the viewport without advertising or accepting a drop', () => {
		const value = ['drag me', ...Array.from({ length: 60 }, (_, i) => `line ${i}`)].join('\n');
		const editor = createEditor(value);
		const drag = startDrag(editor);
		drag.moveTo(pointAt(editor, new Position(2, 3)));
		const beforeScroll = editor.getScrollTop();
		drag.moveTo({
			x: pointAt(editor, new Position(2, 3)).x,
			y: editor.getDomNode()!.getBoundingClientRect().bottom + 40,
		});
		const scrolled = editor.getScrollTop() > beforeScroll;
		const markers = markerPositions(editor);
		drag.drop();
		assert.deepStrictEqual({ scrolled, markers, value: editor.getValue() }, { scrolled: true, markers: [], value });
	});
});
