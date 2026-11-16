/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { EditorCloseContext, IEditorCloseEvent } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { createEditorPart, registerTestEditor, TestEditorPart, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalInstance, ITerminalInstanceService } from '../../browser/terminal.js';
import { TerminalEditorInput } from '../../browser/terminalEditorInput.js';
import { TerminalEditorService } from '../../browser/terminalEditorService.js';

suite('Workbench - TerminalEditorService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let terminalEditorService: TerminalEditorService;
	let onDidActiveEditorChange: Emitter<void>;
	let onDidCloseEditor: Emitter<IEditorCloseEvent>;
	let activeEditor: EditorInput | undefined;

	setup(() => {
		onDidActiveEditorChange = store.add(new Emitter<void>());
		onDidCloseEditor = store.add(new Emitter<IEditorCloseEvent>());
		activeEditor = undefined;

		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			onDidActiveEditorChange: onDidActiveEditorChange.event,
			onDidVisibleEditorsChange: Event.None,
			onDidCloseEditor: onDidCloseEditor.event,
			get activeEditor() { return activeEditor; },
			activeEditorPane: undefined,
			visibleEditors: [],
		}));
		instantiationService.stub(ITerminalInstanceService, {});

		terminalEditorService = store.add(instantiationService.createInstance(TerminalEditorService));
	});

	function createEditorTerminal(instanceId: number): EditorInput {
		const resource = URI.from({ scheme: Schemas.vscodeTerminal, path: `/${instanceId}` });
		const instance = upcastPartial<ITerminalInstance>({
			instanceId,
			resource,
			waitOnExit: undefined,
			onDidFocus: Event.None,
			onDidBlur: Event.None,
			onDisposed: Event.None,
			onExit: Event.None,
			onTitleChanged: Event.None,
			onIconChanged: Event.None,
			statusList: upcastPartial<ITerminalInstance['statusList']>({ onDidChangePrimaryStatus: Event.None }),
			capabilities: upcastPartial<ITerminalInstance['capabilities']>({ onDidChangeCapabilities: Event.None }),
			dispose: () => { },
		});
		terminalEditorService.resolveResource(instance);
		const input = store.add(terminalEditorService.getInputFromResource(resource));
		activeEditor = input;
		onDidActiveEditorChange.fire();
		return input;
	}

	function getState() {
		return {
			instances: terminalEditorService.instances.map(instance => instance.instanceId),
			activeInstance: terminalEditorService.activeInstance?.instanceId,
		};
	}

	test('keeps a terminal editor tracked and active when it moves to another group', () => {
		const input = createEditorTerminal(1);

		// Moving an editor opens it in the target group first, then closes it in the source group
		onDidCloseEditor.fire({ editor: input, groupId: 1, index: 0, sticky: false, context: EditorCloseContext.MOVE });
		onDidActiveEditorChange.fire();

		deepStrictEqual(getState(), { instances: [1], activeInstance: 1 });
	});

	test('removes a terminal editor when it is closed', () => {
		const input = createEditorTerminal(1);

		onDidCloseEditor.fire({ editor: input, groupId: 1, index: 0, sticky: false, context: EditorCloseContext.UNKNOWN });

		deepStrictEqual(getState(), { instances: [], activeInstance: undefined });
	});
});

suite('Workbench - TerminalEditorService - editor groups', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const TEST_EDITOR_ID = 'terminalEditorServiceTestEditor';

	let terminalEditorService: TerminalEditorService;
	let part: TestEditorPart;

	setup(async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		store.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TerminalEditorInput), new SyncDescriptor(TestFileEditorInput)]));

		part = await createEditorPart(instantiationService, store.add(new DisposableStore()));
		instantiationService.stub(IEditorGroupsService, part);
		instantiationService.stub(IEditorService, store.add(instantiationService.createInstance(EditorService, undefined)));
		instantiationService.stub(ITerminalInstanceService, {});

		terminalEditorService = store.add(instantiationService.createInstance(TerminalEditorService));
	});

	function createTerminalInstance(instanceId: number): ITerminalInstance {
		return upcastPartial<ITerminalInstance>({
			instanceId,
			resource: URI.from({ scheme: Schemas.vscodeTerminal, path: `/${instanceId}` }),
			title: `Terminal ${instanceId}`,
			shellLaunchConfig: {},
			waitOnExit: undefined,
			onDidFocus: Event.None,
			onDidBlur: Event.None,
			onDisposed: Event.None,
			onExit: Event.None,
			onTitleChanged: Event.None,
			onIconChanged: Event.None,
			statusList: upcastPartial<ITerminalInstance['statusList']>({ onDidChangePrimaryStatus: Event.None }),
			capabilities: upcastPartial<ITerminalInstance['capabilities']>({ onDidChangeCapabilities: Event.None }),
			setParentContextKeyService: () => { },
			resetFocusContextKey: () => { },
			detachFromElement: () => { },
			focusWhenReady: async () => { },
			dispose: () => { },
		});
	}

	/** Opens a terminal editor in `group` behind an active file editor, so that it stays inactive. */
	async function openInactiveTerminalEditor(group: IEditorGroup, instance: ITerminalInstance): Promise<TerminalEditorInput> {
		await group.openEditor(store.add(new TestFileEditorInput(URI.file(`/file${group.id}`), TEST_EDITOR_ID)), { pinned: true });
		const input = store.add(terminalEditorService.getInputFromResource(terminalEditorService.resolveResource(instance)));
		await group.openEditor(input, { pinned: true, inactive: true });
		return input;
	}

	function getState(instance: ITerminalInstance, input: TerminalEditorInput) {
		return {
			instances: terminalEditorService.instances.map(instance => instance.instanceId),
			trackedInput: terminalEditorService.getInputFromResource(instance.resource) === input,
			groups: part.groups.filter(group => group.contains(input)).map(group => ({ id: group.id, active: group.activeEditor === input })),
		};
	}

	test('keeps an inactive terminal editor tracked and revealable when it moves to another group', async () => {
		const source = part.activeGroup;
		const target = part.addGroup(source, GroupDirection.RIGHT);
		const instance = createTerminalInstance(1);
		const input = await openInactiveTerminalEditor(source, instance);
		await target.openEditor(store.add(new TestFileEditorInput(URI.file('/target'), TEST_EDITOR_ID)), { pinned: true });

		source.moveEditor(input, target, { inactive: true, preserveFocus: true });
		deepStrictEqual(getState(instance, input), { instances: [1], trackedInput: true, groups: [{ id: target.id, active: false }] });

		await terminalEditorService.focusInstance(instance);
		deepStrictEqual(getState(instance, input), { instances: [1], trackedInput: true, groups: [{ id: target.id, active: true }] });
	});

	test('keeps an inactive terminal editor tracked and revealable when its group moves away', async () => {
		const source = part.activeGroup;
		const instance = createTerminalInstance(1);
		const input = await openInactiveTerminalEditor(source, instance);

		// Moving a group to another window copies the group, which shares its editors, and then closes all of its editors
		const target = part.copyGroup(source, source, GroupDirection.RIGHT);
		await source.closeAllEditors({ force: true });
		part.removeGroup(source);
		deepStrictEqual(getState(instance, input), { instances: [1], trackedInput: true, groups: [{ id: target.id, active: false }] });

		await terminalEditorService.focusInstance(instance);
		deepStrictEqual(getState(instance, input), { instances: [1], trackedInput: true, groups: [{ id: target.id, active: true }] });
	});

	test('removes a terminal editor once it closes in its last group', async () => {
		const group = part.activeGroup;
		const instance = createTerminalInstance(1);
		const input = await openInactiveTerminalEditor(group, instance);

		await group.closeEditor(input);

		deepStrictEqual(terminalEditorService.instances, []);
	});
});
