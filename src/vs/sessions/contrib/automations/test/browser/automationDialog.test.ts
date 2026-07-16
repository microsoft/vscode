/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { GitRefType, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AutomationIsolationGroupActionViewItem, IFormState, IValidationState, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, updateSaveButtonState } from '../../browser/automationDialog.js';
import { AutomationIsolationModel } from '../../common/isolationGroupModel.js';

const FOLDER = URI.file('/workspace');

function dispatchKey(target: HTMLElement, type: 'keydown' | 'keyup', key: string, shiftKey = false): KeyboardEvent {
	const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, shiftKey });
	target.dispatchEvent(event);
	return event;
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
		folderUri: FOLDER,
		providerId: 'default-copilot',
		sessionTypeId: 'copilotcli',
		isolationMode: 'worktree',
		branch: undefined,
		enabled: true,
		...overrides,
	};
}

suite('Automation branch picker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createItem(options?: {
		readonly state?: IFormState;
		readonly getRefs?: IGitRepository['getRefs'];
		readonly failOpenRepositoryOnce?: boolean;
		readonly providerInitiallyUnavailable?: boolean;
		readonly revalidate?: () => void;
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
			Event.None,
			Event.None,
			options?.revalidate ?? (() => { }),
			undefined,
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
		const { container, actionWidgetService } = createItem({
			state: createFormState({ isolationMode: 'workspace' }),
			getRefs: async () => refs.p,
		});
		await timeout(0);
		const isolationTrigger = container.querySelector<HTMLElement>('.automation-form-isolation-chip');
		assert.ok(isolationTrigger);

		isolationTrigger.click();
		assert.deepStrictEqual({
			labels: actionWidgetService.labels,
			details: actionWidgetService.details,
		}, {
			labels: ['Worktree', 'Folder'],
			details: ['Local branches are loading.', undefined],
		});

		actionWidgetService.hide(true);
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
			state: createFormState({ sessionTypeId: 'claude-code', branch: 'feature/saved' }),
		});
		await timeout(0);

		assert.deepStrictEqual({
			mode: model.isolationMode,
			branch: model.persistedBranch,
			label: container.querySelector('.automation-form-isolation-label')?.textContent,
		}, {
			mode: 'workspace',
			branch: undefined,
			label: 'Folder',
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
			branchError: undefined,
		};
		const form = document.createElement('form');

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined);
		assert.strictEqual(validation.branchError, 'A branch is required for Worktree isolation.');

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => 'main');
		assert.strictEqual(validation.branchError, undefined);
	});

	test('allows focus in mobile picker sheets', () => {
		const sheet = document.createElement('div');
		sheet.classList.add('mobile-picker-sheet');
		const item = sheet.appendChild(document.createElement('button'));

		assert.strictEqual(isAutomationDialogPopupTarget(item), true);
	});
});

suite('Automation dialog keyboard navigation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
