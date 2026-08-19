/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { GroupModelChangeKind } from '../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService, IModalEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorsChangeEvent, IEditorService } from '../../../services/editor/common/editorService.js';
import { TestEditorInput } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadEditorTabs } from '../../browser/mainThreadEditorTabs.js';
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
});
