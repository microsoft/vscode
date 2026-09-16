/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffEditorOptions } from '../../../../../editor/common/multiDiffEditor.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextDiffEditorPane, isResourceMultiDiffEditorInput } from '../../../../../workbench/common/editor.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IDecorationsProvider, IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionChangeset, ISessionFileChange, TURN_CHANGES_CHANGESET_ID, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { ISessionChangesService, SessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('SessionChangesService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const noActiveSessionResource = constObservable<URI | undefined>(undefined);
	const noChanges = constObservable<readonly ISessionFileChange[]>([]);
	const emptyDecorationsService = new class extends mock<IDecorationsService>() {
		override registerDecorationsProvider() {
			return Disposable.None;
		}
	};

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
			const changesViewService = new class extends mock<IChangesViewService>() {
				override readonly activeSessionResourceObs = noActiveSessionResource;
				override readonly activeSessionChangesetObs = constObservable<ISessionChangeset | undefined>(undefined);
				override readonly activeSessionChangesObs = noChanges;
			};
			instantiationService.stub(IChangesViewService, changesViewService);
			const service = disposables.add(new SessionChangesService(
				editorService,
				instantiationService,
				layoutService,
				changesViewService,
				emptyDecorationsService,
			));
			instantiationService.stub(ISessionChangesService, service);

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
			override readonly activeSessionResourceObs = noActiveSessionResource;
			override readonly activeSessionChangesObs = noChanges;
			override setChangesetId(changesetId: string | undefined): void {
				selections.push({ changesetId });
			}
			override showChangeset(changeset: ISessionChangeset): void {
				selections.push({ transientChangesetId: changeset.id });
			}
		}();
		const service = disposables.add(new SessionChangesService(
			editorService,
			disposables.add(new TestInstantiationService()),
			layoutService,
			changesViewService,
			emptyDecorationsService,
		));
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
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		}();
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = noActiveSessionResource;
			override readonly activeSessionChangesetObs = constObservable<ISessionChangeset | undefined>(undefined);
			override readonly activeSessionChangesObs = noChanges;
			override showChangeset(changeset: ISessionChangeset): void {
				selections.push(changeset.id);
			}
		}();
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IChangesViewService, changesViewService);
		const service = disposables.add(new SessionChangesService(editorService, instantiationService, layoutService, changesViewService, emptyDecorationsService));
		instantiationService.stub(ISessionChangesService, service);

		await service.openChangesEditor(URI.parse('agent-host:test-session'), {
			changesetSelection: { kind: 'transient', changeset: upcastPartial<ISessionChangeset>({ id: 'turn:request' }) },
		});
		assert.deepStrictEqual(selections, ['turn:request']);
	});

	test('decorates only when the uncommitted changeset is selected', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const activeSessionResource = observableValue<URI | undefined>('activeSessionResource', undefined);
		const activeChangeset = observableValue<ISessionChangeset | undefined>('activeChangeset', upcastPartial<ISessionChangeset>({
			id: UNCOMMITTED_CHANGES_CHANGESET_ID,
		}));
		const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = activeSessionResource;
			override readonly activeSessionChangesetObs = activeChangeset;
			override readonly activeSessionChangesObs = changes;
		};
		const providers: IDecorationsProvider[] = [];
		const decorationsService = new class extends mock<IDecorationsService>() {
			override registerDecorationsProvider(provider: IDecorationsProvider) {
				providers.push(provider);
				return Disposable.None;
			}
		};
		const layoutService = new class extends mock<IAgentWorkbenchLayoutService>() {
			override readonly isSinglePaneLayoutEnabled = true;
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		};
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IWorkbenchLayoutService, layoutService],
			[IChangesViewService, changesViewService],
		)));
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const input = args[0];
				if (input instanceof SessionChangesEditorInput) {
					disposables.add(input);
				}
				return undefined;
			}
		};
		const service = disposables.add(new SessionChangesService(
			editorService,
			instantiationService,
			layoutService,
			changesViewService,
			decorationsService,
		));
		instantiationService.stub(ISessionChangesService, service);
		activeSessionResource.set(sessionResource, undefined);
		changes.set([{
			uri: URI.file('/workspace/file.ts'),
			insertions: 1,
			deletions: 0,
		}], undefined);

		await service.openChangesEditor(sessionResource);
		await service.openChangesEditor(sessionResource);
		await service.openChangesEditor(sessionResource);

		const editorResource = service.getChangesEditorResource(sessionResource);
		const uncommittedChangesDecoration = providers[0].provideDecorations(editorResource, CancellationToken.None);
		const uncommittedChangesCount = service.activeSessionUncommittedChangesCountObs.get();
		activeChangeset.set(upcastPartial<ISessionChangeset>({ id: TURN_CHANGES_CHANGESET_ID }), undefined);
		const turnChangesCount = service.activeSessionUncommittedChangesCountObs.get();

		assert.deepStrictEqual({
			providerCount: providers.length,
			uncommittedChangesDecoration,
			uncommittedChangesCount,
			turnChangesCount,
		}, {
			providerCount: 1,
			uncommittedChangesDecoration: {
				weight: 100,
				letter: '1',
				tooltip: '1 file',
			},
			uncommittedChangesCount: 1,
			turnChangesCount: undefined,
		});
	});
});
