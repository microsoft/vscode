/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
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
import { DraggedEditorIdentifier, registerInputDropTarget } from '../../../../browser/dnd.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { EditorDropTarget } from '../../../../browser/parts/editor/editorDropTarget.js';
import { EditorInputWithOptions } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

suite('EditorDropTarget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();

	interface ITestSetup {
		readonly groupElement: HTMLElement;
		readonly input: HTMLElement;
		readonly operations: string[];
	}

	function setup(): ITestSetup {
		const operations: string[] = [];

		// A 300x300 group at the viewport origin with a registered input drop target in its lower center
		const groupElement = $('div');
		groupElement.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; height: 300px;';
		const input = append(groupElement, $('div'));
		input.style.cssText = 'position: absolute; left: 100px; top: 200px; width: 100px; height: 50px;';
		mainWindow.document.body.appendChild(groupElement);
		store.add(toDisposable(() => groupElement.remove()));
		store.add(registerInputDropTarget(input));

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
			override isActive(): boolean { return true; }
			override isSticky(): boolean { return false; }
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

		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IThemeService, new TestThemeService());
		instantiation.stub(IConfigurationService, new TestConfigurationService({ 'editor.dropIntoEditor.enabled': false }));
		instantiation.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override readonly groups = [groupView];
			override getGroup(): IEditorGroup { return sourceGroup; }
			override addGroup(location: IEditorGroup, direction: GroupDirection): IEditorGroup {
				operations.push(`split ${direction}`);
				return newGroup;
			}
		}());
		instantiation.stub(IEditorService, {});
		instantiation.stub(ITreeViewsDnDService, {});
		instantiation.stub(IWorkspaceContextService, {});
		store.add(instantiation.createInstance(EditorDropTarget, groupsView, groupElement, {}));

		editorTransfer.setData([new DraggedEditorIdentifier({ editor, groupId: 1 })], DraggedEditorIdentifier.prototype);
		store.add(toDisposable(() => editorTransfer.clearData(DraggedEditorIdentifier.prototype)));

		return { groupElement, input, operations };
	}

	function dispatch(target: Element, type: string, clientX: number, clientY: number): void {
		target.dispatchEvent(new DragEvent(type, { dataTransfer: new DataTransfer(), clientX, clientY, bubbles: true, cancelable: true }));
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
});
