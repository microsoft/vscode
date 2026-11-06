/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, append, DragAndDropObserver } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DraggedEditorIdentifier, registerContentDropTarget, registerInputDropTarget } from '../../../../browser/dnd.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { EditorDropTarget } from '../../../../browser/parts/editor/editorDropTarget.js';
import { EditorInputWithOptions } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { GroupDirection, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

suite('EditorDropTarget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	interface ITestSetup {
		readonly groupElement: HTMLElement;
		readonly content: HTMLElement;
		readonly input: HTMLElement;
		readonly operations: string[];
	}

	function setup(options?: { readonly contentCoversGroup?: boolean; readonly inputAtBottomEdge?: boolean; readonly dragEditor?: boolean; readonly groupWidth?: number; readonly groupMinimumWidth?: number }): ITestSetup {
		const operations: string[] = [];

		// A 300x300 group at the viewport origin with a registered input drop target in its lower center
		// (or at its bottom edge), optionally inside registered content that covers the group, like a chat view
		const groupElement = $('div');
		groupElement.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; height: 300px;';
		const content = append(groupElement, $('div'));
		content.style.cssText = 'position: absolute; left: 0; top: 0; width: 300px; height: 300px;';
		const input = append(content, $('div'));
		input.style.cssText = options?.inputAtBottomEdge
			? 'position: absolute; left: 0; top: 270px; width: 300px; height: 30px;'
			: 'position: absolute; left: 100px; top: 200px; width: 100px; height: 50px;';
		mainWindow.document.body.appendChild(groupElement);
		store.add(toDisposable(() => groupElement.remove()));
		store.add(registerInputDropTarget(input));
		if (options?.contentCoversGroup) {
			store.add(registerContentDropTarget(content));
		}

		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'testEditorInput';
			override readonly resource = undefined;
			override hasCapability(): boolean { return false; }
		}();
		const groupsView = new class extends mock<IEditorGroupsView>() {
			override readonly partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, allowDropIntoGroup: true, splitOnDragAndDrop: true, openSideBySideDirection: 'right' as const, closeEmptyGroups: false };
		}();
		const groupView = new class extends mock<IEditorGroupView>() {
			override readonly element = groupElement;
			override readonly isEmpty = true;
			override readonly groupsView = groupsView;
			override readonly minimumWidth = options?.groupMinimumWidth ?? 0;
			override readonly minimumHeight = 0;
			override isActive(): boolean { return true; }
			override isSticky(): boolean { return false; }
			override focus(): void { }
		}();
		const sourceGroup = new class extends mock<IEditorGroup>() {
			override readonly count = 2;
			override moveEditors(editors: EditorInputWithOptions[], target: IEditorGroup): boolean {
				operations.push(`move ${editors.length} editor(s) to ${target === groupView ? 'target group' : 'new group'}`);
				return true;
			}
		}();
		const newGroup = new class extends mock<IEditorGroup>() {
			override focus(): void { }
		}();

		const part = new class extends mock<IEditorPart>() {
			override readonly windowId = mainWindow.vscodeWindowId;
		}();

		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IThemeService, new TestThemeService());
		instantiation.stub(IConfigurationService, new TestConfigurationService({ 'editor.dropIntoEditor.enabled': false }));
		instantiation.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override readonly groups = [groupView];
			override getGroup(): IEditorGroup { return sourceGroup; }
			override getPart(): IEditorPart { return part; }
			override addGroup(location: IEditorGroup, direction: GroupDirection): IEditorGroup {
				operations.push(`split ${direction}`);
				return newGroup;
			}
			override getSize() { return { width: options?.groupWidth ?? 300, height: 300 }; }
			override setSize(group: IEditorGroup, size: { width: number; height: number }) { operations.push(`size ${size.width}`); }
		}());
		instantiation.stub(IEditorService, {});
		instantiation.stub(ITreeViewsDnDService, {});
		instantiation.stub(IWorkspaceContextService, {});
		store.add(instantiation.createInstance(EditorDropTarget, groupsView, groupElement, {}));

		if (options?.dragEditor !== false) {
			editorTransfer.setData([new DraggedEditorIdentifier({ editor, groupId: 1 })], DraggedEditorIdentifier.prototype);
			store.add(toDisposable(() => editorTransfer.clearData(DraggedEditorIdentifier.prototype)));
		}

		return { groupElement, content, input, operations };
	}

	function dispatch(target: Element, type: string, clientX: number, clientY: number, dataTransfer = new DataTransfer()): void {
		target.dispatchEvent(new DragEvent(type, { dataTransfer, clientX, clientY, bubbles: true, cancelable: true }));
	}

	function getOverlay(groupElement: HTMLElement): HTMLElement | null {
		return groupElement.querySelector<HTMLElement>('#monaco-workbench-editor-drop-overlay');
	}

	test('does not show the overlay over an input drop target, and leaves the input out of the overlay', () => {
		const { groupElement, input } = setup();

		// Entering the input directly does not create the overlay
		dispatch(input, 'dragenter', 150, 225);
		const overlayOnInputEnter = !!getOverlay(groupElement);

		// An overlay created over the group leaves the input out of its hit region, so the input takes the drop
		dispatch(groupElement, 'dragenter', 150, 100);
		const overlay = getOverlay(groupElement);
		const clipped = !!overlay && overlay.style.clipPath.includes('100px 200px');
		dispatch(groupElement, 'dragend', 150, 100);

		assert.deepStrictEqual({ overlayOnInputEnter, overlayOnGroupEnter: !!overlay, clipped }, {
			overlayOnInputEnter: false,
			overlayOnGroupEnter: true,
			clipped: true
		});
	});

	test('shows the overlay and splits on an edge drop outside input drop targets', () => {
		const { groupElement, operations } = setup();

		dispatch(groupElement, 'dragenter', 5, 150);
		const overlay = getOverlay(groupElement);
		dispatch(overlay!, 'dragover', 5, 150);
		const overlayOnEdgeOver = !!getOverlay(groupElement);
		dispatch(overlay!, 'drop', 5, 150);
		dispatch(groupElement, 'dragend', 5, 150);

		assert.deepStrictEqual({ overlayOnEnter: !!overlay, overlayOnEdgeOver, overlayAfterDrop: !!getOverlay(groupElement), operations }, {
			overlayOnEnter: true,
			overlayOnEdgeOver: true,
			overlayAfterDrop: false,
			operations: [`split ${GroupDirection.LEFT}`, 'move 1 editor(s) to new group']
		});
	});

	test('an input drop target outside the group, such as one under a modal over it, does not take the drop', () => {
		const { groupElement, operations } = setup();

		// An input of another part in the same document, under the group at the same point
		const otherPart = $('div');
		otherPart.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; height: 300px; z-index: -1;';
		const otherInput = append(otherPart, $('div'));
		otherInput.style.cssText = 'position: absolute; left: 0; top: 100px; width: 300px; height: 100px;';
		mainWindow.document.body.appendChild(otherPart);
		store.add(toDisposable(() => otherPart.remove()));
		store.add(registerInputDropTarget(otherInput));

		dispatch(groupElement, 'dragenter', 5, 150);
		const overlay = getOverlay(groupElement);
		dispatch(overlay!, 'dragover', 5, 150);
		const overlayOnOver = !!getOverlay(groupElement);
		dispatch(overlay!, 'drop', 5, 150);
		dispatch(groupElement, 'dragend', 5, 150);

		assert.deepStrictEqual({ overlayOnEnter: !!overlay, overlayOnOver, operations }, {
			overlayOnEnter: true,
			overlayOnOver: true,
			operations: [`split ${GroupDirection.LEFT}`, 'move 1 editor(s) to new group']
		});
	});

	test('over content that handles drops, such as a chat, an editor dropped on its center goes into the group, as a tab, as the overlay shows, and the input still takes them', () => {
		const { groupElement, content, operations } = setup({ contentCoversGroup: true });

		// The center of the content: the whole group, to go into it
		dispatch(content, 'dragenter', 150, 150);
		dispatch(content, 'dragover', 150, 150);
		const overlay = getOverlay(groupElement);
		const indicator = overlay?.querySelector<HTMLElement>('.editor-group-overlay-indicator');
		const onCenter = { overlay: !!overlay, width: indicator?.style.width, left: indicator?.style.left };

		// Over the input, the input takes it: the overlay has a hole there
		const inputClipped = !!overlay && overlay.style.clipPath.includes('100px 200px');

		dispatch(getOverlay(groupElement)!, 'dragover', 150, 150);
		dispatch(getOverlay(groupElement)!, 'drop', 150, 150);
		dispatch(groupElement, 'dragend', 150, 150);

		assert.deepStrictEqual({ onCenter, inputClipped, operations }, {
			onCenter: { overlay: true, width: '100%', left: '0px' },
			inputClipped: true,
			operations: ['move 1 editor(s) to target group']
		});
	});

	test('over content that handles drops, an edge drop shows the size the new group gets, half of the group within the least sizes of the group and of an editor, and gives it that', () => {
		// The chat of a window, 474 wide, which does not get narrower than 280: an editor's least width, 220, rather than half
		const { groupElement, content, operations } = setup({ contentCoversGroup: true, groupWidth: 474, groupMinimumWidth: 280 });

		dispatch(content, 'dragenter', 5, 150);
		dispatch(content, 'dragover', 5, 150);
		const shown = getOverlay(groupElement)?.querySelector<HTMLElement>('.editor-group-overlay-indicator')?.style.width;
		dispatch(getOverlay(groupElement)!, 'drop', 5, 150);
		dispatch(groupElement, 'dragend', 5, 150);

		assert.deepStrictEqual({ shown, operations }, {
			shown: `${(220 * 100 / 474).toFixed(2)}%`,
			operations: [`split ${GroupDirection.LEFT}`, 'size 220', 'move 1 editor(s) to new group']
		});
	});

	test('over content that handles drops, the overlay that shows at an edge takes the drop, also when no drag moved over it yet, and the content does not get that drag', () => {
		const { groupElement, content, operations } = setup({ contentCoversGroup: true });
		const dragged = editorTransfer.getData(DraggedEditorIdentifier.prototype)!;
		const contentDragOvers: number[] = [];
		store.add(addDisposableListener(content, 'dragover', e => contentDragOvers.push(e.clientX)));

		// The center is the content's; one drag onto the left edge shows the split there at once
		dispatch(content, 'dragenter', 150, 150);
		dispatch(content, 'dragover', 150, 150);
		dispatch(content, 'dragover', 5, 150);
		const overlay = getOverlay(groupElement);
		const indicator = overlay?.querySelector<HTMLElement>('.editor-group-overlay-indicator');
		const shown = { width: indicator?.style.width, height: indicator?.style.height };

		// A drop with no drag over the overlay before it still splits, and is taken
		const drop = new DragEvent('drop', { dataTransfer: new DataTransfer(), clientX: 5, clientY: 150, bubbles: true, cancelable: true });
		overlay!.dispatchEvent(drop);
		dispatch(groupElement, 'dragend', 5, 150);

		// Entering at the right edge creates the overlay, and a drop right away splits there
		editorTransfer.setData(dragged, DraggedEditorIdentifier.prototype);
		dispatch(content, 'dragenter', 295, 150);
		const dropOnEnter = new DragEvent('drop', { dataTransfer: new DataTransfer(), clientX: 295, clientY: 150, bubbles: true, cancelable: true });
		getOverlay(groupElement)!.dispatchEvent(dropOnEnter);
		dispatch(groupElement, 'dragend', 295, 150);

		// The content gets no drag of editors: they split the group at its edges, and go into it in its center
		assert.deepStrictEqual({ contentDragOvers, shown, taken: [drop.defaultPrevented, dropOnEnter.defaultPrevented], overlayAfter: !!getOverlay(groupElement), operations }, {
			contentDragOvers: [],
			// Half of the 300 wide group is less than an editor's least width: the new group shows, and gets, that
			shown: { width: `${(DEFAULT_EDITOR_MIN_DIMENSIONS.width * 100 / 300).toFixed(2)}%`, height: '100%' },
			taken: [true, true],
			overlayAfter: false,
			operations: [`split ${GroupDirection.LEFT}`, 'size 220', 'move 1 editor(s) to new group', `split ${GroupDirection.RIGHT}`, 'size 220', 'move 1 editor(s) to new group']
		});
	});

	test('content that handles drops, such as a chat that shows its own drop feedback, gets the leave of a drag that leaves it, also through the edge overlay', () => {
		const { groupElement, content, operations } = setup({ contentCoversGroup: true });
		const child = append(content, $('div'));
		child.style.cssText = 'position: absolute; left: 0; top: 0; width: 300px; height: 150px;';
		const other = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => other.remove()));
		const feedback: string[] = [];
		store.add(new DragAndDropObserver(content, {
			onDragOver: () => { if (feedback[feedback.length - 1] !== 'show') { feedback.push('show'); } },
			onDragLeave: () => feedback.push('hide'),
			onDrop: () => feedback.push('drop')
		}));
		const move = (from: Element, to: Element, x: number, y: number) => {
			dispatch(to, 'dragenter', x, y);
			dispatch(from, 'dragleave', x, y);
			dispatch(to, 'dragover', x, y);
		};

		// Into the center of the content, out over its edge, where the overlay shows, and on to another part
		dispatch(child, 'dragenter', 150, 100);
		dispatch(child, 'dragover', 150, 100);
		dispatch(child, 'dragover', 295, 100);
		const overlay = getOverlay(groupElement)!;
		move(child, overlay, 295, 100);
		move(overlay, other, 400, 100);

		// Into the content again and straight out to another part
		move(other, child, 150, 100);
		move(child, other, 400, 100);
		dispatch(other, 'drop', 400, 100);
		dispatch(groupElement, 'dragend', 400, 100);

		// Editors split the group, so the content shows no drop feedback for them, but it gets their leave
		assert.deepStrictEqual({ feedback, overlayAfter: !!getOverlay(groupElement), operations }, {
			feedback: ['hide', 'hide'],
			overlayAfter: false,
			operations: []
		});
	});

	test('over content that handles drops, other drags get no edge zones', () => {
		const { groupElement, content: input, operations } = setup({ contentCoversGroup: true, dragEditor: false });
		const files = new DataTransfer();
		files.setData('Files', '');

		dispatch(input, 'dragenter', 5, 150, files);
		dispatch(input, 'dragover', 5, 150, files);
		const overlayOnEdge = !!getOverlay(groupElement);
		dispatch(input, 'drop', 5, 150, files);
		dispatch(groupElement, 'dragend', 5, 150, files);

		assert.deepStrictEqual({ overlayOnEdge, operations }, { overlayOnEdge: false, operations: [] });
	});

	test('an input drop target inside such content takes editors dropped on it, also at an edge of the group', () => {
		const { groupElement, input, operations } = setup({ contentCoversGroup: true, inputAtBottomEdge: true });

		dispatch(input, 'dragenter', 150, 295);
		dispatch(input, 'dragover', 150, 295);
		const overlayOverInput = !!getOverlay(groupElement);
		dispatch(input, 'drop', 150, 295);
		dispatch(groupElement, 'dragend', 150, 295);

		assert.deepStrictEqual({ overlayOverInput, operations }, { overlayOverInput: false, operations: [] });
	});
});
