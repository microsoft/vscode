/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { Context as SuggestContext } from '../../../../../editor/contrib/suggest/browser/suggest.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { createWorkbenchDialogOptions } from '../../../../../workbench/browser/parts/dialogs/dialog.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { GitRefType, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { ISession, ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AutomationIsolationGroupActionViewItem, AutomationSessionDraftSynchronizer, canSelectAutomationWorkspace, IFormState, IValidationState, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, resolveAutomationModelIdentifier, shouldPassThroughAutomationDialogCommand, updateSaveButtonState } from '../../browser/automationDialog.js';
import { AutomationIsolationModel } from '../../common/isolationGroupModel.js';

const FOLDER = URI.file('/workspace');

function dispatchKey(target: HTMLElement, type: 'keydown' | 'keyup', key: string, shiftKey = false): KeyboardEvent {
	const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, shiftKey });
	target.dispatchEvent(event);
	return event;
}

function dispatchAutomationDialogCommand(target: HTMLElement, commandId: string): KeyboardEvent {
	const options = createWorkbenchDialogOptions(
		{},
		upcastPartial<IKeybindingService>({
			softDispatch: () => ({ kind: ResultKind.KbFound, commandId, commandArgs: undefined, isBubble: false }),
		}),
		upcastPartial<ILayoutService>({ activeContainer: document.body }),
		upcastPartial<IHostService>({}),
		new Set(),
		(id, event) => shouldPassThroughAutomationDialogCommand(id, event.target),
	);
	target.addEventListener('keydown', event => options.keyEventProcessor?.(new StandardKeyboardEvent(event)), { once: true });
	return dispatchKey(target, 'keydown', 'z');
}

class RecordingActionWidgetService extends mock<IActionWidgetService>() {
	override isVisible = false;
	labels: readonly string[] = [];
	details: ReadonlyArray<IActionListItem<unknown>['detail']> = [];
	ariaLabels: readonly string[] = [];
	private selectItem: ((label: string) => void) | undefined;
	private hideWidget: ((didCancel?: boolean) => void) | undefined;

	override show<T>(
		_user: string,
		_supportsPreview: boolean,
		items: readonly IActionListItem<T>[],
		delegate: IActionListDelegate<T>,
		_anchor: HTMLElement | StandardMouseEvent | IAnchor,
		_container: HTMLElement | undefined,
		_actionBarActions: readonly IAction[],
		accessibilityProvider?: Partial<IListAccessibilityProvider<IActionListItem<T>>>,
		_listOptions?: IActionListOptions,
	): void {
		this.isVisible = true;
		this.labels = items.map(item => item.label ?? '');
		this.details = items.map(item => item.detail);
		this.ariaLabels = items.map(item => {
			const label = accessibilityProvider?.getAriaLabel?.(item);
			return typeof label === 'string' ? label : label?.get() ?? '';
		});
		this.selectItem = label => {
			const item = items.find(candidate => candidate.label === label)?.item;
			if (item) {
				delegate.onSelect(item);
			}
		};
		this.hideWidget = delegate.onHide;
	}

	override updateItems<T>(items: readonly IActionListItem<T>[], _focusItemId?: string): void {
		this.labels = items.map(item => item.label ?? '');
	}
	override focusItemById(_itemId: string): void { }

	override hide(didCancel?: boolean): void {
		if (!this.isVisible) {
			return;
		}
		this.isVisible = false;
		const onHide = this.hideWidget;
		this.hideWidget = undefined;
		onHide?.(didCancel);
	}

	select(label: string): void {
		this.selectItem?.(label);
	}
}

function createFormState(overrides?: Partial<IFormState>): IFormState {
	return {
		name: 'Automation',
		interval: 'daily',
		hour: 9,
		minute: 0,
		day: 1,
		isQuickChat: false,
		folderUri: FOLDER,
		providerId: 'default-copilot',
		sessionTypeId: 'copilotcli',
		isolationMode: 'worktree',
		branch: undefined,
		enabled: true,
		...overrides,
	};
}

function createWorkspace(requiresWorkspaceTrust: boolean): ISessionWorkspace {
	return {
		uri: FOLDER,
		label: 'Workspace',
		icon: Codicon.folder,
		folders: [{ root: FOLDER, workingDirectory: FOLDER, name: 'Workspace', description: undefined }],
		requiresWorkspaceTrust,
		isVirtualWorkspace: false,
	};
}

function createAutomationDraftService() {
	const automationSession = observableValue<ISession | undefined>('automationSession', undefined);
	const created: Array<{ kind: 'workspace' | 'quickChat'; providerId: string | undefined; sessionTypeId: string; folderUri?: string }> = [];
	const discarded: string[] = [];
	let nextId = 1;
	const createDraft = (kind: 'workspace' | 'quickChat', providerId: string | undefined, sessionTypeId: string, folderUri?: URI): ISession => {
		const previous = automationSession.get();
		if (previous) {
			discarded.push(previous.sessionId);
		}
		const session = upcastPartial<ISession>({
			sessionId: `automation-${nextId++}`,
			providerId: providerId ?? 'resolved-provider',
			sessionType: sessionTypeId,
		});
		created.push({ kind, providerId, sessionTypeId, folderUri: folderUri?.toString() });
		automationSession.set(session, undefined);
		return session;
	};
	const service = upcastPartial<ISessionsManagementService>({
		automationSession,
		createAutomationSession: (folderUri, options) => createDraft('workspace', options?.providerId, options?.sessionTypeId ?? 'default', folderUri),
		createAutomationQuickChat: options => createDraft('quickChat', options?.providerId, options?.sessionTypeId ?? 'default'),
		discardAutomationSession: session => {
			const current = automationSession.get();
			if (!current || (session && session.sessionId !== current.sessionId)) {
				return;
			}
			discarded.push(current.sessionId);
			automationSession.set(undefined, undefined);
		},
	});
	return { service, created, discarded };
}

suite('Automation session draft synchronization', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks target changes without recreating an equal workspace target', async () => {
		const { service, created, discarded } = createAutomationDraftService();
		let errorCount = 0;
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => errorCount++));

		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///workspace'), providerId: 'provider-a', sessionTypeId: 'type-a' });
		await synchronizer.waitForSync();
		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///workspace'), providerId: 'provider-a', sessionTypeId: 'type-a' });
		await synchronizer.waitForSync();
		service.discardAutomationSession();
		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///workspace'), providerId: 'provider-a', sessionTypeId: 'type-a' });
		await synchronizer.waitForSync();
		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///workspace'), providerId: 'provider-b', sessionTypeId: 'type-b' });
		await synchronizer.waitForSync();
		synchronizer.update({ kind: 'quickChat', providerId: 'provider-b', sessionTypeId: 'type-b' });
		await synchronizer.waitForSync();
		synchronizer.update(undefined);
		await synchronizer.waitForSync();

		assert.deepStrictEqual({
			created,
			discarded,
			currentSession: service.automationSession.get()?.sessionId,
			errorCount,
		}, {
			created: [
				{ kind: 'workspace', providerId: 'provider-a', sessionTypeId: 'type-a', folderUri: 'file:///workspace' },
				{ kind: 'workspace', providerId: 'provider-a', sessionTypeId: 'type-a', folderUri: 'file:///workspace' },
				{ kind: 'workspace', providerId: 'provider-b', sessionTypeId: 'type-b', folderUri: 'file:///workspace' },
				{ kind: 'quickChat', providerId: 'provider-b', sessionTypeId: 'type-b', folderUri: undefined },
			],
			discarded: ['automation-1', 'automation-2', 'automation-3', 'automation-4'],
			currentSession: undefined,
			errorCount: 0,
		});
	});

	test('ignores stale workspace validation', async () => {
		const { service, created } = createAutomationDraftService();
		const firstWorkspaceValidation = new DeferredPromise<boolean>();
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(
			service,
			folderUri => folderUri.path === '/first' ? firstWorkspaceValidation.p : Promise.resolve(true),
			() => { },
		));

		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///first'), providerId: 'provider', sessionTypeId: 'type' });
		await Promise.resolve();
		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///second'), providerId: 'provider', sessionTypeId: 'type' });
		await synchronizer.waitForSync();
		firstWorkspaceValidation.complete(true);
		await Promise.resolve();

		assert.deepStrictEqual(created, [
			{ kind: 'workspace', providerId: 'provider', sessionTypeId: 'type', folderUri: 'file:///second' },
		]);
	});

	test('surfaces workspace validation failures without creating a draft', async () => {
		const { service, created } = createAutomationDraftService();
		let errorCount = 0;
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(
			service,
			() => Promise.reject(new Error('validation failed')),
			() => errorCount++,
		));

		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///workspace'), providerId: 'provider', sessionTypeId: 'type' });
		await synchronizer.waitForSync();

		assert.deepStrictEqual({
			created,
			currentSession: service.automationSession.get()?.sessionId,
			errorCount,
		}, {
			created: [],
			currentSession: undefined,
			errorCount: 1,
		});
	});

	test('retries an unchanged target after draft creation fails', async () => {
		const automationSession = observableValue<ISession | undefined>('automationSession', undefined);
		let createCount = 0;
		let errorCount = 0;
		const service = upcastPartial<ISessionsManagementService>({
			automationSession,
			createAutomationSession: (_folderUri, options) => {
				if (createCount++ === 0) {
					throw new Error('provider unavailable');
				}
				const session = upcastPartial<ISession>({
					sessionId: 'automation-retry',
					providerId: options?.providerId ?? 'provider',
					sessionType: options?.sessionTypeId ?? 'type',
				});
				automationSession.set(session, undefined);
				return session;
			},
			discardAutomationSession: () => automationSession.set(undefined, undefined),
		});
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => errorCount++));
		const target = { kind: 'workspace', folderUri: URI.parse('file:///workspace'), providerId: 'provider', sessionTypeId: 'type' } as const;

		synchronizer.update(target);
		await synchronizer.waitForSync();
		synchronizer.update(target);
		await synchronizer.waitForSync();

		assert.deepStrictEqual({
			createCount,
			errorCount,
			sessionId: automationSession.get()?.sessionId,
		}, {
			createCount: 2,
			errorCount: 1,
			sessionId: 'automation-retry',
		});
	});
});

suite('Automation workspace trust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects an unresolved workspace using the preferred provider', async () => {
		const resolveRequests: Array<{ folderUri: string; preferredProviderId: string | undefined }> = [];
		const trustRequests: ResourceTrustRequestOptions[] = [];
		const result = await canSelectAutomationWorkspace(
			FOLDER,
			'preferred',
			upcastPartial<ISessionsManagementService>({
				resolveWorkspace: (folderUri, preferredProviderId) => {
					resolveRequests.push({ folderUri: folderUri.toString(), preferredProviderId });
					return undefined;
				},
			}),
			upcastPartial<IWorkspaceTrustRequestService>({
				requestResourcesTrust: async options => {
					trustRequests.push(options);
					return true;
				},
			}),
		);

		assert.deepStrictEqual({
			result,
			resolveRequests,
			trustRequestCount: trustRequests.length,
		}, {
			result: false,
			resolveRequests: [{ folderUri: FOLDER.toString(), preferredProviderId: 'preferred' }],
			trustRequestCount: 0,
		});
	});

	test('accepts a workspace that does not require trust without prompting', async () => {
		const trustRequests: ResourceTrustRequestOptions[] = [];
		const result = await canSelectAutomationWorkspace(
			FOLDER,
			'preferred',
			upcastPartial<ISessionsManagementService>({
				resolveWorkspace: () => ({ providerId: 'preferred', workspace: createWorkspace(false) }),
			}),
			upcastPartial<IWorkspaceTrustRequestService>({
				requestResourcesTrust: async options => {
					trustRequests.push(options);
					return false;
				},
			}),
		);

		assert.deepStrictEqual({
			result,
			trustRequestCount: trustRequests.length,
		}, {
			result: true,
			trustRequestCount: 0,
		});
	});

	for (const trustResult of [true, false, undefined]) {
		test(`returns ${trustResult === true ? 'true when trust is granted' : 'false when trust is ' + (trustResult === false ? 'declined' : 'cancelled')}`, async () => {
			const trustRequests: ResourceTrustRequestOptions[] = [];
			const result = await canSelectAutomationWorkspace(
				FOLDER,
				'preferred',
				upcastPartial<ISessionsManagementService>({
					resolveWorkspace: () => ({ providerId: 'preferred', workspace: createWorkspace(true) }),
				}),
				upcastPartial<IWorkspaceTrustRequestService>({
					requestResourcesTrust: async options => {
						trustRequests.push(options);
						return trustResult;
					},
				}),
			);

			assert.deepStrictEqual({
				result,
				trustRequests: trustRequests.map(request => ({
					uri: request.uri.toString(),
					message: request.message,
				})),
			}, {
				result: trustResult === true,
				trustRequests: [{
					uri: FOLDER.toString(),
					message: 'An agent session will be able to read files, run commands, and make changes in this folder.',
				}],
			});
		});
	}
});

suite('Automation branch picker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createItem(options?: {
		readonly state?: IFormState;
		readonly getRefs?: IGitRepository['getRefs'];
		readonly failOpenRepositoryOnce?: boolean;
		readonly providerInitiallyUnavailable?: boolean;
		readonly revalidate?: () => void;
		readonly visible?: boolean;
	}): {
		readonly container: HTMLElement;
		readonly state: IFormState;
		readonly model: AutomationIsolationModel;
		readonly actionWidgetService: RecordingActionWidgetService;
		readonly getOpenRepositoryAttempts: () => number;
		readonly setProviderAvailable: () => void;
	} {
		const state = options?.state ?? createFormState();
		const model = new AutomationIsolationModel(state);
		const repositoryState = observableValue('repositoryState', {
			HEAD: { type: GitRefType.Head, name: 'main', commit: 'abc123' },
			remotes: [],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
		const repository = upcastPartial<IGitRepository>({
			rootUri: FOLDER,
			state: repositoryState,
			getRefs: options?.getRefs ?? (async () => [
				{ type: GitRefType.Head, name: 'feature/z' },
				{ type: GitRefType.Head, name: 'main' },
				{ type: GitRefType.Head, name: 'feature/a' },
				{ type: GitRefType.Head, name: 'copilot-worktree-generated' },
			]),
		});
		const actionWidgetService = new RecordingActionWidgetService();
		const visible = observableValue('repositoryControlsVisible', options?.visible ?? true);
		let openRepositoryAttempts = 0;
		let providerAvailable = !options?.providerInitiallyUnavailable;
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		instantiationService.stub(IGitService, upcastPartial<IGitService>({
			openRepository: async () => {
				openRepositoryAttempts++;
				if (options?.failOpenRepositoryOnce && openRepositoryAttempts === 1) {
					throw new Error('failed to open repository');
				}
				return repository;
			},
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessionTypes: sessionTypesChanged.event,
			getSessionTypesForFolder: () => providerAvailable ? [{
				providerId: state.providerId ?? 'default-copilot',
				sessionType: {
					id: state.sessionTypeId ?? 'copilotcli',
					label: 'Copilot',
					icon: Codicon.copilot,
					supportsWorktreeConfiguration: state.sessionTypeId === 'copilotcli',
					authRequirement: SessionTypeAuthRequirement.GitHub,
				},
			}] : [],
		}));
		instantiationService.stub(ILogService, new NullLogService());

		const action = disposables.add(new Action('test.automationIsolation', 'Automation Isolation'));
		const item = disposables.add(instantiationService.createInstance(
			AutomationIsolationGroupActionViewItem,
			action,
			state,
			model,
			model.folderUriObs,
			Event.None,
			options?.revalidate ?? (() => { }),
			undefined,
			visible,
		));
		const container = document.createElement('div');
		item.render(container);
		return {
			container,
			state,
			model,
			actionWidgetService,
			getOpenRepositoryAttempts: () => openRepositoryAttempts,
			setProviderAvailable: () => {
				providerAvailable = true;
				sessionTypesChanged.fire();
			},
		};
	}

	test('opens sorted local branches and persists the selected Worktree branch', async () => {
		const { container, model, actionWidgetService } = createItem();
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		trigger.click();
		assert.deepStrictEqual(actionWidgetService.labels, ['feature/a', 'feature/z', 'main']);
		actionWidgetService.select('feature/z');

		assert.deepStrictEqual({
			branch: model.persistedBranch,
			expanded: trigger.getAttribute('aria-expanded'),
			disabled: trigger.getAttribute('aria-disabled'),
			role: trigger.getAttribute('role'),
			hasPopup: trigger.getAttribute('aria-haspopup'),
		}, {
			branch: 'feature/z',
			expanded: 'false',
			disabled: 'false',
			role: 'button',
			hasPopup: 'listbox',
		});
	});

	test('keeps an edited branch that is no longer available locally', async () => {
		const { container, model, actionWidgetService } = createItem({
			state: createFormState({ branch: 'feature/deleted' }),
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		trigger.click();

		assert.deepStrictEqual({
			label: trigger.querySelector('.automation-form-branch-name')?.textContent,
			persistedBranch: model.persistedBranch,
			pickerItems: actionWidgetService.labels,
			ariaLabels: actionWidgetService.ariaLabels,
		}, {
			label: 'feature/deleted',
			persistedBranch: 'feature/deleted',
			pickerItems: ['feature/deleted', 'feature/a', 'feature/z', 'main'],
			ariaLabels: ['feature/deleted, unavailable locally', 'feature/a', 'feature/z', 'main'],
		});
	});

	test('keeps Folder branch status read-only', async () => {
		const { container, actionWidgetService } = createItem({
			state: createFormState({ isolationMode: 'workspace', branch: 'stale-head' }),
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		trigger.click();

		assert.deepStrictEqual({
			label: trigger.querySelector('.automation-form-branch-name')?.textContent,
			disabled: trigger.getAttribute('aria-disabled'),
			hasChevron: !!trigger.querySelector('.codicon-chevron-down'),
			pickerVisible: actionWidgetService.isVisible,
			role: trigger.getAttribute('role'),
			hasPopup: trigger.getAttribute('aria-haspopup'),
			tabIndex: trigger.tabIndex,
		}, {
			label: 'main',
			disabled: 'true',
			hasChevron: false,
			pickerVisible: false,
			role: null,
			hasPopup: null,
			tabIndex: -1,
		});
	});

	test('offers retry after a branch load failure', async () => {
		let attempts = 0;
		const { container, actionWidgetService } = createItem({
			getRefs: async () => {
				attempts++;
				if (attempts === 1) {
					throw new Error('failed');
				}
				return [{ type: GitRefType.Head, name: 'main' }];
			},
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		trigger.click();
		assert.deepStrictEqual(actionWidgetService.labels, ['Retry Loading Branches']);
		actionWidgetService.select('Retry Loading Branches');
		await timeout(0);
		trigger.click();

		assert.deepStrictEqual({
			attempts,
			labels: actionWidgetService.labels,
		}, {
			attempts: 2,
			labels: ['main'],
		});
	});

	test('keeps the picker disabled while branches load and enables it when ready', async () => {
		const refs = new DeferredPromise<Awaited<ReturnType<IGitRepository['getRefs']>>>();
		const { container, actionWidgetService } = createItem({
			getRefs: async () => refs.p,
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);
		trigger.click();
		assert.deepStrictEqual({
			disabled: trigger.getAttribute('aria-disabled'),
			pickerVisible: actionWidgetService.isVisible,
		}, {
			disabled: 'true',
			pickerVisible: false,
		});

		await refs.complete([{ type: GitRefType.Head, name: 'main' }]);
		await timeout(0);
		trigger.click();

		assert.deepStrictEqual({
			disabled: trigger.getAttribute('aria-disabled'),
			labels: actionWidgetService.labels,
		}, {
			disabled: 'false',
			labels: ['main'],
		});
	});

	test('explains that Worktree is unavailable while branches load', async () => {
		const refs = new DeferredPromise<Awaited<ReturnType<IGitRepository['getRefs']>>>();
		const { container } = createItem({
			state: createFormState({ isolationMode: 'workspace' }),
			getRefs: async () => refs.p,
		});
		await timeout(0);
		const checkbox = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.ok(checkbox);

		assert.deepStrictEqual({
			checked: checkbox.getAttribute('aria-checked'),
			disabled: checkbox.getAttribute('aria-disabled'),
		}, {
			checked: 'false',
			disabled: 'true',
		});

		await refs.complete([{ type: GitRefType.Head, name: 'main' }]);
	});

	test('offers retry when opening the repository fails in Folder mode', async () => {
		const { container, actionWidgetService, getOpenRepositoryAttempts } = createItem({
			state: createFormState({ isolationMode: 'workspace' }),
			failOpenRepositoryOnce: true,
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		trigger.click();
		assert.deepStrictEqual(actionWidgetService.labels, ['Retry Loading Branches']);
		actionWidgetService.select('Retry Loading Branches');
		await timeout(0);

		assert.deepStrictEqual({
			attempts: getOpenRepositoryAttempts(),
			label: trigger.querySelector('.automation-form-branch-name')?.textContent,
		}, {
			attempts: 2,
			label: 'main',
		});
	});

	test('resolves providerless session-type picks before gating Worktree configuration', async () => {
		const { container } = createItem({
			state: createFormState({ providerId: undefined }),
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		assert.deepStrictEqual({
			disabled: trigger.getAttribute('aria-disabled'),
			label: trigger.querySelector('.automation-form-branch-name')?.textContent,
		}, {
			disabled: 'false',
			label: 'main',
		});
	});

	test('normalizes unsupported Worktree targets back to Folder mode', async () => {
		const { container, model } = createItem({
			state: createFormState({ sessionTypeId: 'claude', branch: 'feature/saved' }),
		});
		await timeout(0);

		const checkbox = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.ok(checkbox);
		assert.deepStrictEqual({
			mode: model.isolationMode,
			branch: model.persistedBranch,
			checked: checkbox.getAttribute('aria-checked'),
		}, {
			mode: 'workspace',
			branch: undefined,
			checked: 'false',
		});
	});

	test('enables Worktree branches for agent-host Copilot CLI', async () => {
		const { container } = createItem({
			state: createFormState({ providerId: 'local-agent-host', sessionTypeId: 'copilotcli' }),
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);

		assert.deepStrictEqual({
			disabled: trigger.getAttribute('aria-disabled'),
			label: trigger.querySelector('.automation-form-branch-name')?.textContent,
		}, {
			disabled: 'false',
			label: 'main',
		});
	});

	test('preserves Worktree intent while the provider is discovered late', async () => {
		const { container, model, setProviderAvailable } = createItem({
			state: createFormState({ branch: 'feature/saved' }),
			providerInitiallyUnavailable: true,
		});
		await timeout(0);
		const trigger = container.querySelector<HTMLElement>('.automation-form-branch-slot');
		assert.ok(trigger);
		assert.deepStrictEqual({
			mode: model.isolationMode,
			selectedBranch: model.selectedBranch,
			persistedBranch: model.persistedBranch,
			reason: trigger.getAttribute('aria-label'),
		}, {
			mode: 'worktree',
			selectedBranch: 'feature/saved',
			persistedBranch: undefined,
			reason: 'feature/saved. Session capabilities are loading.',
		});

		setProviderAvailable();

		assert.deepStrictEqual({
			mode: model.isolationMode,
			persistedBranch: model.persistedBranch,
			disabled: trigger.getAttribute('aria-disabled'),
		}, {
			mode: 'worktree',
			persistedBranch: 'feature/saved',
			disabled: 'false',
		});
	});

	test('requires a branch before saving Worktree isolation', () => {
		const state = createFormState({ branch: undefined });
		const validation: IValidationState = {
			nameError: undefined,
			promptError: undefined,
			folderError: undefined,
			sessionTypeError: undefined,
			branchError: undefined,
		};
		const form = document.createElement('form');

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined);
		assert.strictEqual(validation.branchError, 'A branch is required for Worktree isolation.');

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => 'main');
		assert.strictEqual(validation.branchError, undefined);
	});

	test('allows a workspace-less target without a folder and still requires a session type', () => {
		const state = createFormState({ isQuickChat: true, folderUri: undefined, isolationMode: undefined, branch: undefined });
		const validation: IValidationState = {
			nameError: undefined,
			promptError: undefined,
			folderError: undefined,
			sessionTypeError: undefined,
			branchError: undefined,
		};
		const form = document.createElement('form');

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined);
		const validTarget = { ...validation };
		state.providerId = undefined;
		state.sessionTypeId = undefined;
		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined);

		assert.deepStrictEqual({
			validTarget,
			missingTarget: validation,
		}, {
			validTarget: {
				nameError: undefined,
				promptError: undefined,
				folderError: undefined,
				sessionTypeError: undefined,
				branchError: undefined,
			},
			missingTarget: {
				nameError: undefined,
				promptError: undefined,
				folderError: undefined,
				sessionTypeError: 'Session type is required.',
				branchError: undefined,
			},
		});
	});

	test('allows workspace-backed legacy targets without a provider id', () => {
		const state = createFormState({ providerId: undefined, isolationMode: 'workspace' });
		const validation: IValidationState = {
			nameError: undefined,
			promptError: undefined,
			folderError: undefined,
			sessionTypeError: undefined,
			branchError: undefined,
		};

		updateSaveButtonState(undefined, state, validation, document.createElement('form'), () => 'prompt', () => undefined);

		assert.deepStrictEqual(validation, {
			nameError: undefined,
			promptError: undefined,
			folderError: undefined,
			sessionTypeError: undefined,
			branchError: undefined,
		});
	});

	test('hides repository controls for workspace-less targets', async () => {
		const state = createFormState({
			isQuickChat: true,
			folderUri: undefined,
			isolationMode: 'worktree',
			branch: 'feature/stale',
		});
		const { container, model } = createItem({ state, visible: false });
		await timeout(0);

		assert.deepStrictEqual({
			display: container.style.display,
			ariaHidden: container.getAttribute('aria-hidden'),
			folderUri: model.folderUri,
			isolationMode: state.isolationMode,
			branch: model.persistedBranch,
		}, {
			display: 'none',
			ariaHidden: 'true',
			folderUri: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
	});

	test('reloads repository state when returning to workspace mode', async () => {
		const state = createFormState({
			isQuickChat: true,
			folderUri: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
		const { container, model, getOpenRepositoryAttempts } = createItem({ state, visible: true });
		await timeout(0);

		assert.strictEqual(getOpenRepositoryAttempts(), 0);
		model.setQuickChat(false, FOLDER);
		await timeout(0);

		assert.deepStrictEqual({
			attempts: getOpenRepositoryAttempts(),
			folderUri: model.folderUri?.toString(),
			branch: container.querySelector('.automation-form-branch-name')?.textContent,
			supportsWorktreeConfiguration: model.supportsWorktreeConfiguration,
		}, {
			attempts: 1,
			folderUri: FOLDER.toString(),
			branch: 'main',
			supportsWorktreeConfiguration: true,
		});
	});

	test('allows focus in popups rendered outside the dialog', () => {
		const sheet = document.createElement('div');
		sheet.classList.add('mobile-picker-sheet');
		const sheetItem = sheet.appendChild(document.createElement('button'));
		const suggestWidget = document.createElement('div');
		suggestWidget.classList.add('suggest-widget');
		const suggestion = suggestWidget.appendChild(document.createElement('div'));

		assert.deepStrictEqual({
			sheet: isAutomationDialogPopupTarget(sheetItem),
			suggestion: isAutomationDialogPopupTarget(suggestion),
		}, {
			sheet: true,
			suggestion: true,
		});
	});

	test('resolves a legacy model identifier to the selected concrete target', () => {
		const legacyIdentifier = 'copilotcli/gpt-5.6-sol';
		const concreteIdentifier = 'agent-host-copilotcli:gpt-5.6-sol';
		const unrelatedIdentifier = 'other/gpt-5.6-sol';
		const modelIds = [legacyIdentifier, unrelatedIdentifier];
		const models = new Map<string, ILanguageModelChatMetadata>([
			[legacyIdentifier, upcastPartial<ILanguageModelChatMetadata>({ id: 'gpt-5.6-sol', targetChatSessionType: 'copilotcli' })],
			[concreteIdentifier, upcastPartial<ILanguageModelChatMetadata>({ id: 'gpt-5.6-sol', targetChatSessionType: 'agent-host-copilotcli' })],
			[unrelatedIdentifier, upcastPartial<ILanguageModelChatMetadata>({ id: 'gpt-5.6-sol', targetChatSessionType: 'other' })],
		]);
		const languageModelsService = upcastPartial<ILanguageModelsService>({
			getLanguageModelIds: () => modelIds,
			lookupLanguageModel: identifier => models.get(identifier),
		});

		const beforeConcreteTargetArrives = resolveAutomationModelIdentifier(languageModelsService, legacyIdentifier, 'copilotcli', 'agent-host-copilotcli');
		modelIds.push(concreteIdentifier);

		assert.deepStrictEqual({
			beforeConcreteTargetArrives,
			afterConcreteTargetArrives: resolveAutomationModelIdentifier(languageModelsService, legacyIdentifier, 'copilotcli', 'agent-host-copilotcli'),
			alreadyConcrete: resolveAutomationModelIdentifier(languageModelsService, concreteIdentifier, 'copilotcli', 'agent-host-copilotcli'),
			unrelated: resolveAutomationModelIdentifier(languageModelsService, unrelatedIdentifier, 'copilotcli', 'agent-host-copilotcli'),
		}, {
			beforeConcreteTargetArrives: legacyIdentifier,
			afterConcreteTargetArrives: concreteIdentifier,
			alreadyConcrete: concreteIdentifier,
			unrelated: unrelatedIdentifier,
		});
	});
});

suite('Automation dialog keyboard navigation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('passes editor commands through the dialog command filter', () => {
		const prompt = document.createElement('textarea');
		const button = document.createElement('button');

		assert.deepStrictEqual({
			undoPromptPrevented: dispatchAutomationDialogCommand(prompt, 'undo').defaultPrevented,
			redoPromptPrevented: dispatchAutomationDialogCommand(prompt, 'redo').defaultPrevented,
			acceptSuggestionPromptPrevented: dispatchAutomationDialogCommand(prompt, 'acceptSelectedSuggestion').defaultPrevented,
			undoButtonPrevented: dispatchAutomationDialogCommand(button, 'undo').defaultPrevented,
			unrelatedPromptPrevented: dispatchAutomationDialogCommand(prompt, 'workbench.action.files.save').defaultPrevented,
		}, {
			undoPromptPrevented: false,
			redoPromptPrevented: false,
			acceptSuggestionPromptPrevented: false,
			undoButtonPrevented: true,
			unrelatedPromptPrevented: true,
		});
	});

	test('reserves Enter for suggestions while the suggest widget is visible', () => {
		const rule = KeybindingsRegistry.getDefaultKeybindings()
			.find(item => item.command === 'workbench.action.chat.automationsDialog.insertNewline');
		const evaluate = (suggestWidgetVisible: boolean) => rule?.when?.evaluate({
			getValue: <T>(key: string) => ({
				[EditorContextKeys.textInputFocus.key]: true,
				[ChatContextKeys.inAutomationsDialog.key]: true,
				[SuggestContext.Visible.key]: suggestWidgetVisible,
			})[key] as T | undefined,
		} satisfies IContext) ?? false;

		assert.deepStrictEqual({
			ruleRegistered: !!rule,
			withoutSuggestions: evaluate(false),
			withSuggestions: evaluate(true),
		}, {
			ruleRegistered: true,
			withoutSuggestions: true,
			withSuggestions: false,
		});
	});

	test('cycles through visible dialog controls', () => {
		const container = document.createElement('div');
		document.body.append(container);
		disposables.add({ dispose: () => container.remove() });
		const targetWindow = DOM.getWindow(container);
		const first = container.appendChild(document.createElement('input'));
		const hiddenContainer = container.appendChild(document.createElement('div'));
		hiddenContainer.style.display = 'none';
		const hidden = hiddenContainer.appendChild(document.createElement('input'));
		const wrapper = container.appendChild(document.createElement('div'));
		wrapper.tabIndex = 0;
		const second = wrapper.appendChild(document.createElement('button'));
		const third = container.appendChild(document.createElement('button'));
		const navigation = disposables.add(registerAutomationDialogKeyboardNavigation(
			targetWindow,
			() => [first, hidden, wrapper, second, third],
			() => false,
		));
		let downstreamKeyDowns = 0;
		disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));

		navigation.focusFirst();
		dispatchKey(first, 'keydown', 'Tab');
		second.focus();
		dispatchKey(second, 'keydown', 'Tab');

		assert.deepStrictEqual({
			activeElement: document.activeElement,
			downstreamKeyDowns,
		}, {
			activeElement: third,
			downstreamKeyDowns: 0,
		});
	});

	test('accepts a prompt suggestion before moving focus with Tab', () => {
		const container = document.createElement('div');
		document.body.append(container);
		disposables.add({ dispose: () => container.remove() });
		const targetWindow = DOM.getWindow(container);
		const prompt = container.appendChild(document.createElement('textarea'));
		const next = container.appendChild(document.createElement('button'));
		let acceptedSuggestions = 0;
		disposables.add(registerAutomationDialogKeyboardNavigation(
			targetWindow,
			() => [prompt, next],
			() => false,
			() => {
				acceptedSuggestions++;
				return true;
			},
		));
		let downstreamKeyDowns = 0;
		disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));

		prompt.focus();
		const shiftTabEvent = dispatchKey(prompt, 'keydown', 'Tab', true);
		const activeElementAfterShiftTab = document.activeElement;
		prompt.focus();
		const event = dispatchKey(prompt, 'keydown', 'Tab');

		assert.deepStrictEqual({
			activeElement: document.activeElement,
			activeElementAfterShiftTab,
			acceptedSuggestions,
			defaultPrevented: event.defaultPrevented,
			downstreamKeyDowns,
			shiftTabDefaultPrevented: shiftTabEvent.defaultPrevented,
		}, {
			activeElement: prompt,
			activeElementAfterShiftTab: next,
			acceptedSuggestions: 1,
			defaultPrevented: true,
			downstreamKeyDowns: 0,
			shiftTabDefaultPrevented: true,
		});
	});

	test('leaves popup keydown handling active and suppresses its Escape keyup', () => {
		const container = document.createElement('div');
		document.body.append(container);
		disposables.add({ dispose: () => container.remove() });
		const targetWindow = DOM.getWindow(container);
		const trigger = container.appendChild(document.createElement('button'));
		const popup = container.appendChild(document.createElement('div'));
		const popupInput = popup.appendChild(document.createElement('input'));
		disposables.add(registerAutomationDialogKeyboardNavigation(
			targetWindow,
			() => [trigger],
			target => popup.contains(target),
		));
		let downstreamKeyDowns = 0;
		let downstreamKeyUps = 0;
		disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));
		disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, () => downstreamKeyUps++, true));

		popupInput.focus();
		dispatchKey(popupInput, 'keydown', 'Escape');
		trigger.focus();
		dispatchKey(trigger, 'keyup', 'Escape');
		dispatchKey(trigger, 'keydown', 'Escape');
		dispatchKey(trigger, 'keyup', 'Escape');

		assert.deepStrictEqual({
			downstreamKeyDowns,
			downstreamKeyUps,
		}, {
			downstreamKeyDowns: 2,
			downstreamKeyUps: 1,
		});
	});
});
