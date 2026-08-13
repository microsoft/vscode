/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffEditorOptions } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextDiffEditorPane, isResourceMultiDiffEditorInput } from '../../../../../workbench/common/editor.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionChangeset, TURN_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { SessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('SessionChangesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('expands a revealed file in both Changes editor layouts', async () => {
		const originalUri = URI.file('/workspace/file.original.ts');
		const modifiedUri = URI.file('/workspace/file.ts');
		const otherItem = new class extends mock<DocumentDiffItemViewModel>() {
			override get originalUri() { return URI.file('/workspace/other.original.ts'); }
			override get modifiedUri() { return URI.file('/workspace/other.ts'); }
		}();
		const targetItem = new class extends mock<DocumentDiffItemViewModel>() {
			override get originalUri() { return originalUri; }
			override get modifiedUri() { return modifiedUri; }
		}();
		const expandedItems: DocumentDiffItemViewModel[] = [];
		const viewModel = new class extends mock<MultiDiffEditorViewModel>() {
			override readonly items = constObservable([otherItem, targetItem]);
			override expand(item: DocumentDiffItemViewModel): void {
				expandedItems.push(item);
			}
		}();
		const plainInput = Object.create(MultiDiffEditorInput.prototype) as MultiDiffEditorInput;
		plainInput.getViewModel = async () => viewModel;
		const group = new class extends mock<IEditorGroup>() { }();
		const options: IMultiDiffEditorOptions = {
			viewState: {
				revealData: {
					resource: { original: originalUri, modified: modifiedUri },
				},
			},
		};

		for (const isSinglePaneLayoutEnabled of [true, false]) {
			const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
				override readonly isSinglePaneLayoutEnabled = isSinglePaneLayoutEnabled;
				override readonly onDidChangePartVisibility = Event.None;
				override isVisible(): boolean { return true; }
			}();
			const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
				[IWorkbenchLayoutService, layoutService],
			)));
			instantiationService.stubInstance(MultiDiffEditorInput, {
				dispose: () => { },
				getViewModel: async () => viewModel,
			});
			const editorService = new class extends mock<IEditorService>() {
				override async openEditor(...args: unknown[]): Promise<ITextDiffEditorPane | undefined> {
					const requestedInput = args[0];
					const input = requestedInput instanceof SessionChangesEditorInput
						? disposables.add(requestedInput)
						: plainInput;
					return new class extends mock<ITextDiffEditorPane>() {
						override readonly input = input;
						override readonly group = group;
					}();
				}
			}();
			const service = new SessionChangesService(
				editorService,
				instantiationService,
				layoutService,
				new class extends mock<IChangesViewService>() { },
			);

			await service.openChangesEditor(URI.parse('test-session:/session'), options);
		}

		assert.deepStrictEqual(expandedItems.map(item => item === targetItem ? 'target' : 'other'), ['target', 'target']);
	});

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
