/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffResourceId } from '../../../../../editor/common/multiDiffEditor.js';
import { DiffEditorViewMode } from '../../../../../editor/common/config/editorOptions.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { IDiffEditorOptionsService, SessionsWordWrap } from '../../../editor/common/diffEditorOptionsService.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const emptyChangesViewService = new class extends mock<IChangesViewService>() {
		override readonly activeSessionChangesObs = constObservable<readonly ISessionFileChange[]>([]);
		override readonly activeSessionResourceObs = constObservable<URI | undefined>(undefined);
		override readonly activeSessionChangesetLoadingObs = constObservable(false);
	};
	const emptySessionChangesService = new class extends mock<ISessionChangesService>() {
		override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
	};
	const sessionChangesServiceWithResource = new class extends mock<ISessionChangesService>() {
		override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
		override getSessionResource(): URI | undefined {
			return URI.parse('agent-host-copilotcli:/session');
		}
	};

	test('releases resolved multi-diff models without disposing restorable input state', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		});
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(ITextModelService, new class extends mock<ITextModelService>() { }());
		const viewModel = disposables.add(instantiationService.createInstance(MultiDiffEditorViewModel, {
			documents: ValueWithChangeEvent.const([]),
		}));

		let firstModelReferenceDisposed = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => viewModel,
			dispose: () => firstModelReferenceDisposed = true,
		});

		const input = disposables.add(instantiationService.createInstance(
			SessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		await input.getViewModel();
		input.clear();

		let secondModelResolved = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => {
				secondModelResolved = true;
				return viewModel;
			},
			dispose: () => { },
		});
		await input.getViewModel();

		assert.deepStrictEqual({
			firstModelReferenceDisposed,
			outerInputDisposed: input.isDisposed(),
			secondModelResolved,
		}, {
			firstModelReferenceDisposed: true,
			outerInputDisposed: false,
			secondModelResolved: true,
		});
	});

	test('clearing the editor pane releases the resolved multi-diff model', () => {
		class TestSessionChangesEditor extends SessionChangesEditor {
			setCurrentInput(input: SessionChangesEditorInput): void {
				this._input = input;
			}
		}

		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			released = false;

			override clear(): void {
				this.released = true;
				super.clear();
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidChangePartVisibility: Event.None,
			isVisible: () => true,
		});

		const editor = disposables.add(instantiationService.createInstance(TestSessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		editor.setCurrentInput(input);

		editor.clearInput();

		assert.deepStrictEqual({
			inputReleased: input.released,
			editorInput: editor.input,
		}, {
			inputReleased: true,
			editorInput: undefined,
		});
	});

	test('defers revealing a snapshot-backed resource until its diff item resolves', () => {
		const originalUri = URI.parse('snapshot:/before/file.ts');
		const modifiedUri = URI.parse('snapshot:/after/file.ts');
		const item = new class extends mock<DocumentDiffItemViewModel>() {
			override get originalUri() { return originalUri; }
			override get modifiedUri() { return modifiedUri; }
		}();
		const items = observableValue<readonly DocumentDiffItemViewModel[]>('items', []);
		const viewModel = new class extends mock<MultiDiffEditorViewModel>() {
			override readonly items = items;
		}();
		const revealed: IMultiDiffResourceId[] = [];
		const widget = new class extends mock<MultiDiffEditorWidget>() {
			override reveal(resource: IMultiDiffResourceId): void {
				revealed.push(resource);
			}
		}();
		const pendingReveal = disposables.add(new MutableDisposable());
		const editor = Object.create(SessionChangesEditor.prototype) as SessionChangesEditor;
		Object.defineProperties(editor, {
			viewModel: { value: viewModel, writable: true },
			widget: { value: widget, writable: true },
			_pendingReveal: { value: pendingReveal },
		});

		editor.setOptions({
			viewState: {
				revealData: {
					resource: { original: originalUri, modified: modifiedUri },
				},
			},
		});
		const beforeResolution = [...revealed];
		items.set([item], undefined);

		assert.deepStrictEqual({
			beforeResolution,
			afterResolution: revealed.map(resource => ({
				original: resource.original?.toString(),
				modified: resource.modified?.toString(),
			})),
			pending: pendingReveal.value !== undefined,
		}, {
			beforeResolution: [],
			afterResolution: [{
				original: originalUri.toString(),
				modified: modifiedUri.toString(),
			}],
			pending: false,
		});
	});

	test('does not resolve a canceled editor input', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequested = false;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequested = true;
				throw new Error('Canceled input must not be resolved');
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidChangePartVisibility: Event.None,
			isVisible: () => true,
		});

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		const operation = disposables.add(new CancellationTokenSource());
		operation.cancel();

		await editor.setInput(input, undefined, {}, operation.token);

		assert.deepStrictEqual(input.viewModelRequested, false);
	});

	test('resolves a hidden editor input once the editor area is shown, even after the open operation ended', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequests = 0;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequests++;
				return new class extends mock<MultiDiffEditorViewModel>() {
					override readonly items = constObservable<readonly DocumentDiffItemViewModel[]>([]);
				}();
			}
		}

		let editorVisible = false;
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = {
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: (part: Parts) => part === Parts.EDITOR_PART && editorVisible,
		};
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.stub(ISessionChangesService, sessionChangesServiceWithResource);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		const operation = disposables.add(new CancellationTokenSource());

		await editor.setInput(input, undefined, {}, operation.token);
		const requestsWhileHidden = input.viewModelRequests;
		operation.cancel();

		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			requestsWhileHidden,
			requestsAfterShown: input.viewModelRequests,
			hasViewModel: editor.hasViewModel,
		}, {
			requestsWhileHidden: 0,
			requestsAfterShown: 1,
			hasViewModel: true,
		});
	});

	test('drops a deferred resolve when the input is cleared before the editor area is shown', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequests = 0;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequests++;
				return new class extends mock<MultiDiffEditorViewModel>() { }();
			}
		}

		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = {
			onDidChangePartVisibility: onDidChangePartVisibility.event,
			isVisible: () => false,
		};
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
		instantiationService.stub(ISessionChangesService, sessionChangesServiceWithResource);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));

		await editor.setInput(input, undefined, {}, CancellationToken.None);
		editor.clearInput();
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.strictEqual(input.viewModelRequests, 0);
	});

	test('updates managed Changes editor capabilities with editor area visibility', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		let editorVisible = false;
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && editorVisible;
			}
		};
		const input = disposables.add(new SessionChangesEditorInput(
			URI.parse('test-changes:session'),
			instantiationService,
			emptySessionChangesService,
			layoutService,
		));
		let capabilitiesChanges = 0;
		disposables.add(input.onDidChangeCapabilities(() => capabilitiesChanges++));

		const hiddenCapabilities = input.capabilities;
		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		assert.deepStrictEqual({
			hiddenCapabilities,
			visibleCapabilities: input.capabilities,
			capabilitiesChanges
		}, {
			hiddenCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.Readonly |
				EditorInputCapabilities.CannotClose,
			visibleCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.Readonly,
			capabilitiesChanges: 1
		});
	});

	test('updates the tab badge class and accessible label with the changed file count', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		};
		const resource = URI.parse('test-changes:session');
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = derived(reader => changes.read(reader).length);
		};
		const input = disposables.add(new SessionChangesEditorInput(
			resource,
			instantiationService,
			sessionChangesService,
			layoutService,
		));
		let labelChanges = 0;
		disposables.add(input.onDidChangeLabel(() => labelChanges++));

		changes.set([createFileChange(1)], undefined);
		const oneChangeAriaLabel = input.getAriaLabel();
		changes.set(Array.from({ length: 10 }, (_, index) => createFileChange(index)), undefined);

		assert.deepStrictEqual({
			oneChangeAriaLabel,
			tenChangesAriaLabel: input.getAriaLabel(),
			labelExtraClasses: input.getLabelExtraClasses(),
			labelChanges,
		}, {
			oneChangeAriaLabel: 'Changes, 1 file',
			tenChangesAriaLabel: 'Changes, 10 files',
			labelExtraClasses: ['session-changes-editor-label'],
			labelChanges: 2,
		});
	});

	for (const loadingSettles of [true, false]) {
		test(`keeps showing the replaced input's diffs until the incoming session's changes load (load settles: ${loadingSettles})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const outgoingSource = URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/outgoing"}');
			const incomingSource = URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/incoming"}');
			const activeSession = observableValue<URI | undefined>('activeSession', URI.parse('agent-host-copilotcli:/outgoing'));
			const changesLoading = observableValue('changesLoading', false);
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
				override contextMatchesRules(): boolean { return true; }
			});
			instantiationService.stub(IMenuService, disposables.add(instantiationService.createInstance(MenuService)));
			instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() {
				override readonly activeSessionHasGitRepositoryObs = constObservable(false);
				override readonly activeSessionResourceObs = activeSession;
				override readonly activeSessionChangesetLoadingObs = changesLoading;
				override readonly activeSessionChangesObs = constObservable<readonly ISessionFileChange[]>([]);
			}());
			const layoutService = { agentWorkbenchLayout: AgentWorkbenchLayout.Desktop, onDidChangePartVisibility: Event.None, isVisible: () => true };
			instantiationService.stub(IAgentWorkbenchLayoutService, layoutService);
			instantiationService.stub(IWorkbenchLayoutService, layoutService);
			instantiationService.stub(ISessionChangesService, new class extends mock<ISessionChangesService>() {
				override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
				override getSessionResource(resource: URI): URI | undefined {
					return URI.parse(JSON.parse(resource.query).sessionResource);
				}
			}());
			instantiationService.stub(IDiffEditorOptionsService, new class extends mock<IDiffEditorOptionsService>() {
				override readonly viewMode = constObservable<DiffEditorViewMode>('automatic');
				override readonly diffEditorWordWrap = constObservable<SessionsWordWrap>('off');
			}());
			const shownViewModel = observableValue<MultiDiffEditorViewModel | undefined>('shownViewModel', undefined);
			instantiationService.stubInstance(MultiDiffEditorWidget, {
				viewModel: shownViewModel,
				onDidChangeActiveControl: Event.None,
				setPaddingBottom() { },
				setVariant() { },
				setDiffLayoutOptions() { },
				setViewModel(viewModel: MultiDiffEditorViewModel | undefined) { shownViewModel.set(viewModel, undefined); },
				getViewState() { return { scrollState: { top: 0, left: 0 } }; },
				layout() { },
				dispose() { },
			});

			const disposedViewModels: string[] = [];
			const createInput = (source: URI, name: string) => {
				const viewModel = new class extends mock<MultiDiffEditorViewModel>() {
					override readonly isLoading = observableValue('isLoading', false);
					override readonly items = constObservable<readonly DocumentDiffItemViewModel[]>([]);
					override toString() { return name; }
				}();
				instantiationService.stubInstance(MultiDiffEditorInput, {
					getViewModel: async () => viewModel,
					dispose: () => disposedViewModels.push(name),
				});
				const input = disposables.add(instantiationService.createInstance(SessionChangesEditorInput, source));
				assert.ok(input.multiDiffInput);
				return input;
			};
			const parent = append(mainWindow.document.body, $('.editor-instance'));
			disposables.add(toDisposable(() => parent.remove()));
			const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
			editor.create(parent);

			const outgoing = createInput(outgoingSource, 'outgoing');
			await editor.setInput(outgoing, undefined, {}, CancellationToken.None);
			const incoming = createInput(incomingSource, 'incoming');
			activeSession.set(URI.parse('agent-host-copilotcli:/incoming'), undefined);
			changesLoading.set(true, undefined);
			editor.clearInput();
			const switched = editor.setInput(incoming, undefined, {}, CancellationToken.None);
			outgoing.dispose();
			await timeout(0);
			const whileLoading = { shown: String(shownViewModel.get()), disposed: [...disposedViewModels] };
			if (loadingSettles) {
				changesLoading.set(false, undefined);
			} else {
				await timeout(1000);
			}
			await switched;
			const afterLoading = { shown: String(shownViewModel.get()), disposed: [...disposedViewModels] };
			editor.clearInput();
			await editor.setInput(incoming, { forceReload: true }, {}, CancellationToken.None);
			await timeout(0);
			const afterReload = { shown: String(shownViewModel.get()), disposed: [...disposedViewModels] };
			editor.clearInput();
			await timeout(0);

			assert.deepStrictEqual({ whileLoading, afterLoading, afterReload, afterClear: { shown: String(shownViewModel.get()), disposed: disposedViewModels } }, {
				whileLoading: { shown: 'outgoing', disposed: [] },
				afterLoading: { shown: 'incoming', disposed: ['outgoing'] },
				afterReload: { shown: 'incoming', disposed: ['outgoing'] },
				afterClear: { shown: 'undefined', disposed: ['outgoing', 'incoming'] },
			});
		}));
	}
});

function createFileChange(index: number): ISessionFileChange {
	const uri = URI.file(`/workspace/file${index}.ts`);
	return {
		uri,
		originalUri: uri.with({ scheme: 'git', query: 'ref=base' }),
		modifiedUri: uri.with({ scheme: 'git', query: 'ref=head' }),
		insertions: 1,
		deletions: 0,
	};
}
