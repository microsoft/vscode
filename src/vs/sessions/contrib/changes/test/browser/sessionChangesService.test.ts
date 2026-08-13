/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { isResourceMultiDiffEditorInput } from '../../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionChangeset, TURN_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { SessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('SessionChangesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('selects the requested changeset before opening the editor', async () => {
		const selections: object[] = [];
		const opened: { readonly multiDiffSource: string; readonly preserveFocus: boolean | undefined }[] = [];
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (isResourceMultiDiffEditorInput(editor)) {
					opened.push({
						multiDiffSource: editor.multiDiffSource?.toString() ?? '',
						preserveFocus: editor.options?.preserveFocus,
					});
				}
				return undefined;
			}
		}();
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly isSinglePaneLayoutEnabled = false;
		}();
		const changesViewService = new class extends mock<IChangesViewService>() {
			override setChangesetId(changesetId: string | undefined): void {
				selections.push({ changesetId });
			}
			override showChangeset(changeset: ISessionChangeset): void {
				selections.push({ transientChangesetId: changeset.id });
			}
		}();
		const service = new SessionChangesService(
			editorService,
			disposables.add(new TestInstantiationService()),
			layoutService,
			changesViewService,
		);
		const sessionResource = URI.parse('agent-host:test-session');

		await service.openChangesEditor(sessionResource, {
			changesetSelection: { kind: 'id', id: TURN_CHANGES_CHANGESET_ID },
			preserveFocus: true,
		});
		await service.openChangesEditor(sessionResource, { changesetSelection: { kind: 'id', id: undefined } });
		await service.openChangesEditor(sessionResource, {
			changesetSelection: { kind: 'transient', changeset: upcastPartial<ISessionChangeset>({ id: 'turn:request' }) },
		});

		assert.deepStrictEqual({ selections, opened }, {
			selections: [
				{ changesetId: TURN_CHANGES_CHANGESET_ID },
				{ changesetId: undefined },
				{ transientChangesetId: 'turn:request' },
			],
			opened: [
				{
					multiDiffSource: 'changes-multi-diff-source:?%7B%22sessionResource%22%3A%22agent-host%3Atest-session%22%7D',
					preserveFocus: true,
				},
				{
					multiDiffSource: 'changes-multi-diff-source:?%7B%22sessionResource%22%3A%22agent-host%3Atest-session%22%7D',
					preserveFocus: undefined,
				},
				{
					multiDiffSource: 'changes-multi-diff-source:?%7B%22sessionResource%22%3A%22agent-host%3Atest-session%22%7D',
					preserveFocus: undefined,
				},
			],
		});
	});

	test('selects the requested changeset in the single-pane layout', async () => {
		const selections: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		});
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (editor instanceof SessionChangesEditorInput) {
					disposables.add(editor);
				}
				return undefined;
			}
		}();
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly isSinglePaneLayoutEnabled = true;
		}();
		const changesViewService = new class extends mock<IChangesViewService>() {
			override showChangeset(changeset: ISessionChangeset): void {
				selections.push(changeset.id);
			}
		}();
		const service = new SessionChangesService(editorService, instantiationService, layoutService, changesViewService);

		await service.openChangesEditor(URI.parse('agent-host:test-session'), {
			changesetSelection: { kind: 'transient', changeset: upcastPartial<ISessionChangeset>({ id: 'turn:request' }) },
		});

		assert.deepStrictEqual(selections, ['turn:request']);
	});
});
