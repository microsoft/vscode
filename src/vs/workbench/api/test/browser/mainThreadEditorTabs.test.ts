/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { observableValue, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { MultiDiffEditorInput } from '../../../contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from '../../../contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IEditorGroup, IEditorGroupsService, IModalEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorsChangeEvent, IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { TestEditorInput } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadEditorTabs } from '../../browser/mainThreadEditorTabs.js';
import { MainThreadEditorTabsShape } from '../../common/extHost.protocol.js';
import { ExtHostEditorTabs } from '../../common/extHostEditorTabs.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadEditorTabs', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('ignores only missing modal editor label changes', async () => {
		const modalGroup = new class extends mock<IEditorGroup>() {
			override readonly id = 2;
		}();
		const modalEditorPart = new class extends mock<IModalEditorPart>() {
			override readonly groups = [modalGroup];
		}();
		let groupsReadCount = 0;
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override readonly activeModalEditorPart = modalEditorPart;
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly whenReady = Promise.resolve();
			override getGroup(): IEditorGroup | undefined {
				return undefined;
			}
			override get groups(): readonly IEditorGroup[] {
				groupsReadCount++;
				return [];
			}
		}();
		const editorChanges = disposables.add(new Emitter<IEditorsChangeEvent>());
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidEditorsChange = editorChanges.event;
		}();
		const input = disposables.add(new TestEditorInput(URI.parse('test:modal'), 'testEditor'));
		disposables.add(new MainThreadEditorTabs(
			SingleProxyRPCProtocol({}),
			editorGroupsService,
			new TestConfigurationService(),
			new NullLogService(),
			editorService,
		));
		await Promise.resolve();
		groupsReadCount = 0;

		editorChanges.fire({
			groupId: modalGroup.id,
			event: {
				kind: GroupModelChangeKind.EDITOR_LABEL,
				editor: input,
				editorIndex: 0,
			},
		});
		const rebuildsAfterLabelChange = groupsReadCount;
		editorChanges.fire({
			groupId: modalGroup.id,
			event: {
				kind: GroupModelChangeKind.EDITOR_OPEN,
				editor: input,
				editorIndex: 0,
			},
		});

		assert.deepStrictEqual({
			rebuildsAfterLabelChange,
			rebuildsAfterOpen: groupsReadCount,
		}, {
			rebuildsAfterLabelChange: 0,
			rebuildsAfterOpen: 1,
		});
	});

	test('updating a background tab does not make it the active tab', async () => {
		class NamedEditorInput extends TestEditorInput {
			private _dirty = false;
			constructor(resource: URI, typeId: string, private _name: string) {
				super(resource, typeId);
			}
			override getName(): string { return this._name; }
			setName(name: string): void { this._name = name; }
			override isDirty(): boolean { return this._dirty; }
			setDirty(dirty: boolean): void { this._dirty = dirty; }
		}

		const inputA = disposables.add(new NamedEditorInput(URI.parse('test:a'), 'testEditor', 'Panel A'));
		const inputB = disposables.add(new NamedEditorInput(URI.parse('test:b'), 'testEditor', 'Panel B'));
		let activeEditor: EditorInput = inputA;
		let sticky = false;
		let pinned = true;

		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 1;
			override get editors() { return [inputA, inputB]; }
			override isSticky() { return sticky; }
			override isPinned() { return pinned; }
			override isActive(editor: EditorInput) { return editor === activeEditor; }
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly whenReady = Promise.resolve();
			override readonly activeModalEditorPart = undefined;
			override get groups(): readonly IEditorGroup[] { return [group]; }
			override getGroups(): readonly IEditorGroup[] { return [group]; }
			override get activeGroup(): IEditorGroup { return group; }
			override getGroup(): IEditorGroup | undefined { return group; }
		}();
		const editorChanges = disposables.add(new Emitter<IEditorsChangeEvent>());
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidEditorsChange = editorChanges.event;
		}();

		// Drive a real ext host so the assertions are made against the actual API surface
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() { })
		);
		disposables.add(new MainThreadEditorTabs(
			SingleProxyRPCProtocol(extHostEditorTabs),
			editorGroupsService,
			new TestConfigurationService(),
			new NullLogService(),
			editorService,
		));
		await Promise.resolve();

		const activeTabLabel = () => extHostEditorTabs.tabGroups.activeTabGroup.activeTab?.label;
		const initial = activeTabLabel();

		// Tab B becomes the active tab
		activeEditor = inputB;
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_ACTIVE, editor: inputB, editorIndex: 1 }
		});
		const afterActivatingB = activeTabLabel();

		// Any update to the background tab A must not steal the active tab
		inputA.setName('Panel A (2)');
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_LABEL, editor: inputA, editorIndex: 0 }
		});
		const afterLabelChange = activeTabLabel();

		inputA.setDirty(true);
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_DIRTY, editor: inputA, editorIndex: 0 }
		});
		const afterDirtyChange = activeTabLabel();

		sticky = true;
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_STICKY, editor: inputA, editorIndex: 0 }
		});
		const afterStickyChange = activeTabLabel();

		pinned = false;
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_PIN, editor: inputA, editorIndex: 0 }
		});
		const afterPreviewChange = activeTabLabel();

		assert.deepStrictEqual({
			initial,
			afterActivatingB,
			afterLabelChange,
			afterDirtyChange,
			afterStickyChange,
			afterPreviewChange,
		}, {
			initial: 'Panel A',
			afterActivatingB: 'Panel B',
			afterLabelChange: 'Panel B',
			afterDirtyChange: 'Panel B',
			afterStickyChange: 'Panel B',
			afterPreviewChange: 'Panel B',
		});
	});

	test('multi diff tab whose resources changed does not become the active tab', async () => {
		const resources = observableValue<readonly MultiDiffEditorItem[]>('resources', []);
		const sourceResolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override resolve() {
				return Promise.resolve({ resources: new ValueWithChangeEventFromObservable(resources) });
			}
		}();
		const textFileService = new class extends mock<ITextFileService>() {
			override readonly files = new class extends mock<ITextFileEditorModelManager>() {
				override readonly onDidChangeDirty = Event.None;
			}();
		}();
		const multiDiffInput = disposables.add(new MultiDiffEditorInput(
			URI.parse('multi-diff-editor:test'),
			'Multi Diff',
			undefined,
			false,
			new class extends mock<ITextModelService>() { }(),
			new class extends mock<ITextResourceConfigurationService>() { }(),
			new class extends mock<IInstantiationService>() { }(),
			sourceResolverService,
			textFileService,
		));
		await multiDiffInput.getViewModel();

		const other = disposables.add(new TestEditorInput(URI.parse('test:other'), 'testEditor'));
		const editors: EditorInput[] = [other];
		let activeEditor: EditorInput = other;

		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 1;
			override get editors() { return editors; }
			override isSticky() { return false; }
			override isPinned() { return true; }
			override isActive(editor: EditorInput) { return editor === activeEditor; }
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly whenReady = Promise.resolve();
			override readonly activeModalEditorPart = undefined;
			override get groups(): readonly IEditorGroup[] { return [group]; }
			override getGroups(): readonly IEditorGroup[] { return [group]; }
			override get activeGroup(): IEditorGroup { return group; }
			override getGroup(): IEditorGroup | undefined { return group; }
		}();
		const editorChanges = disposables.add(new Emitter<IEditorsChangeEvent>());
		const editorService = new class extends mock<IEditorService>() {
			override readonly onDidEditorsChange = editorChanges.event;
		}();

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() { })
		);
		disposables.add(new MainThreadEditorTabs(
			SingleProxyRPCProtocol(extHostEditorTabs),
			editorGroupsService,
			new TestConfigurationService(),
			new NullLogService(),
			editorService,
		));
		await Promise.resolve();

		// Open the multi diff editor so that its resources listener gets registered
		editors.push(multiDiffInput);
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_OPEN, editor: multiDiffInput, editorIndex: 1 }
		});

		// It becomes the active tab, then its resources change while it is active
		activeEditor = multiDiffInput;
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_ACTIVE, editor: multiDiffInput, editorIndex: 1 }
		});
		resources.set([], undefined);

		// The other tab is activated, leaving the multi diff tab in the background
		activeEditor = other;
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_ACTIVE, editor: other, editorIndex: 0 }
		});
		const afterActivatingOther = extHostEditorTabs.tabGroups.activeTabGroup.activeTab?.label;

		// Updating the background multi diff tab must not hand it the active tab
		editorChanges.fire({
			groupId: group.id,
			event: { kind: GroupModelChangeKind.EDITOR_LABEL, editor: multiDiffInput, editorIndex: 1 }
		});
		const afterLabelChange = extHostEditorTabs.tabGroups.activeTabGroup.activeTab?.label;

		assert.deepStrictEqual({ afterActivatingOther, afterLabelChange }, {
			afterActivatingOther: other.getName(),
			afterLabelChange: other.getName(),
		});
	});
});
