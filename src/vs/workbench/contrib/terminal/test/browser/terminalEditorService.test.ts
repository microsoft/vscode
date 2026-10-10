/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorCloseContext, IEditorCloseEvent } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalInstance, ITerminalInstanceService } from '../../browser/terminal.js';
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
