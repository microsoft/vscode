/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GroupIdentifier } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart, IAuxiliaryEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance, ITerminalInstanceService } from '../../browser/terminal.js';
import { TerminalEditorService } from '../../browser/terminalEditorService.js';
import { ITerminalStatusList } from '../../browser/terminalStatusList.js';

function createTerminalInstance(instanceId: number): ITerminalInstance {
	return new class extends mock<ITerminalInstance>() {
		override readonly instanceId = instanceId;
		override readonly resource = URI.parse(`vscode-terminal:/${instanceId}`);
		override target = TerminalLocation.Editor;
		override readonly onDidFocus = Event.None;
		override readonly onDidBlur = Event.None;
		override readonly onExit = Event.None;
		override readonly onDisposed = Event.None;
		override readonly onTitleChanged = Event.None;
		override readonly onIconChanged = Event.None;
		override readonly capabilities = new class extends mock<ITerminalCapabilityStore>() {
			override readonly onDidChangeCapabilities = Event.None;
		}();
		override readonly statusList = new class extends mock<ITerminalStatusList>() {
			override readonly onDidChangePrimaryStatus = Event.None;
		}();
		override dispose(): void { }
	}();
}

suite('TerminalEditorService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('splits within the source auxiliary part after leaving compact mode', async () => {
		const sourceInstance = createTerminalInstance(1);
		const targetInstance = createTerminalInstance(2);
		const sourceGroup = new class extends mock<IEditorGroup>() {
			override readonly id = 1;
		}();
		let openedEditor: EditorInput | undefined;
		const targetGroup = new class extends mock<IEditorGroup>() {
			override readonly isLocked = false;
			override async openEditor(editor: EditorInput) {
				openedEditor = editor;
				return undefined;
			}
		}();
		const compactModes: boolean[] = [];
		let addedLocation: IEditorGroup | GroupIdentifier | undefined;
		const sourcePart = new class extends mock<IAuxiliaryEditorPart>() {
			override readonly windowId = 2;
			override setCompactMode(compact: boolean): void {
				compactModes.push(compact);
			}
			override activateGroup() {
				return sourceGroup;
			}
			override findGroup() {
				return undefined;
			}
			override addGroup(location: IEditorGroup | GroupIdentifier) {
				addedLocation = location;
				return targetGroup;
			}
		}();
		const mainPart = new class extends mock<IEditorPart>() {
			override readonly windowId = 1;
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override readonly mainPart = mainPart;
			override getPart() {
				return sourcePart;
			}
		}();
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IEditorGroupsService, editorGroupsService);
		instantiationService.stub(ITerminalInstanceService, 'createInstance', () => targetInstance);
		const terminalEditorService = store.add(instantiationService.createInstance(TerminalEditorService));
		const sourceInput = store.add(terminalEditorService.getInputFromResource(terminalEditorService.resolveResource(sourceInstance)));
		sourceInput.setGroup(sourceGroup);

		await terminalEditorService.splitInstance(sourceInstance);
		const targetInput = store.add(terminalEditorService.getInputFromResource(targetInstance.resource));

		assert.deepStrictEqual({
			compactModes,
			addedToSourceGroup: addedLocation === sourceGroup,
			openedTargetInput: openedEditor === targetInput,
		}, {
			compactModes: [false],
			addedToSourceGroup: true,
			openedTargetInput: true,
		});
	});
});
