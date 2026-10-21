/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { CancellationError, getErrorMessage } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { Context as SuggestContext } from '../../../../../editor/contrib/suggest/browser/suggest.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListDelegate, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { IMenuService, isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextViewHandler } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickTree, IQuickTreeItem, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IDelayedHoverOptions, IHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { createWorkbenchDialogOptions } from '../../../../../workbench/browser/parts/dialogs/dialog.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatInputPart } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { IAutomationDescriptor, IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { automationScheduleToLocal, automationScheduleToUTC } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';
import { AutomationCatalogueState, AutomationToolCatalog, AutomationUnavailableError, IAutomationCustomizationChoice, IAutomationProviderConfiguration, IAutomationService, IAutomationTool, IAutomationWorkspaceTarget } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { GitRefType, IGitRepository, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { MobileSessionTypePicker } from '../../../chat/browser/mobile/mobileSessionTypePicker.js';
import { SessionModelSelection } from '../../../chat/browser/sessionModelSelection.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { IAutomationSessionConfiguration, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { AutomationDialogService } from '../../browser/automationDialogService.js';
import { AutomationCustomizationSelection, AutomationIsolationGroupActionViewItem, AutomationSessionDraftSynchronizer, canSelectAutomationWorkspace, getAutomationDialogProviders, IFormState, IValidationState, isAutomationDialogPopupTarget, MobileAutomationsWorkspacePicker, registerAutomationDialogKeyboardNavigation, renderForm, shouldPassThroughAutomationDialogCommand, updateSaveButtonState } from '../../browser/automationDialog.js';
import { AutomationInputCompletions } from '../../browser/automationInputCompletions.js';
import { AutomationIsolationModel } from '../../common/isolationGroupModel.js';

const FOLDER = URI.file('/workspace');
const REPOSITORY = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/private/HEAD' });

suite('Automation dialog creation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function openDialog(options: IShowAutomationDialogOptions = {}, cloudConfigurationOrChoices?: IAutomationProviderConfiguration | IAutomationService['getCustomizationChoices'], sessionOverrides?: Partial<ISessionsManagementService>, repository?: IGitRepository, cloudCreatable = true, cloudEnabledAtOpen = true, canUpdate = true) {
		const cloudConfiguration = typeof cloudConfigurationOrChoices === 'function' ? undefined : cloudConfigurationOrChoices;
		const getCustomizationChoices = typeof cloudConfigurationOrChoices === 'function' ? cloudConfigurationOrChoices : undefined;
		const configurationService = new TestConfigurationService();
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			contextKeyService: () => contextKeyService,
		}, disposables);
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(IMenuService, disposables.add(instantiationService.createInstance(MenuService)));
		const actionWidgetService = new RecordingActionWidgetService();
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		const quickInputService = new RecordingQuickInputService();
		instantiationService.stub(IQuickInputService, quickInputService);
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => undefined }));
		instantiationService.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ entitlement: ChatEntitlement.Pro }));
		instantiationService.stub(IGitService, upcastPartial<IGitService>({ openRepository: async () => repository }));
		const types = [{
			providerId: 'host',
			sessionType: { id: 'copilotcli', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.None },
		}];
		const cloudTypes = [{ providerId: 'cloud', sessionType: { ...types[0].sessionType, id: 'cloud-agent', label: 'Cloud' } }];
		const getSessionTypesForFolder = sessionOverrides?.getSessionTypesForFolder
			?? ((uri: URI) => uri.scheme === GITHUB_REMOTE_FILE_SCHEME ? cloudTypes : [...types, ...(cloudConfiguration ? cloudTypes : [])]);
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: Event.None,
			getProviders: () => [],
			getProvider: <T extends ISessionsProvider>(id: string) => id === 'cloud' && cloudConfiguration ? upcastPartial<ISessionsProvider>({
				id,
				sessionTypes: cloudTypes.map(type => type.sessionType),
				getSessionTypes: uri => getSessionTypesForFolder(uri).filter(type => type.providerId === id).map(type => type.sessionType),
			}) as T : undefined,
		}));
		const providers = observableValue('providers', [{ id: 'host', label: 'Host' }, ...(cloudConfiguration && cloudCreatable ? [{ id: 'cloud', label: 'Cloud' }] : [])]);
		const cloudEnabled = observableValue('cloudEnabled', !!cloudConfiguration && cloudEnabledAtOpen);
		let refresh: () => Promise<void> = async () => { };
		const hovers: string[] = [];
		const delayedHovers = new Map<HTMLElement, string>();
		// A fresh object keeps these fakes off the shared NullHoverService used by other suites.
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			showInstantHover: (options: IHoverOptions) => {
				hovers.push(typeof options.content === 'string' ? options.content : String(options.content));
				return undefined;
			},
			setupDelayedHover: (target: HTMLElement, options: IDelayedHoverOptions | (() => IDelayedHoverOptions)) => {
				const content = (typeof options === 'function' ? options() : options).content;
				delayedHovers.set(target, typeof content === 'string' ? content : String(content));
				return toDisposable(() => delayedHovers.delete(target));
			},
		});
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			automationSession: constObservable(undefined),
			onDidChangeSessionTypes: Event.None,
			getSessionTypesForFolder,
			getQuickChatSessionTypes: () => types,
			getAllProviderSessionTypes: () => [...types, ...cloudTypes],
			isNewSessionTargetAvailable: () => true,
			isQuickChatTargetAvailable: () => true,
			resolveWorkspace: () => ({ providerId: 'host', workspace: createWorkspace(false) }),
			createAutomationQuickChat: () => upcastPartial<ISession>({ sessionId: 'draft' }),
			createAutomationSession: () => upcastPartial<ISession>({ sessionId: 'draft' }),
			supportsAutomationSessionConfiguration: () => false,
			getAutomationSessionConfiguration: async () => null,
			discardAutomationSession: () => { },
			...sessionOverrides,
		}));
		instantiationService.stub(IAutomationService, upcastPartial<IAutomationService>({
			availableProviders: providers,
			getProviderConfiguration: id => id === 'cloud' && cloudEnabled.get() ? cloudConfiguration : undefined,
			automations: constObservable(options.existing ? [options.existing] : []),
			catalogueState: constObservable('ready'),
			canUpdateAutomation: () => canUpdate,
			refresh: () => refresh(),
			getCustomizationChoices,
		}));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		let targetModel: AutomationIsolationModel | undefined;
		let selectedWorkspace: URI | undefined;
		let selectingRepository = false;
		let workspaceDisabledReason: string | undefined;
		let pickerCloudMode: IObservable<boolean> | undefined;
		const workspaceSelected = disposables.add(new Emitter<URI | undefined>());
		const workspacePicker: Partial<MobileAutomationsWorkspacePicker> = {
			get isSelectingRepository() { return selectingRepository; },
			setTargetModel: model => { targetModel = model; },
			setCloudConfiguration: () => { },
			setCloudMode: mode => { pickerCloudMode = mode; },
			setDisabledReason: reason => { workspaceDisabledReason = reason; },
			setLayoutService: () => { },
			setSelectedWorkspace: uri => { selectedWorkspace = uri; },
			clearSelection: () => { selectedWorkspace = undefined; },
			onDidSelectWorkspace: workspaceSelected.event,
			render: container => container.appendChild(DOM.$('button', { type: 'button' }, 'Select workspace')),
			dispose: () => { },
		};
		instantiationService.stubInstance(MobileAutomationsWorkspacePicker, workspacePicker);
		instantiationService.stubInstance(SessionModelSelection, { dispose: () => { } });
		instantiationService.stubInstance(AutomationInputCompletions, { dispose: () => { } });
		const promptChanged = disposables.add(new Emitter<void>());
		const promptInput = document.createElement('textarea');
		instantiationService.stubInstance(ChatInputPart, {
			render: (container, value) => {
				promptInput.value = value ?? '';
				container.appendChild(promptInput);
			},
			inputToolbarElement: DOM.$('div'),
			setInputToolbarAriaLabel: () => { },
			inputEditor: upcastPartial<ChatInputPart['inputEditor']>({
				updateOptions: () => { },
				onDidChangeModelContent: Event.map(promptChanged.event, () => ({
					changes: [], eol: '\n', versionId: 1, isUndoing: false, isRedoing: false, isFlush: false, isEolChange: false,
					detailedReasons: [], detailedReasonsChangeLengths: [],
				})),
				getValue: () => promptInput.value,
			}),
			layout: () => { },
			dispose: () => { },
		});
		const result = instantiationService.createInstance(AutomationDialogService).showAutomationDialog(options);
		const container = instantiationService.get(IWorkbenchLayoutService).activeContainer;
		const buttons = Array.from(container.querySelectorAll<HTMLElement>('.automation-dialog-footer-actions .monaco-button'));
		const saveButton = buttons.find(button => button.textContent === (options.existing ? 'Save' : 'Create'))!;
		const cancelButton = buttons.find(button => button.textContent === 'Cancel')!;
		disposables.add(toDisposable(() => cancelButton.click()));
		const nameInput = container.querySelector<HTMLInputElement>('.automation-form-input-host input')!;
		return {
			result, saveButton, cancelButton, nameInput, container, providers, actionWidgetService,
			openEventPicker: () => {
				container.querySelector<HTMLElement>('.automation-event-button')!.click();
				const tree = quickInputService.trees.at(-1);
				assert.ok(tree?.visible);
				return tree;
			},
			openToolsPicker: () => {
				const button = container.querySelector<HTMLElement>('.automation-provider-tools .monaco-button');
				assert.ok(button);
				button.click();
				const tree = quickInputService.trees.at(-1);
				assert.ok(tree?.visible);
				return { button, tree };
			},
			getWorkspaceDisabledReason: () => workspaceDisabledReason,
			getPickerCloudMode: () => pickerCloudMode?.get(),
			cloudEnabled,
			configurationService,
			hovers,
			getSaveTooltip: () => delayedHovers.get(saveButton),
			getTooltip: (element: HTMLElement) => delayedHovers.get(element),
			setRefresh: (value: () => Promise<void>) => { refresh = value; },
			selectWorkspace: async (uri: URI | undefined, fromRepository = uri?.scheme === GITHUB_REMOTE_FILE_SCHEME) => {
				if (await workspacePicker.onWillSelectWorkspace?.()) {
					selectingRepository = fromRepository;
					try {
						selectedWorkspace = uri;
						workspaceSelected.fire(uri);
					} finally {
						selectingRepository = false;
					}
				}
			},
			setCloud: async (checked: boolean) => {
				const toggle = container.querySelector<HTMLElement>('[role="switch"]');
				assert.ok(toggle, 'Expected the Run in the cloud switch');
				if ((toggle.getAttribute('aria-checked') === 'true') !== checked) {
					toggle.click();
				}
				await timeout(0);
			},
			getTarget: () => ({ quickChat: targetModel?.isQuickChat, workspace: selectedWorkspace }),
			setWorkspace: (folder: URI) => targetModel?.setQuickChat(false, folder),
			setPrompt: (prompt: string) => {
				promptInput.value = prompt;
				promptChanged.fire();
			},
			setName: (name: string) => {
				nameInput.value = name;
				nameInput.dispatchEvent(new InputEvent('input'));
			},
		};
	}

	test('keeps the title outside scrolling content and themes the Name input consistently', async () => {
		const dialog = openDialog();
		const body = dialog.container.querySelector<HTMLElement>('.automation-dialog-body')!;
		const scrollable = dialog.container.querySelector<HTMLElement>('.automation-dialog-scrollable')!;
		const titlebar = dialog.container.querySelector<HTMLElement>('.automation-titlebar')!;
		const nameInputBox = dialog.container.querySelector<HTMLElement>('.automation-form-input-host > .monaco-inputbox')!;

		assert.deepStrictEqual({
			bodyChildren: Array.from(body.children, element => element.className),
			titleInScrollableContent: scrollable.contains(titlebar),
			scrollableChildren: Array.from(scrollable.children, element => element.className),
			nameInputStyles: {
				background: nameInputBox.style.backgroundColor,
				foreground: nameInputBox.style.color,
				border: nameInputBox.style.border,
			},
		}, {
			bodyChildren: ['automation-dialog-progress', 'automation-titlebar', 'automation-dialog-scrollable'],
			titleInScrollableContent: false,
			scrollableChildren: ['automation-form-pane'],
			nameInputStyles: {
				background: 'var(--vscode-settings-textInputBackground)',
				foreground: 'var(--vscode-settings-textInputForeground)',
				border: '1px solid var(--vscode-settings-textInputBorder, transparent)',
			},
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	function toolCatalog(tools: readonly IAutomationTool[] = [{ id: 'read', label: 'Read Files' }, { id: 'edit', label: 'Edit Files' }]): AutomationToolCatalog {
		return { kind: 'ready', groups: [{ id: 'files', label: 'Files', tools }] };
	}

	function cloudConfiguration(
		target = observableValue<IAutomationWorkspaceTarget>('target', { workspace: REPOSITORY }),
		tools: IObservable<AutomationToolCatalog> = constObservable(toolCatalog()),
		loadTools: () => void = () => { },
	): IAutomationProviderConfiguration {
		return {
			sessionTypes: ['cloud-agent'], timeZone: 'UTC', description: 'Runs on GitHub',
			targetChangeDisabledReason: 'Duplicate to change repository.',
			tools, loadTools,
			pickWorkspace: async () => REPOSITORY,
			getWorkspaceTarget: uri => uri ? target : constObservable({ disabledReason: 'Choose a repository.' }),
		};
	}

	const issueCatalog = [
		{ name: 'issues', title: 'Issue created', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }] },
		{ name: 'issue_labeled', title: 'Issue labeled', description: '', fields: [{ name: 'types', required: true, options: ['labeled'] }, { name: 'labels', label: 'Labels', required: true }, { name: 'query', label: 'Query', required: false }] },
	];

	function eventConfiguration(): IAutomationProviderConfiguration {
		return { ...cloudConfiguration(undefined, constObservable(toolCatalog([]))), triggers: constObservable({ kind: 'ready', definitions: issueCatalog }), loadTriggers: () => { } };
	}

	const prCatalog = [
		{ name: 'pull_request_opened', title: 'Opened', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }, { name: 'paths', label: 'Paths', required: false }] },
		{ name: 'pull_request_comment', title: 'Comment', description: '', fields: [{ name: 'types', required: true, options: ['timeline_comment', 'review_comment'] }, { name: 'body_substring', label: 'Comment text', required: false }] },
		{ name: 'pull_request_review_submitted', title: 'Review', description: '', fields: [{ name: 'types', required: true, options: ['submitted'] }, { name: 'states', label: 'Review state', required: true, options: ['approved', 'changes_requested', 'commented'] }] },
	];

	test('unified Trigger dropdown lists schedules and event families without a Schedule category', async () => {
		const initial = eventAutomation({});
		const dialog = openDialog({ initialValues: { ...initial, schedule: { ...initial.schedule, interval: 'daily' } } }, {
			...eventConfiguration(), triggers: constObservable({ kind: 'ready', definitions: [...issueCatalog, ...prCatalog] }),
		});
		const trigger = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		const snapshot = () => ({
			selected: trigger.selectedOptions[0].textContent,
			time: dialog.container.querySelector<HTMLElement>('.automation-form-time-group')!.style.display,
			day: dialog.container.querySelector<HTMLElement>('.automation-form-day-group')!.style.display,
			event: !!dialog.container.querySelector('.automation-form-event-group select, .automation-event-button'),
		});
		const states = [snapshot()];
		for (const label of ['Weekly', 'Hourly', 'Issue', 'Pull Request', 'Daily']) {
			trigger.selectedIndex = Array.from(trigger.options).findIndex(option => option.textContent === label);
			trigger.dispatchEvent(new (DOM.getWindow(trigger).Event)('change', { bubbles: true }));
			states.push(snapshot());
		}
		const controls = {
			triggerCount: dialog.container.querySelectorAll('select[aria-label="Trigger"]').length,
			scheduleCount: dialog.container.querySelectorAll('select[aria-label="Schedule"]').length,
			options: Array.from(trigger.options, option => option.textContent),
		};
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ controls, states, interval: result?.value.schedule?.interval, events: result?.value.cloudTrigger }, {
			controls: { triggerCount: 1, scheduleCount: 0, options: ['Weekly', 'Daily', 'Hourly', 'Issue', 'Pull Request', 'Manual'] },
			states: [
				{ selected: 'Daily', time: '', day: 'none', event: false },
				{ selected: 'Weekly', time: '', day: '', event: false },
				{ selected: 'Hourly', time: 'none', day: 'none', event: false },
				{ selected: 'Issue', time: 'none', day: 'none', event: true },
				{ selected: 'Pull Request', time: 'none', day: 'none', event: true },
				{ selected: 'Daily', time: '', day: 'none', event: false },
			],
			interval: 'daily', events: undefined,
		});
	});

	test('event families default by the frozen event order rather than catalog order', async () => {
		const initial = eventAutomation({});
		const dialog = openDialog({ initialValues: { ...initial, schedule: { ...initial.schedule, interval: 'daily' } } }, {
			...eventConfiguration(),
			triggers: constObservable({ kind: 'ready', definitions: [...prCatalog].reverse().concat([...issueCatalog].reverse()) }),
		});
		const trigger = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		const selectTrigger = (label: string) => {
			trigger.selectedIndex = Array.from(trigger.options).findIndex(option => option.textContent === label);
			trigger.dispatchEvent(new (DOM.getWindow(trigger).Event)('change', { bubbles: true }));
		};
		selectTrigger('Issue');
		const issueEvent = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Event"]')!.selectedOptions[0].textContent;
		selectTrigger('Pull Request');
		const pullRequestEvent = dialog.container.querySelector<HTMLElement>('.automation-event-button')!.textContent;
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({
			issueEvent,
			pullRequestEvent,
			trigger: result?.value.cloudTrigger,
		}, {
			issueEvent: 'Issue created',
			pullRequestEvent: 'Pull request opened',
			trigger: { triggers: { pull_request_opened: { types: ['opened'] } }, requireActorWritePermission: false },
		});
	});

	test('reselecting the saved Trigger family preserves opaque PR configuration verbatim', async () => {
		const existing = eventAutomation({
			pull_request_comment: { types: ['review_comment', 'timeline_comment'], body_substring: ' /review ', write_scope: 'repository', opaque: { keep: [1, false] } },
			pull_request_opened: { types: ['opened'], paths: ['src/**'] },
		});
		const dialog = openDialog({ existing }, { ...eventConfiguration(), triggers: constObservable({ kind: 'ready', definitions: prCatalog }) });
		const trigger = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		const selected = trigger.selectedOptions[0].textContent;
		trigger.dispatchEvent(new (DOM.getWindow(trigger).Event)('change', { bubbles: true }));
		dialog.nameInput.value = 'Renamed';
		dialog.nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ selected, name: result?.value.name, trigger: result?.value.cloudTrigger, schedule: result?.value.schedule }, {
			selected: 'Pull Request', name: 'Renamed', trigger: undefined, schedule: undefined,
		});
	});

	test('selecting a schedule for an event automation explicitly replaces its triggers', async () => {
		const existing = eventAutomation({ issues: { types: ['opened'], opaque: true } });
		const dialog = openDialog({ existing }, eventConfiguration());
		const trigger = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		trigger.selectedIndex = Array.from(trigger.options).findIndex(option => option.textContent === 'Hourly');
		trigger.dispatchEvent(new (DOM.getWindow(trigger).Event)('change', { bubbles: true }));
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ interval: result?.value.schedule?.interval, events: result?.value.cloudTrigger }, { interval: 'hourly', events: undefined });
	});

	test('PR multi-event authoring retains one event and serializes comments, reviews and paths', async () => {
		const initial = eventAutomation({});
		const configuration = { ...eventConfiguration(), triggers: constObservable({ kind: 'ready' as const, definitions: prCatalog }) };
		const dialog = openDialog({ initialValues: { ...initial, schedule: { ...initial.schedule, interval: 'daily' } } }, configuration);
		const family = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		family.selectedIndex = Array.from(family.options).findIndex(option => option.textContent === 'Pull Request');
		family.dispatchEvent(new (DOM.getWindow(family).Event)('change', { bubbles: true }));
		const picker = dialog.openEventPicker();
		picker.toggle('Pull request opened');
		assert.deepStrictEqual(picker.checkedLeafItems.map(item => item.label), ['Pull request opened']);
		const oneEvent = dialog.container.querySelector<HTMLElement>('.automation-event-button')!.textContent;
		picker.toggle('Timeline comment');
		const twoEvents = dialog.container.querySelector<HTMLElement>('.automation-event-button')!.textContent;
		for (const label of ['Review comment', 'Review submitted']) {
			picker.toggle(label);
		}
		const fourEvents = dialog.container.querySelector<HTMLElement>('.automation-event-button')!.textContent;
		picker.accept();
		assert.strictEqual(dialog.saveButton.getAttribute('aria-disabled'), 'true');
		const requiredFields = dialog.container.querySelector<HTMLElement>('.automation-trigger-required-fields')!;
		const advancedFields = dialog.container.querySelector<HTMLElement>('.automation-advanced-content')!;
		const requiredLayout = {
			reviewStatePresent: !!requiredFields.querySelector<HTMLElement>('[role="checkbox"][aria-label="approved"]'),
			label: Array.from(requiredFields.querySelectorAll('.automation-form-label')).at(-1)?.textContent,
			requiredDisplay: requiredFields.style.display,
			outsideAdvanced: !advancedFields.contains(requiredFields.querySelector('[role="checkbox"][aria-label="approved"]')),
			advancedExpanded: dialog.container.querySelector('.automation-advanced-disclosure')?.getAttribute('aria-expanded'),
			advancedDisplay: advancedFields.style.display,
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
			saveTooltip: dialog.getSaveTooltip(),
			inlineValidationHidden: dialog.container.querySelector('#automation-schedule-error')?.classList.contains('automation-visually-hidden'),
		};
		requiredFields.querySelector<HTMLElement>('.automation-trigger-option span')!.click();
		assert.strictEqual(requiredFields.querySelector('[role="checkbox"][aria-label="approved"]')?.getAttribute('aria-checked'), 'true');
		dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!.click();
		for (const [label, value] of [['Paths', ' src/**, !src/generated/** '], ['Comment text', ' /review ']]) {
			const input = dialog.container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
			input.value = value;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		}
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ labels: { oneEvent, twoEvents, fourEvents }, requiredLayout, trigger: result?.value.cloudTrigger }, {
			labels: { oneEvent: 'Pull request opened', twoEvents: '2 events selected', fourEvents: '4 events selected' },
			requiredLayout: { reviewStatePresent: true, label: 'Review state', requiredDisplay: '', outsideAdvanced: true, advancedExpanded: 'false', advancedDisplay: 'none', saveDisabled: 'true', saveTooltip: 'Review state is required.', inlineValidationHidden: true },
			trigger: {
				triggers: {
					pull_request_opened: { types: ['opened'], paths: ['src/**', '!src/generated/**'] },
					pull_request_comment: { types: ['timeline_comment', 'review_comment'], body_substring: '/review' },
					pull_request_review_submitted: { types: ['submitted'], states: ['approved'] },
				}, requireActorWritePermission: false,
			},
		});
	});

	test('Event shares the Trigger row and filters stay under collapsed Advanced', async () => {
		const existing = eventAutomation({ issue_labeled: { types: ['labeled'], labels: ['bug'], query: ' is:open ', opaque: { keep: true } } });
		const dialog = openDialog({ existing }, eventConfiguration());
		const row = dialog.container.querySelector('.automation-form-schedule-row')!;
		const event = row.querySelector('select[aria-label="Event"]');
		const advanced = dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!;
		const section = dialog.container.querySelector<HTMLElement>('.automation-advanced')!;
		const content = dialog.container.querySelector<HTMLElement>('.automation-advanced-content')!;
		const required = dialog.container.querySelector<HTMLElement>('.automation-trigger-required-fields')!;
		const initial = {
			eventBesideTrigger: !!event && !!row.querySelector('select[aria-label="Trigger"]'),
			eventOutsideAdvanced: !content.contains(event),
			queryInsideAdvanced: !!content.querySelector('input[aria-label="Query"]'),
			labelsOutsideAdvanced: !!required.querySelector('input[aria-label="Labels"]') && !content.contains(required.querySelector('input[aria-label="Labels"]')),
			requiredDisplay: required.style.display,
			actorInsideAdvanced: !!content.querySelector('[role="checkbox"][aria-label="Require write access to trigger"]'),
			expanded: advanced.getAttribute('aria-expanded'),
			sectionAriaHidden: section.getAttribute('aria-hidden'),
			contentAriaHidden: content.getAttribute('aria-hidden'),
			display: content.style.display,
			summaryHidden: dialog.container.querySelector<HTMLElement>('.automation-advanced-summary')?.hidden,
			disclosures: dialog.container.querySelectorAll('.automation-advanced-disclosure').length,
		};
		advanced.click();
		const expanded = { expanded: advanced.getAttribute('aria-expanded'), display: content.style.display, contentAriaHidden: content.getAttribute('aria-hidden') };
		advanced.click();
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ initial, expanded, patch: result?.value.cloudTrigger }, {
			initial: { eventBesideTrigger: true, eventOutsideAdvanced: true, queryInsideAdvanced: true, labelsOutsideAdvanced: true, requiredDisplay: '', actorInsideAdvanced: true, expanded: 'false', sectionAriaHidden: null, contentAriaHidden: 'true', display: 'none', summaryHidden: true, disclosures: 1 },
			expanded: { expanded: 'true', display: '', contentAriaHidden: null }, patch: undefined,
		});
	});

	test('PR Event button uses the existing Quick Pick and restores focus without changing saved triggers', async () => {
		const dialog = openDialog({ existing: eventAutomation({ pull_request_comment: { types: ['review_comment', 'timeline_comment'], body_substring: ' /review ', opaque: true } }) },
			{ ...eventConfiguration(), triggers: constObservable({ kind: 'ready', definitions: prCatalog }) });
		const picker = dialog.openEventPicker();
		const options = picker.leaves.map(item => item.label);
		picker.hide();
		const button = dialog.container.querySelector<HTMLElement>('.automation-event-button')!;
		const closed = { focused: DOM.getActiveElement() === button, dialogOpen: !!dialog.container.querySelector('.automation-dialog'), customPopup: !!dialog.container.querySelector('.automation-event-options') };
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ options, closed, patch: result?.value.cloudTrigger }, {
			options: ['Pull request opened', 'Timeline comment', 'Review comment', 'Review submitted'],
			closed: { focused: true, dialogOpen: true, customPopup: false }, patch: undefined,
		});
	});

	test('PR event selection preserves unedited entries and shared comment filters', async () => {
		const triggers = {
			pull_request_opened: { types: ['opened'], paths: ['src/**'], opaque: { keep: true } },
			pull_request_comment: { types: ['review_comment'], body_substring: '/review', write_scope: 'repository' as const, allow_copilot_triggers: true },
		};
		const dialog = openDialog({ existing: eventAutomation(triggers) }, { ...eventConfiguration(), triggers: constObservable({ kind: 'ready', definitions: prCatalog }) });
		const picker = dialog.openEventPicker();
		picker.toggle('Timeline comment');
		picker.accept();
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual(result?.value.cloudTrigger, {
			triggers: { ...triggers, pull_request_comment: { ...triggers.pull_request_comment, types: ['timeline_comment', 'review_comment'] } }, requireActorWritePermission: true,
		});
	});

	test('selected PR events share one Query and Paths editor without event headings', async () => {
		const sharedCatalog = [
			{ name: 'pull_request_opened', title: 'Opened', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }, { name: 'query', label: 'Pull request query', required: false }, { name: 'paths', label: 'Path filter', required: false }] },
			{ name: 'pull_request_synchronize', title: 'Synchronized', description: '', fields: [{ name: 'types', required: true, options: ['synchronize'] }, { name: 'query', label: 'Pull request query', required: false }, { name: 'paths', label: 'Path filter', required: false }] },
		];
		const initial = eventAutomation({});
		const dialog = openDialog({ initialValues: { ...initial, schedule: { ...initial.schedule, interval: 'daily' } } }, {
			...eventConfiguration(), triggers: constObservable({ kind: 'ready', definitions: sharedCatalog }),
		});
		const trigger = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		trigger.selectedIndex = Array.from(trigger.options).findIndex(option => option.textContent === 'Pull Request');
		trigger.dispatchEvent(new (DOM.getWindow(trigger).Event)('change', { bubbles: true }));
		const picker = dialog.openEventPicker();
		picker.toggle('Pull request synchronized');
		picker.accept();
		dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!.click();
		const advanced = dialog.container.querySelector<HTMLElement>('.automation-advanced-content')!;
		const queryInputs = advanced.querySelectorAll<HTMLInputElement>('input[aria-label="Pull request query"]');
		const pathInputs = advanced.querySelectorAll<HTMLInputElement>('input[aria-label="Path filter"]');
		queryInputs[0].value = ' is:open label:bug ';
		queryInputs[0].dispatchEvent(new InputEvent('input', { bubbles: true }));
		pathInputs[0].value = ' src/**, !src/generated/** ';
		pathInputs[0].dispatchEvent(new InputEvent('input', { bubbles: true }));
		const presentation = {
			queryInputs: queryInputs.length,
			pathInputs: pathInputs.length,
			pathPlaceholder: pathInputs[0].placeholder,
			pathHelpText: advanced.textContent?.includes('Match changed files with gitignore-style patterns, separated by commas.'),
			openedHeading: advanced.textContent?.includes('Pull request opened'),
			synchronizedHeading: advanced.textContent?.includes('Pull request synchronized'),
		};
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ presentation, trigger: result?.value.cloudTrigger }, {
			presentation: {
				queryInputs: 1,
				pathInputs: 1,
				pathPlaceholder: 'Match changed files with gitignore-style patterns, separated by commas',
				pathHelpText: false,
				openedHeading: false,
				synchronizedHeading: false,
			},
			trigger: {
				triggers: {
					pull_request_opened: { types: ['opened'], query: 'is:open label:bug', paths: ['src/**', '!src/generated/**'] },
					pull_request_synchronize: { types: ['synchronize'], query: 'is:open label:bug', paths: ['src/**', '!src/generated/**'] },
				},
				requireActorWritePermission: false,
			},
		});
	});

	test('shared PR fields inherit one populated saved value without rewriting triggers on unrelated edits', async () => {
		const sharedCatalog = [
			{ name: 'pull_request_opened', title: 'Opened', description: '', fields: [{ name: 'types', required: true, options: ['opened'] }, { name: 'query', label: 'Pull request query', required: false }] },
			{ name: 'pull_request_synchronize', title: 'Synchronized', description: '', fields: [{ name: 'types', required: true, options: ['synchronize'] }, { name: 'query', label: 'Pull request query', required: false }] },
		];
		const triggers = {
			pull_request_opened: { types: ['opened'], query: 'is:open', opaque: true },
			pull_request_synchronize: { types: ['synchronize'] },
		};
		const dialog = openDialog({ existing: eventAutomation(triggers) }, {
			...eventConfiguration(), triggers: constObservable({ kind: 'ready', definitions: sharedCatalog }),
		});
		dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!.click();
		const queries = dialog.container.querySelectorAll<HTMLInputElement>('input[aria-label="Pull request query"]');
		const presentation = {
			queryCount: queries.length,
			query: queries[0].value,
			readOnly: !!dialog.container.querySelector('a[href="https://github.com/owner/private/agents/automations/events"]'),
		};
		dialog.nameInput.value = 'Renamed';
		dialog.nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({
			presentation,
			name: result?.value.name,
			triggerPatch: result?.value.cloudTrigger,
		}, { presentation: { queryCount: 1, query: 'is:open', readOnly: false }, name: 'Renamed', triggerPatch: undefined });
	});

	function eventAutomation(triggers: NonNullable<IAutomationDescriptor['cloudTrigger']>['triggers']): IAutomationDescriptor {
		return {
			id: 'events', name: 'Triage', prompt: 'Triage issues', enabled: true, createdAt: '', updatedAt: '',
			schedule: { interval: 'custom', timeZone: 'UTC', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			cloudTrigger: { triggers, requireActorWritePermission: true }, externalResource: URI.parse('https://github.com/owner/private/agents/automations/events'),
		};
	}

	test('Issue creation validates required filters and permits zero selected tools', async () => {
		const initial = eventAutomation({});
		const dialog = openDialog({ initialValues: { ...initial, schedule: { ...initial.schedule, interval: 'daily' } } }, eventConfiguration());
		const choose = (label: string, value: string) => {
			const select = dialog.container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
			select.selectedIndex = Array.from(select.options).findIndex(option => option.text === value);
			select.dispatchEvent(new (DOM.getWindow(select).Event)('change', { bubbles: true }));
		};
		choose('Trigger', 'Issue');
		choose('Event', 'Issue labeled');
		const required = dialog.saveButton.getAttribute('aria-disabled');
		dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!.click();
		const input = dialog.container.querySelector<HTMLInputElement>('input[aria-label="Labels"]')!;
		input.value = ' bug, help wanted, , bug ';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const query = dialog.container.querySelector<HTMLInputElement>('input[aria-label="Query"]')!;
		query.value = ' is:open label:bug ';
		query.dispatchEvent(new InputEvent('input', { bubbles: true }));
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ required, trigger: result?.value.cloudTrigger, tools: result?.value.sessionTemplate?.config?.tools }, {
			required: 'true', trigger: { triggers: { issue_labeled: { types: ['labeled'], labels: ['bug', 'help wanted'], query: 'is:open label:bug' } }, requireActorWritePermission: false }, tools: [],
		});
	});

	for (const unsupported of [false, true]) {
		test(`unrelated dialog edit omits ${unsupported ? 'unsupported mixed' : 'Issue'} triggers and actor settings`, async () => {
			const existing = eventAutomation(unsupported ? { issues: { types: ['opened'] }, future: { nested: { keep: true } } } : { issues: { types: ['opened'], write_scope: 'repository', allow_copilot_triggers: true } });
			const dialog = openDialog({ existing }, eventConfiguration());
			const readOnlyLink = !!dialog.container.querySelector('a[href="https://github.com/owner/private/agents/automations/events"]');
			dialog.nameInput.value = 'Renamed';
			dialog.nameInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.deepStrictEqual({ readOnlyLink, name: result?.value.name, trigger: result?.value.cloudTrigger, schedule: result?.value.schedule }, {
				readOnlyLink: unsupported, name: 'Renamed', trigger: undefined, schedule: undefined,
			});
		});
	}

	test('switching a saved schedule to Issue keeps its actor permission', async () => {
		const existing = { ...eventAutomation({}), schedule: { interval: 'manual' as const, timeZone: 'UTC' as const, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 } };
		const dialog = openDialog({ existing }, eventConfiguration());
		const family = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		family.selectedIndex = Array.from(family.options).findIndex(option => option.textContent === 'Issue');
		family.dispatchEvent(new (DOM.getWindow(family).Event)('change', { bubbles: true }));
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ trigger: result?.value.cloudTrigger, schedule: result?.value.schedule }, {
			trigger: { triggers: { issues: { types: ['opened'] } }, requireActorWritePermission: true }, schedule: undefined,
		});
	});

	test('Issue filter edits preserve opaque settings and saved actor permission', async () => {
		const existing = eventAutomation({ issue_labeled: { types: ['labeled'], labels: ['bug'], write_scope: 'repository', allow_copilot_triggers: true, future: { keep: [1, false] } } });
		const dialog = openDialog({ existing }, eventConfiguration());
		const query = dialog.container.querySelector<HTMLInputElement>('input[aria-label="Query"]')!;
		query.value = ' is:open ';
		query.dispatchEvent(new InputEvent('input', { bubbles: true }));
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual(result?.value.cloudTrigger, {
			triggers: { issue_labeled: { ...existing.cloudTrigger!.triggers.issue_labeled, query: 'is:open' } }, requireActorWritePermission: true,
		});
	});

	test('cloud switch turns cloud mode on and restores local mode', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		const toggle = dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		const snapshot = () => ({
			checked: toggle.getAttribute('aria-checked'),
			pickerCloudMode: dialog.getPickerCloudMode(),
		});
		const off = snapshot();
		toggle.click();
		await timeout(0);
		const on = snapshot();
		toggle.click();
		await timeout(0);
		assert.deepStrictEqual([off, on, snapshot()], [
			{ checked: 'false', pickerCloudMode: false },
			{ checked: 'true', pickerCloudMode: true },
			{ checked: 'false', pickerCloudMode: false },
		]);
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('reopening locally after using Cloud hides the empty Event column', async () => {
		const cloud = openDialog({}, cloudConfiguration());
		await cloud.setCloud(true);
		cloud.cancelButton.click();
		await cloud.result;

		const local = openDialog({}, cloudConfiguration(), undefined, undefined, true, false);
		const row = local.container.querySelector<HTMLElement>('.automation-form-schedule-row')!;
		const event = row.querySelector<HTMLElement>('.automation-form-event-group')!;
		const trigger = row.querySelector<HTMLElement>('.automation-form-schedule-group:not(.automation-form-time-group):not(.automation-form-day-group):not(.automation-form-event-group)')!;
		const time = row.querySelector<HTMLElement>('.automation-form-time-group')!;
		assert.deepStrictEqual({
			cloud: local.container.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			eventDisplay: event.style.display,
			visibleGroups: Array.from(row.children).filter(element => (element as HTMLElement).style.display !== 'none').map(element => element.className),
			flex: [DOM.getWindow(trigger).getComputedStyle(trigger).flexGrow, DOM.getWindow(time).getComputedStyle(time).flexGrow],
		}, {
			cloud: 'false',
			eventDisplay: 'none',
			visibleGroups: [
				'automation-form-schedule-group',
				'automation-form-schedule-group automation-form-time-group',
			],
			flex: ['1', '1'],
		});
		local.cancelButton.click();
		await local.result;
	});

	test('Owner defaults to Only me and Repository selection uses the keyboard', async () => {
		for (const repository of [false, true]) {
			const dialog = openDialog({}, cloudConfiguration());
			await dialog.setCloud(true);
			await dialog.selectWorkspace(REPOSITORY);
			dialog.setPrompt('Review changes');
			const radios = dialog.container.querySelectorAll<HTMLElement>('.automation-owner [role="radio"]');
			assert.deepStrictEqual(Array.from(radios, radio => [radio.textContent, radio.getAttribute('aria-checked')]), [['Only me', 'true'], ['Repository', 'false']]);
			if (repository) {
				radios[0].focus();
				radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
			}
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.ok(result?.kind === 'create');
			assert.deepStrictEqual({ ownership: result.value.ownership, present: Object.hasOwn(result.value, 'ownership') }, { ownership: repository ? 'repository' : undefined, present: repository });
		}
	});

	test('Repository create failure preserves the dialog and selected Owner with a readable server reason', async () => {
		const reason = 'Repository automations are not enabled for this repository.';
		const committing = new DeferredPromise<void>();
		const dialog = openDialog({
			commit: async result => {
				assert.ok(result.kind === 'create' && result.value.ownership === 'repository');
				await committing.p;
				throw new AutomationUnavailableError(reason);
			}
		}, cloudConfiguration());
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		dialog.setPrompt('Review changes');
		const repository = dialog.container.querySelectorAll<HTMLElement>('.automation-owner [role="radio"]')[1];
		repository.click();
		dialog.saveButton.click();
		await timeout(0);
		const disabledDuringSave = repository.getAttribute('aria-disabled');
		await committing.complete();
		await timeout(0);
		const error = dialog.container.querySelector<HTMLElement>('.automation-form-save-error')!;
		assert.deepStrictEqual({
			disabledDuringSave, selected: repository.getAttribute('aria-checked'),
			retryEnabled: dialog.saveButton.getAttribute('aria-disabled'), message: error.textContent,
			visible: error.style.display !== 'none', focused: DOM.getActiveElement() === error,
			dialogOpen: !!dialog.container.querySelector('.automation-dialog'),
		}, { disabledDuringSave: 'true', selected: 'true', retryEnabled: 'false', message: reason, visible: true, focused: true, dialogOpen: true });
		dialog.cancelButton.click();
		assert.strictEqual(await dialog.result, undefined);
	});

	test('Owner shares the Tools row, explains each choice, and warns when Repository is selected', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		await dialog.setCloud(true);
		const owner = dialog.container.querySelector<HTMLElement>('.automation-owner')!;
		const radios = owner.querySelectorAll<HTMLElement>('[role="radio"]');
		const info = owner.querySelector<HTMLElement>('.automation-owner-info')!;
		const warning = dialog.container.querySelector<HTMLElement>('.automation-owner-warning')!;
		const warningState = () => ({ visible: warning.classList.contains('visible'), hidden: warning.getAttribute('aria-hidden'), display: warning.style.display });
		const initialWarning = warningState();
		const initialInfo = { tooltip: dialog.getTooltip(info), description: owner.getAttribute('aria-description') };
		radios[1].click();
		assert.deepStrictEqual({
			rowLabels: Array.from(owner.parentElement!.querySelectorAll('.automation-form-label'), label => label.textContent),
			inlineText: owner.textContent,
			choices: Array.from(radios, radio => ({ description: radio.getAttribute('aria-description'), tooltip: dialog.getTooltip(radio) })),
			info: {
				initial: initialInfo,
				selected: { tooltip: dialog.getTooltip(info), description: owner.getAttribute('aria-description') },
				codicon: info.classList.contains('codicon-info'),
				hidden: info.getAttribute('aria-hidden'),
				tabIndex: info.tabIndex,
			},
			warning: {
				initial: initialWarning,
				selected: warningState(),
				role: warning.getAttribute('role'),
				live: warning.getAttribute('aria-live'),
				icon: warning.querySelector('.codicon-warning')?.getAttribute('aria-hidden'),
				text: warning.textContent,
				footer: warning.parentElement?.classList.contains('automation-dialog-footer-actions'),
			},
		}, {
			rowLabels: ['Tools', 'Owner'],
			inlineText: 'OwnerOnly meRepository',
			choices: [
				{ description: 'Only you can see and edit it. Runs act as you.', tooltip: 'Only you can see and edit it. Runs act as you.' },
				{ description: 'Anyone who can read the repository can see it, and anyone with write access can edit it. Runs act as Copilot.', tooltip: 'Anyone who can read the repository can see it, and anyone with write access can edit it. Runs act as Copilot.' },
			],
			info: {
				initial: { tooltip: 'This automation will act as you.', description: 'This automation will act as you.' },
				selected: { tooltip: 'This automation will act as Copilot.', description: 'This automation will act as Copilot.' },
				codicon: true, hidden: 'true', tabIndex: -1,
			},
			warning: {
				initial: { visible: false, hidden: 'true', display: '' },
				selected: { visible: true, hidden: 'false', display: '' },
				role: 'status', live: 'polite', icon: 'true',
				text: 'This automation will be visible to everyone with repository access, and can be edited by anyone with write access.',
				footer: true,
			},
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('Owner is read-only on edit, including legacy Only me, and never enters the update', async () => {
		for (const ownership of [undefined, 'repository'] as const) {
			const existing: IAutomationDescriptor = {
				id: 'saved', name: 'Review', prompt: 'Review changes', ownership, enabled: true, createdAt: '', updatedAt: '',
				target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
				schedule: { interval: 'manual', timeZone: 'UTC', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			};
			const dialog = openDialog({ existing }, cloudConfiguration());
			const owner = dialog.container.querySelector('.automation-owner')!;
			const radios = owner.querySelectorAll<HTMLElement>('[role="radio"]');
			const info = owner.querySelector<HTMLElement>('.automation-owner-info')!;
			assert.deepStrictEqual({
				controls: radios.length,
				text: owner.textContent,
				info: { tooltip: dialog.getTooltip(info), description: owner.getAttribute('aria-description') },
				choices: Array.from(radios, radio => ({
					label: radio.textContent,
					checked: radio.getAttribute('aria-checked'),
					disabled: radio.getAttribute('aria-disabled'),
					description: radio.getAttribute('aria-description'),
				})),
				warning: dialog.container.querySelector('.automation-owner-warning')?.textContent,
			}, {
				controls: 2, text: 'OwnerOnly meRepository',
				info: {
					tooltip: ownership === 'repository' ? 'This automation will act as Copilot.' : 'This automation will act as you.',
					description: ownership === 'repository' ? 'This automation will act as Copilot.' : 'This automation will act as you.',
				},
				choices: [
					{
						label: 'Only me', checked: String(ownership !== 'repository'), disabled: 'true',
						description: `Only you can see and edit it. Runs act as you. Ownership can't be changed after creation.`,
					},
					{
						label: 'Repository', checked: String(ownership === 'repository'), disabled: 'true',
						description: `Anyone who can read the repository can see it, and anyone with write access can edit it. Runs act as Copilot. Ownership can't be changed after creation.`,
					},
				],
				warning: ownership === 'repository' ? 'This automation is visible to everyone with repository access, and can be edited by anyone with write access.' : undefined,
			});
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.ok(result?.kind === 'update');
			assert.strictEqual(Object.hasOwn(result.value, 'ownership'), false);
		}
	});

	test('switching back to local hides Owner and never sends the Repository choice', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		await dialog.setCloud(true);
		dialog.container.querySelectorAll<HTMLElement>('.automation-owner [role="radio"]')[1].click();
		const warning = dialog.container.querySelector<HTMLElement>('.automation-owner-warning')!;
		assert.strictEqual(warning.getAttribute('aria-hidden'), 'false');
		await dialog.setCloud(false);
		dialog.setPrompt('Local review');
		assert.deepStrictEqual({
			options: dialog.container.querySelector<HTMLElement>('.automation-provider-options')!.style.display,
			warning: { visible: warning.classList.contains('visible'), hidden: warning.getAttribute('aria-hidden') },
		}, { options: 'none', warning: { visible: false, hidden: 'true' } });
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.ok(result?.kind === 'create');
		assert.deepStrictEqual({ provider: result.value.target.providerId, ownership: Object.hasOwn(result.value, 'ownership') }, { provider: 'host', ownership: false });
	});

	test('Space turns the cloud switch on and off even though the dialog cancels key-up events', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		const toggle = dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		const pressSpace = async () => {
			toggle.focus();
			toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true }));
			toggle.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true }));
			await timeout(0);
			return toggle.getAttribute('aria-checked');
		};
		assert.deepStrictEqual([await pressSpace(), await pressSpace()], ['true', 'false']);
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('Create stays blocked while the cloud switch connects', async () => {
		const dialog = openDialog({}, cloudConfiguration(), undefined, undefined, false);
		dialog.setPrompt('Review changes');
		const refresh = new DeferredPromise<void>();
		dialog.setRefresh(() => refresh.p);
		const before = dialog.saveButton.getAttribute('aria-disabled');
		dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await timeout(0);
		const connecting = {
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
			progress: dialog.container.querySelector('.automation-target-progress')?.textContent,
		};
		await refresh.error(new Error('Offline'));
		await timeout(0);
		assert.deepStrictEqual({ before, connecting, after: dialog.saveButton.getAttribute('aria-disabled') }, {
			before: 'false',
			connecting: { disabled: 'true', progress: 'Connecting to cloud automations...' },
			after: 'false',
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('turning cloud on keeps a local folder whose repository access is still being checked', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { pending: true, disabledReason: 'Checking repository access...' });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.setPrompt('Review changes');
		await dialog.selectWorkspace(FOLDER);
		await dialog.setCloud(true);
		const pending = { workspace: dialog.getTarget().workspace, disabled: dialog.saveButton.getAttribute('aria-disabled') };
		target.set({ workspace: REPOSITORY }, undefined);
		await timeout(0);
		assert.deepStrictEqual({ pending, resolved: { workspace: dialog.getTarget().workspace, disabled: dialog.saveButton.getAttribute('aria-disabled') } }, {
			pending: { workspace: FOLDER, disabled: 'true' },
			resolved: { workspace: FOLDER, disabled: 'false' },
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	for (const eligibility of ['cached', 'pending'] as const) {
		test(`turning cloud on selects the repository of a ${eligibility} private checkout that cannot run Cloud itself`, async () => {
			const target = observableValue<IAutomationWorkspaceTarget>('target', eligibility === 'cached' ? { workspace: REPOSITORY } : { pending: true, disabledReason: 'Checking repository access...' });
			const types = [{ providerId: 'host', sessionType: { id: 'copilotcli', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.None } }];
			const cloudTypes = [{ providerId: 'cloud', sessionType: { ...types[0].sessionType, id: 'cloud-agent', label: 'Cloud' } }];
			// Without the unified workspace picker, only the GitHub repository offers Cloud, not its local checkout.
			const dialog = openDialog({}, cloudConfiguration(target), { getSessionTypesForFolder: uri => uri.scheme === GITHUB_REMOTE_FILE_SCHEME ? cloudTypes : types });
			dialog.setPrompt('Review changes');
			await dialog.selectWorkspace(FOLDER);
			await dialog.setCloud(true);
			target.set({ workspace: REPOSITORY }, undefined);
			await timeout(0);
			assert.deepStrictEqual({
				workspace: dialog.getTarget().workspace?.toString(),
				sessionType: dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label'),
				disabled: dialog.saveButton.getAttribute('aria-disabled'),
			}, { workspace: REPOSITORY.toString(), sessionType: 'Session Type, Cloud', disabled: 'false' });
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.ok(result?.kind === 'create' && result.value.target.kind === 'workspace');
			assert.deepStrictEqual({ folderUri: result.value.target.folderUri.toString(), providerId: result.value.target.providerId }, { folderUri: REPOSITORY.toString(), providerId: 'cloud' });
		});
	}

	test('connecting to cloud keeps the local draft until its configuration is captured', async () => {
		let discards = 0;
		let discardsAtCapture: number | undefined;
		const dialog = openDialog({}, cloudConfiguration(), {
			discardAutomationSession: () => { discards++; },
			getAutomationSessionConfiguration: async () => {
				discardsAtCapture ??= discards;
				return {};
			},
		}, undefined, false);
		dialog.setPrompt('Review changes');
		await timeout(0);
		dialog.setRefresh(async () => dialog.providers.set([{ id: 'host', label: 'Host' }, { id: 'cloud', label: 'Cloud' }], undefined));
		dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await timeout(0);
		await timeout(0);
		assert.deepStrictEqual({
			checked: dialog.container.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			discardsAtCapture,
		}, { checked: 'true', discardsAtCapture: 0 });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('keyboard focus returns to the switch after a delayed configuration capture', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		const dialog = openDialog({}, cloudConfiguration(), { getAutomationSessionConfiguration: () => capture.p });
		await timeout(0);
		const toggle = dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		toggle.focus();
		toggle.click();
		await timeout(0);
		await capture.complete({});
		await timeout(0);
		assert.deepStrictEqual({ checked: toggle.getAttribute('aria-checked'), focused: DOM.getActiveElement() === toggle }, { checked: 'true', focused: true });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('a failed cloud connection keeps keyboard focus on the switch', async () => {
		const dialog = openDialog({}, cloudConfiguration(), undefined, undefined, false);
		const toggle = dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		const refresh = new DeferredPromise<void>();
		dialog.setRefresh(() => refresh.p);
		toggle.focus();
		toggle.click();
		await timeout(0);
		const connecting = { disabled: toggle.disabled, busy: dialog.container.querySelector('.automation-cloud-row')?.getAttribute('aria-busy') };
		await refresh.error(new Error('Sign in to GitHub.com'));
		await timeout(0);
		assert.deepStrictEqual({
			connecting,
			after: { disabled: toggle.disabled, checked: toggle.getAttribute('aria-checked'), focused: DOM.getActiveElement() === toggle, hovers: dialog.hovers },
		}, {
			connecting: { disabled: true, busy: 'true' },
			after: { disabled: false, checked: 'false', focused: true, hovers: ['Unable to load cloud automations. Please try again in a few moments.'] },
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('cloud row is shown when cloud is enabled and connects when switched on', async () => {
		const visibility = (dialog: ReturnType<typeof openDialog>) => {
			const row = dialog.container.querySelector<HTMLElement>('.automation-cloud-row')!;
			return { display: row.style.display, hidden: row.getAttribute('aria-hidden') };
		};
		const sessionType = (dialog: ReturnType<typeof openDialog>) => dialog.container.querySelector('.automation-target-toolbar [aria-label^="Session Type"], .automation-target-toolbar [aria-label^="Pick Session Type"]')?.getAttribute('aria-label');
		const local = openDialog();
		const withoutCloud = visibility(local);
		local.cancelButton.click();
		await local.result;

		const unreachable = openDialog({}, cloudConfiguration(), undefined, undefined, false);
		const notCreatableAtOpen = visibility(unreachable);
		const unreachableToggle = unreachable.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		unreachable.setRefresh(async () => { throw new Error('Sign in to GitHub.com'); });
		unreachableToggle.click();
		await timeout(0);
		await timeout(0);
		const failedConnect = { checked: unreachableToggle.getAttribute('aria-checked'), hovers: [...unreachable.hovers], sessionType: sessionType(unreachable) };
		unreachable.setRefresh(async () => unreachable.providers.set([{ id: 'host', label: 'Host' }, { id: 'cloud', label: 'Cloud' }], undefined));
		unreachableToggle.click();
		await timeout(0);
		await timeout(0);
		const connected = { checked: unreachableToggle.getAttribute('aria-checked'), sessionType: sessionType(unreachable) };
		unreachable.cancelButton.click();
		await unreachable.result;

		const enabledLater = openDialog({}, cloudConfiguration(), undefined, undefined, false, false);
		const disabledAtOpen = visibility(enabledLater);
		transaction(tx => {
			enabledLater.cloudEnabled.set(true, tx);
			enabledLater.providers.set([{ id: 'host', label: 'Host' }, { id: 'cloud', label: 'Cloud' }], tx);
		});
		await timeout(0);
		const afterEnabling = visibility(enabledLater);
		enabledLater.cancelButton.click();
		await enabledLater.result;

		assert.deepStrictEqual({ withoutCloud, notCreatableAtOpen, failedConnect, connected, disabledAtOpen, afterEnabling }, {
			withoutCloud: { display: 'none', hidden: 'true' },
			notCreatableAtOpen: { display: '', hidden: null },
			failedConnect: { checked: 'false', hovers: ['Unable to load cloud automations. Please try again in a few moments.'], sessionType: 'Session Type, Copilot' },
			connected: { checked: 'true', sessionType: 'Session Type, Cloud' },
			disabledAtOpen: { display: 'none', hidden: 'true' },
			afterEnabling: { display: 'none', hidden: 'true' },
		});
	});

	test('empty cloud target is quiet but cannot save, while selected repository errors remain visible', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { disabledReason: 'Repository access denied.' });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.setName('Hello world');
		dialog.setPrompt('Say hello world');
		dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await timeout(0);
		const snapshot = () => ({
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			errorDisplay: dialog.container.querySelector<HTMLElement>('#automation-target-error')?.style.display,
			invalid: dialog.container.querySelector('.automation-target-toolbar')?.getAttribute('aria-invalid'),
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		});
		const empty = snapshot();
		await dialog.selectWorkspace(REPOSITORY);
		const denied = snapshot();
		target.set({ workspace: REPOSITORY }, undefined);
		await timeout(0);
		const valid = snapshot();
		await dialog.selectWorkspace(undefined);
		assert.deepStrictEqual([empty, denied, valid, snapshot()], [
			{ error: '', errorDisplay: 'none', invalid: null, saveDisabled: 'true' },
			{ error: 'Repository access denied.', errorDisplay: '', invalid: 'true', saveDisabled: 'true' },
			{ error: '', errorDisplay: 'none', invalid: null, saveDisabled: 'false' },
			{ error: '', errorDisplay: 'none', invalid: null, saveDisabled: 'true' },
		]);
		dialog.cancelButton.click();
		await dialog.result;
	});

	for (const interval of ['daily', 'weekly'] as const) {
		for (const edit of [true, false]) {
			test(`${edit ? 'edit' : 'duplicate'} ${interval} UTC schedule displays local fields and saves the original UTC values`, async () => {
				const automation: IAutomationDescriptor = {
					id: 'cloud-time', name: 'Time review', prompt: 'Review changes', enabled: false, createdAt: '', updatedAt: '',
					target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
					schedule: { interval, timeZone: 'UTC', scheduleHour: 2, scheduleMinute: 45, scheduleDay: 0 },
				};
				const local = automationScheduleToLocal(automation.schedule);
				const dialog = openDialog(edit ? { existing: automation } : { initialValues: automation }, cloudConfiguration());
				const time = dialog.container.querySelector<HTMLSelectElement>('.automation-form-time-group select')!;
				const day = dialog.container.querySelector<HTMLSelectElement>('.automation-form-day-group select')!;
				const hour12 = local.scheduleHour % 12 || 12;
				assert.deepStrictEqual({
					time: time.selectedOptions[0].textContent,
					day: day.selectedIndex,
					label: time.getAttribute('aria-label'),
					utcLabel: dialog.container.textContent?.includes('Time (UTC)'),
				}, {
					time: `${hour12}:${String(local.scheduleMinute).padStart(2, '0')} ${local.scheduleHour < 12 ? 'AM' : 'PM'}`,
					day: local.scheduleDay, label: 'Time (Local)', utcLabel: false,
				});
				dialog.saveButton.click();
				const result = await dialog.result;
				assert.deepStrictEqual({ schedule: result?.value.schedule, enabled: result?.value.enabled }, { schedule: edit ? undefined : automation.schedule, enabled: false });
			});
		}
	}

	for (const edit of [false, true]) {
		test(`${edit ? 'edit' : 'create'} Weekdays uses the time picker without a day picker`, async () => {
			const automation: IAutomationDescriptor = {
				id: 'weekdays', name: 'Weekday review', prompt: 'Review changes', enabled: false, createdAt: '', updatedAt: '',
				target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
				schedule: { interval: 'weekdays', scheduleHour: 17, scheduleMinute: 45, scheduleDay: 0 },
			};
			const dialog = openDialog(edit ? { existing: automation } : { initialValues: automation });
			const interval = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
			const time = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Time"]')!;
			assert.deepStrictEqual({
				interval: interval.selectedOptions[0].textContent,
				time: time.selectedOptions[0].textContent,
				timeVisible: time.closest<HTMLElement>('.automation-form-time-group')?.style.display,
				dayVisible: dialog.container.querySelector<HTMLElement>('.automation-form-day-group')?.style.display,
			}, { interval: 'Weekdays', time: '5:45 PM', timeVisible: '', dayVisible: 'none' });
			dialog.saveButton.click();
			assert.deepStrictEqual((await dialog.result)?.value.schedule, automation.schedule);
		});
	}

	test('duplicating foreign-time-zone Weekdays requires choosing a supported schedule', async () => {
		const automation: IAutomationDescriptor = {
			id: 'foreign-weekdays', name: 'Weekday review', prompt: 'Review changes', enabled: true, createdAt: '', updatedAt: '',
			target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
			schedule: { interval: 'custom', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			readOnlyReason: 'This automation uses a schedule that cannot be edited in VS Code.',
		};
		let commits = 0;
		const dialog = openDialog({ initialValues: automation, commit: async () => { commits++; } });
		const interval = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		const initial = {
			options: Array.from(interval.options, option => option.textContent),
			selected: interval.selectedOptions[0].textContent,
			placeholderDisabled: interval.selectedOptions[0].disabled,
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
			error: dialog.container.querySelector('.automation-form-content > .automation-target-error')?.textContent,
		};
		dialog.saveButton.click();
		await timeout(0);
		assert.deepStrictEqual({ ...initial, commits }, {
			options: ['Choose a trigger', 'Manual', 'Hourly', 'Daily', 'Weekdays', 'Weekly'],
			selected: 'Choose a trigger', placeholderDisabled: true, saveDisabled: 'true',
			error: 'Choose a supported schedule.',
			commits: 0,
		});
		interval.selectedIndex = Array.from(interval.options).findIndex(option => option.textContent === 'Weekdays');
		interval.dispatchEvent(new (DOM.getWindow(interval).Event)('change', { bubbles: true }));
		assert.deepStrictEqual({
			options: Array.from(interval.options, option => option.textContent),
			selected: interval.selectedOptions[0].textContent,
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { options: ['Manual', 'Hourly', 'Daily', 'Weekdays', 'Weekly'], selected: 'Weekdays', saveDisabled: 'false' });
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ kind: result?.kind, schedule: result?.value.schedule, commits }, {
			kind: 'create',
			schedule: { interval: 'weekdays', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			commits: 1,
		});
	});

	test('switching Weekdays to Cloud hides the option and requires an explicit supported schedule', async () => {
		const dialog = openDialog({
			initialValues: {
				name: 'Weekday review', prompt: 'Review changes',
				target: { kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'copilotcli', isolation: { kind: 'folder' } },
				schedule: { interval: 'weekdays', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			},
		}, cloudConfiguration());
		const interval = dialog.container.querySelector<HTMLSelectElement>('select[aria-label="Trigger"]')!;
		await dialog.setCloud(true);
		assert.deepStrictEqual({
			options: Array.from(interval.options, option => option.textContent),
			selected: interval.selectedOptions[0].textContent,
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
			error: dialog.container.querySelector('.automation-form-content > .automation-target-error')?.textContent,
		}, {
			options: ['Choose a trigger', 'Weekly', 'Daily', 'Hourly', 'Manual'],
			selected: 'Choose a trigger', disabled: 'true',
			error: 'Weekdays is only available for local automations. Choose a supported schedule for Cloud.',
		});
		await dialog.setCloud(false);
		assert.strictEqual(interval.selectedOptions[0].textContent, 'Weekdays');
		await dialog.setCloud(true);
		interval.selectedIndex = Array.from(interval.options).findIndex(option => option.textContent === 'Daily');
		interval.dispatchEvent(new (DOM.getWindow(interval).Event)('change', { bubbles: true }));
		assert.deepStrictEqual({
			options: Array.from(interval.options, option => option.textContent),
			selected: interval.selectedOptions[0].textContent,
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { options: ['Weekly', 'Daily', 'Hourly', 'Manual'], selected: 'Daily', disabled: 'false' });
		dialog.cancelButton.click();
		assert.strictEqual(await dialog.result, undefined);
	});

	test('preserves exact saved minutes and validates a local off-grid time when switching to Cloud', async () => {
		const automation: IAutomationDescriptor = {
			id: 'local-time', name: 'Time review', prompt: 'Review changes', enabled: false, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'copilotcli', isolation: { kind: 'folder' } },
			schedule: { interval: 'weekly', scheduleHour: 23, scheduleMinute: 7, scheduleDay: 6 },
		};
		const dialog = openDialog({ initialValues: automation }, cloudConfiguration());
		const time = dialog.container.querySelector<HTMLSelectElement>('.automation-form-time-group select')!;
		assert.deepStrictEqual({ selected: time.selectedOptions[0].textContent, count: time.options.length }, { selected: '11:07 PM', count: 97 });
		await dialog.setCloud(true);
		assert.deepStrictEqual({
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
			error: dialog.container.querySelector('.automation-form-content > .automation-target-error')?.textContent,
			errorRole: dialog.container.querySelector('.automation-form-content > .automation-target-error')?.getAttribute('role'),
			errorLive: dialog.container.querySelector('.automation-form-content > .automation-target-error')?.getAttribute('aria-live'),
			selected: time.selectedOptions[0].textContent,
		}, { disabled: 'true', error: 'Choose a time that corresponds to minute 00, 15, 30, or 45 in UTC.', errorRole: 'status', errorLive: 'polite', selected: '11:07 PM' });
		const interval = dialog.container.querySelector<HTMLSelectElement>('.automation-form-schedule-group select[aria-label="Trigger"]')!;
		const setInterval = (label: string) => {
			interval.selectedIndex = Array.from(interval.options).findIndex(option => option.textContent === label);
			interval.dispatchEvent(new (DOM.getWindow(interval).Event)('change', { bubbles: true }));
		};
		for (const value of ['Manual', 'Hourly']) {
			setInterval(value);
			assert.strictEqual(dialog.saveButton.getAttribute('aria-disabled'), 'false');
		}
		setInterval('Weekly');
		assert.strictEqual(dialog.saveButton.getAttribute('aria-disabled'), 'true');
		await dialog.setCloud(false);
		dialog.saveButton.click();
		assert.deepStrictEqual((await dialog.result)?.value.schedule, automation.schedule);
	});

	test('changing the time after an exact-minute option uses the selected option, not quarter-hour index arithmetic', async () => {
		const dialog = openDialog({
			initialValues: {
				name: 'Time review', prompt: 'Review changes', enabled: false,
				target: { kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'copilotcli', isolation: { kind: 'folder' } },
				schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 7, scheduleDay: 1 },
			},
		}, cloudConfiguration());
		const time = dialog.container.querySelector<HTMLSelectElement>('.automation-form-time-group select')!;
		time.selectedIndex = Array.from(time.options).findIndex(option => option.textContent === '9:45 AM');
		await dialog.setCloud(true);
		assert.strictEqual(dialog.saveButton.getAttribute('aria-disabled'), 'true');
		time.dispatchEvent(new (DOM.getWindow(time).Event)('change', { bubbles: true }));
		assert.strictEqual(dialog.saveButton.getAttribute('aria-disabled'), 'false');
		dialog.saveButton.click();
		assert.deepStrictEqual((await dialog.result)?.value.schedule, automationScheduleToUTC({
			interval: 'daily', scheduleHour: 9, scheduleMinute: 45, scheduleDay: 1,
		}));
	});

	test('cloud creation uses checked repository, UTC and selected tools without an Enabled control', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { disabledReason: 'Checking repository access...' });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.setPrompt('Review changes');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		const disabledWhileChecking = dialog.saveButton.getAttribute('aria-disabled');
		target.set({ workspace: REPOSITORY }, undefined);
		const picker = dialog.openToolsPicker();
		picker.tree.toggle('Read Files');
		picker.tree.accept();
		assert.deepStrictEqual({
			switch: dialog.container.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			cloudDisabled: dialog.container.querySelector('[aria-label="Session Type, Cloud"]')?.getAttribute('aria-disabled'),
			disabledWhileChecking,
			disabledAfterCheck: dialog.saveButton.getAttribute('aria-disabled'),
			enabledControl: dialog.container.querySelector('[role="checkbox"][aria-label="Enabled"]'),
			localTime: dialog.container.textContent?.includes('Time (Local)'),
		}, { switch: 'true', cloudDisabled: 'true', disabledWhileChecking: 'true', disabledAfterCheck: 'false', enabledControl: null, localTime: true });
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.ok(result?.kind === 'create');
		assert.ok(result.value.target.kind === 'workspace');
		assert.deepStrictEqual({
			target: { ...result.value.target, folderUri: result.value.target.folderUri.toString() }, schedule: result.value.schedule, template: result.value.sessionTemplate, enabled: result.value.enabled,
		}, {
			target: { kind: 'workspace', folderUri: REPOSITORY.toString(), providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: automationScheduleToUTC({ interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 }),
			template: { config: { tools: ['read'] } }, enabled: true,
		});
	});

	test('Tools section shows selection and the dialog has no cloud guidance note', async () => {
		const description = 'Runs even when your computer is off, triggered on a schedule.';
		const dialog = openDialog({}, { ...cloudConfiguration(), description });
		dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await timeout(0);
		await dialog.selectWorkspace(REPOSITORY);
		const section = dialog.container.querySelector('.automation-provider-details')!;
		const button = section.querySelector<HTMLElement>('.automation-provider-tools .monaco-button')!;
		const target = dialog.container.querySelector('.automation-target-toolbar')!;
		assert.deepStrictEqual({
			order: Array.from(section.children, child => child.className || child.tagName),
			group: section.getAttribute('role'),
			heading: section.querySelector('#automation-tools-label')?.textContent,
			help: section.querySelector('#automation-tools-description')?.textContent,
			label: button.textContent,
			secondary: button.classList.contains('secondary'),
			background: button.style.backgroundColor,
			foreground: button.style.color,
			border: button.style.border,
			buttonDescribedBy: button.getAttribute('aria-describedby'),
			count: button.getAttribute('aria-description'),
			cloudDescriptionInline: section.textContent?.includes(description),
			infoButton: dialog.container.querySelector('.automation-provider-info'),
			notes: dialog.container.querySelectorAll('#automation-target-note, .automation-dialog-footer-note').length,
			dialogText: dialog.container.textContent?.includes(description),
			targetDescribedBy: target.getAttribute('aria-describedby'),
			promptGuidance: dialog.container.querySelector('.automation-description'),
			saveDescribedBy: dialog.saveButton.getAttribute('aria-describedby'),
		}, {
			order: ['automation-form-label', 'automation-provider-tools', 'automation-provider-tools-status'],
			group: 'group',
			heading: 'Tools',
			help: undefined,
			label: '0 tools allowed',
			secondary: true,
			background: 'var(--vscode-button-secondaryBackground)',
			foreground: 'var(--vscode-button-secondaryForeground)',
			border: '1px solid var(--vscode-dropdown-border)',
			buttonDescribedBy: null,
			count: '0 of 2 tools selected',
			cloudDescriptionInline: false,
			infoButton: null,
			notes: 0,
			dialogText: false,
			targetDescribedBy: null,
			promptGuidance: null,
			saveDescribedBy: null,
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('cloud target errors are announced and clearing the error removes the description', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { workspace: REPOSITORY });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
		await timeout(0);
		await dialog.selectWorkspace(REPOSITORY);
		const error = dialog.container.querySelector<HTMLElement>('#automation-target-error')!;
		const toolbar = dialog.container.querySelector('.automation-target-toolbar')!;
		const snapshot = () => ({
			errorVisible: error.style.display !== 'none',
			error: error.textContent,
			describedBy: toolbar.getAttribute('aria-describedby'),
		});
		target.set({ disabledReason: 'Choose an available Agent Host that supports automations.' }, undefined);
		const unavailable = snapshot();
		target.set({ workspace: REPOSITORY }, undefined);
		assert.deepStrictEqual({ unavailable, restored: snapshot() }, {
			unavailable: { errorVisible: true, error: 'Choose an available Agent Host that supports automations.', describedBy: error.id },
			restored: { errorVisible: false, error: '', describedBy: null },
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('tool picker starts collapsed, keeps unknown saved tools and retains changes on Escape', async () => {
		const description = 'Allow the automation to use tools that read file contents.';
		const automation: IAutomationDescriptor = {
			id: 'cloud-tools', name: 'Tools', prompt: 'Review changes', enabled: true, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: { interval: 'manual', timeZone: 'UTC', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
			sessionTemplate: { config: { tools: ['read', 'retired/tool'] } },
		};
		const dialog = openDialog({ existing: automation }, cloudConfiguration(undefined, constObservable(toolCatalog([{ id: 'read', label: 'Read Files', description }, { id: 'edit', label: 'Edit Files' }]))));
		const cancelled = dialog.openToolsPicker();
		cancelled.tree.toggle('Read Files');
		cancelled.tree.hide(QuickInputHideReason.Gesture);
		const accepted = dialog.openToolsPicker();
		const items = accepted.tree.items.map(group => ({ label: group.label, collapsed: group.collapsed, tools: group.children?.map(item => ({ id: item.id, label: item.label, description: item.description, checked: item.checked })) }));
		accepted.tree.toggle('Edit Files');
		accepted.tree.accept();
		assert.deepStrictEqual({
			title: accepted.tree.title,
			items,
			cancelledDisposed: cancelled.tree.disposed,
			acceptedDisposed: accepted.tree.disposed,
			focusReturned: DOM.getActiveElement() === accepted.button,
			description: accepted.button.getAttribute('aria-description'),
		}, {
			title: 'Allowed Tools',
			items: [
				{ label: 'Files', collapsed: true, tools: [{ id: 'read', label: 'Read Files', description, checked: false }, { id: 'edit', label: 'Edit Files', description: undefined, checked: false }] },
				{ label: 'Other Saved Tools', collapsed: true, tools: [{ id: 'retired/tool', label: 'retired/tool', description: undefined, checked: true }] },
			],
			cancelledDisposed: true, acceptedDisposed: true, focusReturned: true, description: '2 of 3 tools selected',
		});
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual(result?.value.sessionTemplate?.config?.tools, ['edit', 'retired/tool']);
	});

	test('tool labels update immediately for all, some and no tools without accepting the picker', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		dialog.setPrompt('Review changes');
		const { button, tree } = dialog.openToolsPicker();
		const labels = [button.textContent];
		tree.toggle('Read Files');
		labels.push(button.textContent);
		tree.toggle('Edit Files');
		labels.push(button.textContent);
		tree.toggle('Read Files');
		tree.toggle('Edit Files');
		labels.push(button.textContent);
		tree.toggle('Read Files');
		tree.hide(QuickInputHideReason.Gesture);
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ labels, tools: result?.value.sessionTemplate?.config?.tools }, {
			labels: ['0 tools allowed', '1 tool allowed', 'All tools allowed', '0 tools allowed'],
			tools: ['read'],
		});
	});

	test('tool catalog loads on demand, explains loading and failure, and retries without blocking the dialog', async () => {
		const catalog = observableValue<AutomationToolCatalog>('catalog', { kind: 'loading' });
		let loads = 0;
		const dialog = openDialog({}, cloudConfiguration(undefined, catalog, () => loads++));
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		const button = dialog.container.querySelector<HTMLElement>('.automation-provider-tools .monaco-button')!;
		const status = dialog.container.querySelector<HTMLElement>('.automation-provider-tools-status')!;
		const retry = status.querySelector<HTMLElement>('.monaco-button')!;
		const snapshot = () => ({
			buttonDisabled: button.getAttribute('aria-disabled'), status: status.style.display === 'none' ? undefined : status.firstElementChild?.textContent,
			role: status.getAttribute('role'), retryVisible: retry.style.display !== 'none', count: button.getAttribute('aria-description'),
		});
		const loading = { loads, ...snapshot() };
		catalog.set({ kind: 'error', message: 'Available tools could not be loaded.' }, undefined);
		const failed = snapshot();
		retry.click();
		catalog.set(toolCatalog(), undefined);
		const retried = { loads, ...snapshot() };
		catalog.set({ kind: 'loading' }, undefined);
		assert.deepStrictEqual({ loading, failed, retried, accountChangeLoads: loads }, {
			loading: { loads: 1, buttonDisabled: 'true', status: 'Loading available tools...', role: 'status', retryVisible: false, count: null },
			failed: { buttonDisabled: 'true', status: 'Available tools could not be loaded.', role: 'status', retryVisible: true, count: null },
			retried: { loads: 2, buttonDisabled: 'false', status: undefined, role: 'status', retryVisible: false, count: '0 of 2 tools selected' },
			accountChangeLoads: 3,
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	for (const { name, catalog } of [
		{ name: 'ready', catalog: toolCatalog() },
		{ name: 'empty', catalog: toolCatalog([]) },
		{ name: 'loading', catalog: { kind: 'loading' } },
		{ name: 'unavailable', catalog: { kind: 'error', message: 'Available tools could not be loaded.' } },
	] satisfies { name: string; catalog: AutomationToolCatalog }[]) {
		test(`new cloud automations save with no tools when the catalog is ${name}`, async () => {
			const dialog = openDialog({}, cloudConfiguration(undefined, constObservable(catalog)));
			dialog.setPrompt('Review changes');
			await dialog.setCloud(true);
			await dialog.selectWorkspace(REPOSITORY);
			const picker = catalog.kind === 'ready' ? dialog.openToolsPicker() : undefined;
			const checkedTools = picker?.tree.items.flatMap(group => group.children ?? []).filter(item => item.checked) ?? [];
			picker?.tree.accept();
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.deepStrictEqual({ checkedTools, kind: result?.kind, tools: result?.value.sessionTemplate?.config?.tools }, {
				checkedTools: [], kind: 'create', tools: [],
			});
		});
	}

	test('editing a cloud automation with unreported tools preserves them without loading defaults', async () => {
		const automation: IAutomationDescriptor = {
			id: 'cloud-unreported', name: 'Tools', prompt: 'Review changes', enabled: true, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: { interval: 'manual', timeZone: 'UTC', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
			sessionTemplate: { modelId: 'model' },
		};
		const dialog = openDialog({ existing: automation }, cloudConfiguration(undefined, observableValue<AutomationToolCatalog>('catalog', { kind: 'error', message: 'Offline' })));
		const notReported = Array.from(dialog.container.querySelectorAll<HTMLElement>('.automation-provider-tools > p')).some(p => p.style.display !== 'none');
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ notReported, kind: result?.kind, template: result?.value.sessionTemplate }, { notReported: true, kind: 'update', template: undefined });
	});

	test('cloud gate revocation keeps Cloud selected and blocks save with the reason instead of falling back locally', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		await dialog.configurationService.setUserConfiguration(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		dialog.setPrompt('Review changes');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		transaction(tx => {
			dialog.cloudEnabled.set(false, tx);
			dialog.providers.set([{ id: 'host', label: 'Host' }], tx);
		});
		await timeout(0);
		const snapshot = () => ({
			checked: dialog.container.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			rowVisible: dialog.container.querySelector<HTMLElement>('.automation-cloud-row')?.style.display !== 'none',
			sessionType: dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label'),
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
			hiddenTools: dialog.container.querySelector<HTMLElement>('.automation-provider-options')!.style.display,
		});
		const revoked = snapshot();
		await dialog.setCloud(false);
		assert.deepStrictEqual({ revoked, local: { ...snapshot(), hiddenTools: undefined } }, {
			revoked: {
				checked: 'true', rowVisible: true, sessionType: 'Session Type, Cloud',
				error: 'Cloud automations are unavailable. Try again in a few moments, or turn off Run in the cloud.',
				disabled: 'true', hiddenTools: 'none',
			},
			local: { checked: 'false', rowVisible: true, sessionType: 'Session Type, Copilot', error: '', disabled: 'false', hiddenTools: undefined },
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('Create blocked by the disabled cloud setting names the setting and shows the visible reason as its tooltip', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		await dialog.configurationService.setUserConfiguration(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		dialog.setPrompt('Review changes');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		const snapshot = () => {
			const error = dialog.container.querySelector('#automation-target-error')?.textContent || undefined;
			const tooltip = dialog.getSaveTooltip();
			return {
				disabled: dialog.saveButton.getAttribute('aria-disabled'),
				namesSetting: !!error?.includes(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING),
				tooltipMatchesError: tooltip !== undefined && tooltip === error,
				tooltip: tooltip !== undefined,
				describedBy: dialog.saveButton.getAttribute('aria-describedby'),
			};
		};
		const available = snapshot();
		await dialog.configurationService.setUserConfiguration(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		transaction(tx => {
			dialog.cloudEnabled.set(false, tx);
			dialog.providers.set([{ id: 'host', label: 'Host' }], tx);
		});
		await timeout(0);
		const blocked = snapshot();
		await dialog.setCloud(false);
		const unblocked = { disabled: 'false', namesSetting: false, tooltipMatchesError: false, tooltip: false, describedBy: null };
		assert.deepStrictEqual({ available, blocked, local: snapshot() }, {
			available: unblocked,
			blocked: { disabled: 'true', namesSetting: true, tooltipMatchesError: true, tooltip: true, describedBy: 'automation-target-error' },
			local: unblocked,
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('a cloud provider that stops accepting automations keeps Cloud selected until it can create again', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		await dialog.configurationService.setUserConfiguration(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, true);
		dialog.setPrompt('Review changes');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		dialog.providers.set([{ id: 'host', label: 'Host' }], undefined);
		await timeout(0);
		const sessionType = () => dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label');
		const error = () => dialog.container.querySelector('#automation-target-error')?.textContent;
		const unavailable = { sessionType: sessionType(), error: error(), disabled: dialog.saveButton.getAttribute('aria-disabled') };
		dialog.providers.set([{ id: 'host', label: 'Host' }, { id: 'cloud', label: 'Cloud' }], undefined);
		await timeout(0);
		assert.deepStrictEqual({
			unavailable,
			available: { sessionType: sessionType(), error: error(), disabled: dialog.saveButton.getAttribute('aria-disabled') },
		}, {
			unavailable: { sessionType: 'Session Type, Cloud', error: 'Cloud automations are unavailable. Try again in a few moments, or turn off Run in the cloud.', disabled: 'true' },
			available: { sessionType: 'Session Type, Cloud', error: '', disabled: 'false' },
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('turning cloud off after choosing a repository restores the local quick-chat draft and local schedule semantics', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		dialog.setPrompt('Review changes');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		await dialog.setCloud(false);
		const toolsHidden = dialog.container.querySelector<HTMLElement>('.automation-provider-options')?.style.display;
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.ok(result?.kind === 'create');
		assert.deepStrictEqual({
			toolsHidden, target: result.value.target, timeZone: result.value.schedule.timeZone, template: result.value.sessionTemplate,
		}, { toolsHidden: 'none', target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' }, timeZone: undefined, template: undefined });
	});

	test('turning cloud off in a duplicated cloud automation selects No workspace and Copilot', async () => {
		const dialog = openDialog({
			initialValues: {
				name: 'Copy', prompt: 'Review changes',
				target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
				schedule: { interval: 'manual', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
			},
		}, cloudConfiguration());
		const startedInCloud = dialog.container.querySelector('[role="switch"]')?.getAttribute('aria-checked');
		await dialog.setCloud(false);
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ startedInCloud, target: result?.value.target }, {
			startedInCloud: 'true', target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
		});
	});

	test('an unavailable cloud provider while editing explains the reason without suggesting the disabled switch', async () => {
		const existing: IAutomationDescriptor = {
			id: 'cloud-edit', name: 'Review', prompt: 'Review changes', enabled: true, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1, timeZone: 'UTC' },
		};
		const dialog = openDialog({ existing }, cloudConfiguration(), undefined, undefined, true, true, false);
		assert.deepStrictEqual({
			switchDisabled: dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled,
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { switchDisabled: true, error: 'Cloud automations are unavailable. Try again in a few moments.', saveDisabled: 'true' });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('a late result for a previously selected repository does not affect the current one', async () => {
		const previous = URI.file('/previous');
		const previousTarget = observableValue<IAutomationWorkspaceTarget>('previousTarget', { pending: true, disabledReason: 'Checking repository access...' });
		const configuration = cloudConfiguration();
		const dialog = openDialog({}, {
			...configuration,
			getWorkspaceTarget: uri => isEqual(uri, previous) ? previousTarget : configuration.getWorkspaceTarget(uri),
		});
		dialog.setPrompt('Review changes');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(previous);
		await dialog.selectWorkspace(FOLDER);
		previousTarget.set({ isPublicRepository: true, disabledReason: 'This repository must be private' }, undefined);
		assert.deepStrictEqual({
			workspace: dialog.getTarget().workspace,
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { workspace: FOLDER, error: '', disabled: 'false' });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('closing during an execution-target switch cancels pending configuration capture', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		const dialog = openDialog({}, cloudConfiguration(), { getAutomationSessionConfiguration: () => capture.p });
		await timeout(0);
		const selection = dialog.selectWorkspace(REPOSITORY);
		await timeout(0);
		dialog.cancelButton.click();
		assert.strictEqual(await dialog.result, undefined);
		await selection;
		await timeout(0);
	});

	test('cloud becoming unavailable while switching on keeps the local target', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration | null>();
		const dialog = openDialog({}, cloudConfiguration(), { getAutomationSessionConfiguration: () => capture.p });
		await timeout(0);
		const toggle = dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		toggle.click();
		await timeout(0);
		transaction(tx => {
			dialog.cloudEnabled.set(false, tx);
			dialog.providers.set([{ id: 'host', label: 'Host' }], tx);
		});
		void capture.complete(null);
		await timeout(0);
		await timeout(0);
		assert.deepStrictEqual({
			checked: toggle.getAttribute('aria-checked'),
			rowHidden: dialog.container.querySelector('.automation-cloud-row')?.getAttribute('aria-hidden'),
			sessionType: dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label'),
		}, { checked: 'false', rowHidden: null, sessionType: 'Session Type, Copilot' });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('pending target capture is progress rather than a validation error', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		const dialog = openDialog({}, cloudConfiguration(), { getAutomationSessionConfiguration: () => capture.p });
		dialog.setPrompt('Say hello world');
		await timeout(0);
		const selection = dialog.selectWorkspace(REPOSITORY);
		await timeout(0);
		const target = dialog.container.querySelector('.automation-target-toolbar')!;
		const progress = dialog.container.querySelector('.automation-target-progress');
		const actual = {
			text: progress?.textContent, role: progress?.getAttribute('role'),
			invalid: target.getAttribute('aria-invalid'),
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
			busy: dialog.container.querySelector('.automation-form-content')?.getAttribute('aria-busy'),
		};
		dialog.cancelButton.click();
		await dialog.result;
		await selection;
		assert.deepStrictEqual(actual, {
			text: 'Saving the current session configuration...', role: 'status',
			invalid: null, error: '', saveDisabled: 'true', busy: 'true',
		});
	});

	test('pending repository eligibility is progress rather than a validation error', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { pending: true, disabledReason: 'Checking repository access...' });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.setPrompt('Say hello world');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		const actual = {
			text: dialog.container.querySelector('.automation-target-progress')?.textContent,
			invalid: dialog.container.querySelector('.automation-target-toolbar')?.getAttribute('aria-invalid'),
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		};
		dialog.cancelButton.click();
		await dialog.result;
		assert.deepStrictEqual(actual, { text: 'Checking repository access...', invalid: null, error: '', saveDisabled: 'true' });
	});

	test('target capture progress clears on success and cannot save the outgoing target', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		let committed = false;
		const dialog = openDialog({ commit: async () => { committed = true; } }, cloudConfiguration(), {
			getAutomationSessionConfiguration: () => capture.p,
		});
		dialog.setPrompt('Say hello world');
		await timeout(0);
		await dialog.setCloud(true);
		dialog.saveButton.click();
		await timeout(0);
		const committedWhilePending = committed;
		await capture.complete({});
		await timeout(0);
		await dialog.selectWorkspace(REPOSITORY);
		await timeout(0);
		assert.deepStrictEqual({
			committedWhilePending,
			pending: dialog.container.querySelector<HTMLElement>('.automation-target-progress')?.style.display,
			busy: dialog.container.querySelector('.automation-form-content')?.getAttribute('aria-busy'),
			invalid: dialog.container.querySelector('.automation-target-toolbar')?.getAttribute('aria-invalid'),
			saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { committedWhilePending: false, pending: 'none', busy: 'false', invalid: null, saveDisabled: 'false' });
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.strictEqual(result?.value.target?.providerId, 'cloud');
	});

	test('target capture failure clears progress, reports the error and allows retry', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		let fail = true;
		const dialog = openDialog({}, cloudConfiguration(), {
			getAutomationSessionConfiguration: () => fail ? capture.p : Promise.resolve({}),
		});
		dialog.setPrompt('Say hello world');
		await timeout(0);
		await dialog.setCloud(true);
		await capture.error(new Error('Capture failed'));
		await timeout(0);
		const failed = {
			error: dialog.container.querySelector('.automation-form-save-error')?.textContent,
			pending: dialog.container.querySelector<HTMLElement>('.automation-target-progress')?.style.display,
			inert: dialog.container.querySelector('.automation-form-content')?.hasAttribute('inert'),
			checked: dialog.container.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			target: dialog.getTarget().quickChat,
		};
		fail = false;
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ failed, provider: result?.value.target?.providerId }, {
			failed: { error: 'Capture failed', pending: 'none', inert: false, checked: 'false', target: true }, provider: 'cloud',
		});
	});

	test('repository progress uses normal foreground while terminal access errors remain invalid', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { pending: true, disabledReason: 'Checking repository access...' });
		let creations = 0;
		const dialog = openDialog({}, cloudConfiguration(target), {
			createAutomationSession: () => {
				creations++;
				return upcastPartial<ISession>({ sessionId: 'cloud-draft', providerId: 'cloud' });
			},
		});
		const previousForeground = dialog.container.style.getPropertyValue('--vscode-foreground');
		const previousError = dialog.container.style.getPropertyValue('--vscode-errorForeground');
		dialog.container.style.setProperty('--vscode-foreground', 'rgb(210, 211, 212)');
		dialog.container.style.setProperty('--vscode-errorForeground', 'rgb(240, 100, 100)');
		disposables.add(toDisposable(() => {
			dialog.container.style.setProperty('--vscode-foreground', previousForeground);
			dialog.container.style.setProperty('--vscode-errorForeground', previousError);
		}));
		dialog.setPrompt('Say hello world');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		const progress = dialog.container.querySelector<HTMLElement>('.automation-target-progress')!;
		const pending = { creations, color: DOM.getWindow(progress).getComputedStyle(progress).color };
		target.set({ disabledReason: 'Repository access denied' }, undefined);
		const error = dialog.container.querySelector<HTMLElement>('#automation-target-error')!;
		const denied = {
			error: error.textContent, color: DOM.getWindow(error).getComputedStyle(error).color,
			invalid: dialog.container.querySelector('.automation-target-toolbar')?.getAttribute('aria-invalid'),
			pending: progress.style.display, saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		};
		target.set({ workspace: REPOSITORY }, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			pending, denied, creations, saveDisabled: dialog.saveButton.getAttribute('aria-disabled'),
			invalid: dialog.container.querySelector('.automation-target-toolbar')?.getAttribute('aria-invalid'),
		}, {
			pending: { creations: 0, color: 'rgb(210, 211, 212)' },
			denied: { error: 'Repository access denied', color: 'rgb(240, 100, 100)', invalid: 'true', pending: 'none', saveDisabled: 'true' },
			creations: 1, saveDisabled: 'false', invalid: null,
		});
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('unchanged pending and error messages are not re-announced during prompt edits', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { pending: true, disabledReason: 'Checking repository access...' });
		const dialog = openDialog({}, cloudConfiguration(target));
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		const progress = dialog.container.querySelector<HTMLElement>('.automation-target-progress')!;
		const error = dialog.container.querySelector<HTMLElement>('#automation-target-error')!;
		const observer = new (DOM.getWindow(progress).MutationObserver)(() => { });
		disposables.add(toDisposable(() => observer.disconnect()));
		const counts: number[] = [];
		for (const node of [progress, error]) {
			if (node === error) {
				target.set({ disabledReason: 'Access denied' }, undefined);
			}
			observer.observe(node, { childList: true, characterData: true, subtree: true });
			dialog.setPrompt('Say hello world');
			dialog.setPrompt('Say hello again');
			counts.push(observer.takeRecords().length);
			observer.disconnect();
		}
		assert.deepStrictEqual(counts, [0, 0]);
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('eligibility becoming pending during capture blocks commit until a successful retry', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { workspace: REPOSITORY });
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		const started = new DeferredPromise<void>();
		let defer = false;
		let commits = 0;
		const dialog = openDialog({ commit: async () => { commits++; } }, cloudConfiguration(target), {
			getAutomationSessionConfiguration: async () => {
				if (defer) {
					void started.complete();
					return capture.p;
				}
				return {};
			},
		});
		dialog.setPrompt('Say hello world');
		await dialog.setCloud(true);
		await dialog.selectWorkspace(REPOSITORY);
		await timeout(0);
		defer = true;
		dialog.saveButton.click();
		await started.p;
		target.set({ pending: true, disabledReason: 'Checking repository access...' }, undefined);
		await capture.complete({});
		await timeout(0);
		const pending = { commits, disabled: dialog.saveButton.getAttribute('aria-disabled') };
		target.set({ disabledReason: 'Access denied' }, undefined);
		const denied = { commits, error: dialog.container.querySelector('#automation-target-error')?.textContent };
		defer = false;
		target.set({ workspace: REPOSITORY }, undefined);
		await timeout(0);
		dialog.saveButton.click();
		await dialog.result;
		assert.deepStrictEqual({ pending, denied, commits }, {
			pending: { commits: 0, disabled: 'true' }, denied: { commits: 0, error: 'Access denied' }, commits: 1,
		});
	});

	test('late outgoing capture completion cannot resurrect a cancelled dialog', async () => {
		const capture = new DeferredPromise<IAutomationSessionConfiguration>();
		let creations = 0;
		let commits = 0;
		const dialog = openDialog({ commit: async () => { commits++; } }, cloudConfiguration(), {
			getAutomationSessionConfiguration: () => capture.p,
			createAutomationSession: () => {
				creations++;
				return upcastPartial<ISession>({ sessionId: 'late' });
			},
		});
		await timeout(0);
		const selection = dialog.selectWorkspace(REPOSITORY);
		await timeout(0);
		dialog.cancelButton.click();
		await dialog.result;
		await selection;
		await capture.complete({});
		await timeout(0);
		assert.deepStrictEqual({ creations, commits, open: !!dialog.container.querySelector('.automation-dialog') }, {
			creations: 0, commits: 0, open: false,
		});
	});

	test('switching Cloud on and off captures the local configuration and restores Worktree', async () => {
		const localConfiguration = { sessionTemplate: { modelId: 'selected-model', config: { mode: 'plan', autoApprove: 'assisted' } } };
		const captures: string[] = [];
		const restored: Array<IAutomationSessionConfiguration | undefined> = [];
		const onDidCreateSession = disposables.add(new Emitter<string | undefined>());
		const dialog = openDialog({
			initialValues: {
				name: 'Review', prompt: 'Review changes', enabled: true,
				schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
				target: { kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'copilotcli', isolation: { kind: 'worktree', branch: 'release' } },
			},
		}, cloudConfiguration(), {
			getSessionTypesForFolder: () => [
				{ providerId: 'host', sessionType: { id: 'copilotcli', label: 'Copilot', icon: Codicon.copilot, authRequirement: SessionTypeAuthRequirement.None, supportsWorktreeConfiguration: true } },
				{ providerId: 'cloud', sessionType: { id: 'cloud-agent', label: 'Cloud', icon: Codicon.cloud, authRequirement: SessionTypeAuthRequirement.None } },
			],
			createAutomationSession: (_uri, options) => {
				if (options?.providerId === 'host') {
					restored.push(options.automationConfiguration);
				}
				onDidCreateSession.fire(options?.providerId);
				return upcastPartial<ISession>({ sessionId: `draft-${options?.providerId}`, providerId: options?.providerId });
			},
			getAutomationSessionConfiguration: async session => {
				captures.push(session.providerId);
				return session.providerId === 'host' ? localConfiguration : { sessionTemplate: { modelId: 'cloud-model' } };
			},
		}, upcastPartial<IGitRepository>({
			rootUri: FOLDER,
			state: constObservable({ HEAD: { type: GitRefType.Head, name: 'main', commit: 'abc123' }, remotes: [], mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [] }),
			getRefs: async () => [{ type: GitRefType.Head, name: 'release' }],
		}));
		await timeout(0);
		const toggle = dialog.container.querySelector<HTMLButtonElement>('[role="switch"]')!;
		// A switch is complete once the draft session is recreated for the new provider.
		const flip = async (providerId: string) => {
			const switched = Event.toPromise(Event.filter(onDidCreateSession.event, id => id === providerId));
			toggle.click();
			await switched;
		};
		await flip('cloud');
		const cloudSessionType = dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label');
		await flip('host');
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.ok(result?.kind === 'create');
		assert.deepStrictEqual({
			capturedBeforeCloud: captures[0], cloudSessionType, restored: restored.at(-1),
			isolation: result.value.target.kind === 'workspace' ? result.value.target.isolation : undefined,
			configuration: result.value.sessionTemplate,
		}, {
			capturedBeforeCloud: 'host', cloudSessionType: 'Session Type, Cloud', restored: localConfiguration,
			isolation: { kind: 'worktree', branch: 'release' }, configuration: localConfiguration.sessionTemplate,
		});
	});

	test('cloud edit disables the immutable workspace while preserving configuration and enabled state', async () => {
		const existing: IAutomationDescriptor = {
			id: 'cloud-existing', name: 'Review', prompt: 'Review changes', enabled: false, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: { interval: 'weekly', scheduleHour: 15, scheduleMinute: 30, scheduleDay: 2, timeZone: 'UTC' },
			sessionTemplate: { modelId: 'saved-model', config: { tools: ['read', 'future-tool'], reasoningEffort: 'high' } },
		};
		const dialog = openDialog({ existing }, cloudConfiguration());
		assert.deepStrictEqual({
			workspacePicker: dialog.container.querySelector('.automation-target-toolbar')?.textContent?.includes('Select workspace'),
			guidance: dialog.container.querySelector('.automation-form-hint')?.textContent,
			workspaceDisabledReason: dialog.getWorkspaceDisabledReason(),
			cloudDisabled: dialog.container.querySelector('[aria-label="Session Type, Cloud"]')?.getAttribute('aria-disabled'),
		}, { workspacePicker: true, guidance: 'Duplicate to change repository.', workspaceDisabledReason: 'Duplicate to change repository.', cloudDisabled: 'true' });
		dialog.saveButton.click();
		assert.deepStrictEqual(await dialog.result, {
			kind: 'update', id: existing.id,
			value: { name: existing.name, prompt: existing.prompt, target: existing.target, sessionTemplate: existing.sessionTemplate, enabled: false },
		});
	});

	test('the cloud row keeps its icon, accessible label and switch together when creating and editing', async () => {
		const existing: IAutomationDescriptor = {
			id: 'cloud-locked', name: 'Review', prompt: 'Review changes', enabled: true, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: { interval: 'manual', timeZone: 'UTC', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
		};
		const cloudRow = async (options: IShowAutomationDialogOptions) => {
			const dialog = openDialog(options, cloudConfiguration());
			const row = dialog.container.querySelector<HTMLElement>('.automation-cloud-row')!;
			const cloudSwitch = row.querySelector<HTMLButtonElement>('[role="switch"]')!;
			const snapshot = {
				rowVisible: row.style.display !== 'none',
				content: Array.from(row.children, element => element === cloudSwitch ? 'switch' : element.classList.contains('codicon-cloud') ? 'cloud icon' : element.textContent),
				iconHidden: row.querySelector('.codicon-cloud')?.getAttribute('aria-hidden'),
				accessibleLabel: row.querySelector(`#${cloudSwitch.getAttribute('aria-labelledby')}`)?.textContent,
				describedBy: cloudSwitch.getAttribute('aria-describedby'),
				disabled: cloudSwitch.disabled,
			};
			dialog.cancelButton.click();
			await dialog.result;
			return snapshot;
		};
		const expected = {
			rowVisible: true,
			content: ['cloud icon', 'Run in the Cloud', 'switch'],
			iconHidden: 'true',
			accessibleLabel: 'Run in the Cloud',
			describedBy: null,
		};
		assert.deepStrictEqual({ create: await cloudRow({}), edit: await cloudRow({ existing }) }, {
			create: { ...expected, disabled: false },
			edit: { ...expected, disabled: true },
		});
	});

	test('turning cloud on keeps a private local folder displayed and saves its repository', async () => {
		const dialog = openDialog({}, cloudConfiguration());
		dialog.setPrompt('Review changes');
		await dialog.selectWorkspace(FOLDER);
		await dialog.setCloud(true);
		assert.deepStrictEqual({
			workspace: dialog.getTarget().workspace,
			checked: dialog.container.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			sessionType: dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label'),
			localTime: dialog.container.textContent?.includes('Time (Local)'),
		}, { workspace: FOLDER, checked: 'true', sessionType: 'Session Type, Cloud', localTime: true });
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.ok(result?.kind === 'create' && result.value.target.kind === 'workspace');
		assert.deepStrictEqual({
			folder: result.value.target.folderUri.toString(), provider: result.value.target.providerId, timeZone: result.value.schedule.timeZone,
		}, { folder: REPOSITORY.toString(), provider: 'cloud', timeZone: 'UTC' });
	});

	test('public repository eligibility does not block local creation', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { isPublicRepository: true, disabledReason: 'This repository must be private' });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.setPrompt('Review changes');
		await dialog.selectWorkspace(FOLDER);
		assert.deepStrictEqual({
			sessionType: dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label'),
			localDisabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { sessionType: 'Session Type, Copilot', localDisabled: 'false' });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('an unverifiable repository blocks Cloud without changing execution provider', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { workspace: REPOSITORY });
		const dialog = openDialog({}, cloudConfiguration(target));
		dialog.setPrompt('Review changes');
		await dialog.selectWorkspace(FOLDER);
		await dialog.setCloud(true);
		target.set({ disabledReason: 'Unable to verify repository access.' }, undefined);
		assert.deepStrictEqual({
			sessionType: dialog.container.querySelector('.automation-target-toolbar [aria-label*="Session Type"]')?.getAttribute('aria-label'),
			error: dialog.container.querySelector('#automation-target-error')?.textContent,
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
		}, { sessionType: 'Session Type, Cloud', error: 'Unable to verify repository access.', disabled: 'true' });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('public repository eligibility does not transfer an existing cloud automation to another provider', async () => {
		const target = observableValue<IAutomationWorkspaceTarget>('target', { workspace: REPOSITORY });
		const existing: IAutomationDescriptor = {
			id: 'existing-cloud', name: 'Review', prompt: 'Review changes', enabled: true, createdAt: '', updatedAt: '',
			target: { kind: 'workspace', folderUri: REPOSITORY, providerId: 'cloud', sessionTypeId: 'cloud-agent', isolation: { kind: 'default' } },
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1, timeZone: 'UTC' },
		};
		const dialog = openDialog({ existing }, cloudConfiguration(target));
		target.set({ isPublicRepository: true, disabledReason: 'This repository must be private' }, undefined);
		assert.deepStrictEqual({
			cloud: !!dialog.container.querySelector('[aria-label="Session Type, Cloud"]'),
			disabled: dialog.saveButton.getAttribute('aria-disabled'),
			reason: dialog.container.querySelector('.automation-target-error')?.textContent,
		}, { cloud: true, disabled: 'true', reason: 'This repository must be private' });
		dialog.cancelButton.click();
		await dialog.result;
	});

	test('keeps the dialog open during commit and ignores cancel, close, and Escape', async () => {
		const started = new DeferredPromise<void>();
		const committed = new DeferredPromise<void>();
		const dialog = openDialog({
			commit: async () => {
				void started.complete();
				await committed.p;
			}
		});
		dialog.setPrompt('Review changes');
		dialog.saveButton.click();
		await started.p;
		dialog.cancelButton.click();
		dialog.container.querySelector<HTMLElement>('.dialog-toolbar .action-label')?.click();
		DOM.getWindow(dialog.container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		DOM.getWindow(dialog.container).dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
		assert.deepStrictEqual({
			open: !!dialog.container.querySelector('.automation-dialog'),
			save: dialog.saveButton.textContent,
			cancelDisabled: dialog.cancelButton.getAttribute('aria-disabled'),
			inert: dialog.container.querySelector('.automation-form-content')?.hasAttribute('inert'),
			progress: {
				active: dialog.container.querySelector('.automation-dialog-progress .monaco-progress-container')?.classList.contains('active'),
				visible: dialog.container.querySelector<HTMLElement>('.automation-dialog-progress .monaco-progress-container')?.style.display,
			},
			status: !!dialog.container.querySelector('.automation-form-save-status'),
		}, {
			open: true, save: 'Saving…', cancelDisabled: 'true', inert: true,
			progress: { active: true, visible: '' }, status: false,
		});
		void committed.complete();
		assert.deepStrictEqual((await dialog.result)?.kind, 'create');
	});

	test('shows commit errors inline, preserves input, and supports retry', async () => {
		let attempts = 0;
		const dialog = openDialog({
			commit: async () => {
				if (++attempts === 1) {
					throw new Error('Unable to sync plugin');
				}
			}
		});
		dialog.setPrompt('Review changes');
		dialog.setName('My automation');
		dialog.saveButton.click();
		await timeout(0);
		const error = dialog.container.querySelector<HTMLElement>('.automation-form-save-error')!;
		assert.deepStrictEqual({
			text: error.textContent,
			role: error.getAttribute('role'),
			focused: DOM.getWindow(error).document.activeElement === error,
			name: dialog.nameInput.value,
			save: dialog.saveButton.textContent,
			cancelDisabled: dialog.cancelButton.getAttribute('aria-disabled'),
			inert: dialog.container.querySelector('.automation-form-content')?.hasAttribute('inert'),
		}, { text: 'Unable to sync plugin', role: 'alert', focused: true, name: 'My automation', save: 'Create', cancelDisabled: 'false', inert: false });
		dialog.saveButton.click();
		assert.deepStrictEqual(error.style.display, 'none');
		assert.deepStrictEqual({ kind: (await dialog.result)?.kind, attempts }, { kind: 'create', attempts: 2 });
	});

	test('reloads choices from the form target controls and preserves toggles', async () => {
		const targets: string[] = [];
		const dialog = openDialog({}, async target => {
			targets.push(target.kind === 'workspace' ? target.folderUri.toString() : target.kind);
			return [
				{ id: 'a', label: 'A', selected: true, outdated: false },
				{ id: 'b', label: 'B', selected: false, outdated: false },
			];
		});
		await timeout(0);
		dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!.click();
		dialog.container.querySelectorAll<HTMLElement>('.automation-customization-row .monaco-checkbox')[1].click();
		dialog.setWorkspace(FOLDER);
		await timeout(0);
		dialog.setWorkspace(URI.file('/other'));
		await timeout(0);
		dialog.setPrompt('Review changes');
		dialog.saveButton.click();
		assert.deepStrictEqual({
			targets,
			selected: (await dialog.result)?.value.customizationIds,
		}, { targets: ['quickChat', FOLDER.toString(), URI.file('/other').toString()], selected: ['a', 'b'] });
	});

	test('surfaces commit cancellation rejections instead of silently abandoning the save', async () => {
		const error = new CancellationError();
		const dialog = openDialog({ commit: async () => { throw error; } });
		dialog.setPrompt('Review changes');
		dialog.saveButton.click();
		await timeout(0);
		const message = dialog.container.querySelector('.automation-form-save-error')?.textContent;
		dialog.cancelButton.click();
		assert.deepStrictEqual({ message, result: await dialog.result }, { message: getErrorMessage(error), result: undefined });
	});

	test('refreshes selected outdated choices on edit without expanding Advanced', async () => {
		const existing: IAutomationDescriptor = {
			id: 'existing', name: 'Review', prompt: 'Review changes',
			target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
			schedule: { interval: 'manual', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 }, enabled: true, createdAt: '', updatedAt: '',
		};
		let existingId: string | undefined;
		const dialog = openDialog({ existing }, async (_target, id) => {
			existingId = id;
			return [{ id: 'outdated', label: 'Outdated plugin', selected: true, outdated: true }];
		});
		await timeout(0);
		const expanded = dialog.container.querySelector('.automation-advanced-disclosure')?.getAttribute('aria-expanded');
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.deepStrictEqual({ expanded, existingId, kind: result?.kind, selected: result?.value.customizationIds }, {
			expanded: 'false', existingId: 'existing', kind: 'update', selected: ['outdated'],
		});
	});

	test('passes selected customization ids in choice order without requiring expansion', async () => {
		const choices: IAutomationCustomizationChoice[] = [
			{ id: 'second', label: 'Second', selected: true, outdated: true },
			{ id: 'first', label: 'First', selected: false, outdated: false },
			{ id: 'third', label: 'Third', selected: true, outdated: false },
		];
		const started = new DeferredPromise<void>();
		const committed = new DeferredPromise<void>();
		const dialog = openDialog({
			commit: async () => {
				void started.complete();
				await committed.p;
			}
		}, async () => choices);
		await timeout(0);
		const disclosure = dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!;
		disclosure.click();
		const checkboxes = dialog.container.querySelectorAll<HTMLElement>('.automation-customization-row .monaco-checkbox');
		checkboxes[1].click();
		disclosure.click();
		dialog.setPrompt('Review changes');
		dialog.saveButton.click();
		await started.p;
		assert.deepStrictEqual({
			expanded: disclosure.getAttribute('aria-expanded'),
			status: !!dialog.container.querySelector('.automation-form-save-status'),
		}, { expanded: 'false', status: false });
		void committed.complete();
		assert.deepStrictEqual((await dialog.result)?.value.customizationIds, ['second', 'first', 'third']);
	});

	test('hides Advanced when customizations are unsupported', async () => {
		for (const loader of [undefined, async () => undefined]) {
			const dialog = openDialog({}, loader);
			await timeout(0);
			const display = dialog.container.querySelector<HTMLElement>('.automation-advanced')?.style.display;
			dialog.setPrompt('Review changes');
			dialog.saveButton.click();
			assert.deepStrictEqual({ display, selected: (await dialog.result)?.value.customizationIds }, { display: 'none', selected: undefined });
		}
	});

	test('shows loading then an empty customization list', async () => {
		const choices = new DeferredPromise<readonly IAutomationCustomizationChoice[] | undefined>();
		const dialog = openDialog({}, async () => choices.p);
		const disclosure = dialog.container.querySelector<HTMLElement>('.automation-advanced-disclosure')!;
		disclosure.click();
		const loading = {
			summary: dialog.container.querySelector('.automation-advanced-summary')?.textContent,
			message: dialog.container.querySelector('.automation-customizations-message')?.textContent,
			expanded: disclosure.getAttribute('aria-expanded'),
			controls: disclosure.getAttribute('aria-controls'),
			spinners: dialog.container.querySelectorAll('.automation-customizations .codicon-loading.codicon-modifier-spin').length,
			chevrons: disclosure.querySelectorAll('.codicon-chevron-down').length,
		};
		void choices.complete([]);
		await timeout(0);
		dialog.setPrompt('Review changes');
		dialog.saveButton.click();
		assert.deepStrictEqual({
			loading,
			empty: dialog.container.querySelector('.automation-customizations')?.textContent?.includes('No customizations are available for this target.'),
			selected: (await dialog.result)?.value.customizationIds,
		}, {
			loading: { summary: 'Loading…', message: 'Loading customizations…', expanded: 'true', controls: 'automation-advanced-content', spinners: 1, chevrons: 1 },
			empty: true,
			selected: [],
		});
	});

	for (const { label, prompt, name } of [
		{ label: 'short prompt', prompt: '  Review changes  ', name: 'Review changes' },
		{ label: 'multiline whitespace', prompt: '\n Review\t the  changes\n today ', name: 'Review the changes today' },
		{ label: 'word boundary', prompt: 'Review the recent changes and summarize outstanding work for the team', name: 'Review the recent changes and summarize' },
		{ label: 'exact limit', prompt: 'a'.repeat(50), name: 'a'.repeat(50) },
		{ label: 'word ending at limit', prompt: `${'a'.repeat(50)} next`, name: 'a'.repeat(50) },
		{ label: 'long word', prompt: 'a'.repeat(60), name: 'a'.repeat(50) },
		{ label: 'Unicode characters', prompt: '\u{1F600}'.repeat(60), name: '\u{1F600}'.repeat(50) },
	]) {
		test(`creates from prompt only (${label}), deriving the name and defaulting to quick chat`, async () => {
			const dialog = openDialog();
			dialog.setPrompt(prompt);
			assert.deepStrictEqual({
				name: dialog.nameInput.value,
				target: dialog.getTarget(),
				disabled: dialog.saveButton.getAttribute('aria-disabled'),
			}, { name: '', target: { quickChat: true, workspace: undefined }, disabled: 'false' });
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.ok(result?.kind === 'create');
			assert.deepStrictEqual(result.value, {
				name, prompt,
				target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
				schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
				enabled: true,
			});
		});
	}

	test('requires a non-whitespace prompt and derives a whitespace-only name', async () => {
		const dialog = openDialog();
		dialog.setName(' \t ');
		const initialDisabled = dialog.saveButton.getAttribute('aria-disabled');
		dialog.setPrompt(' \n\t ');
		const whitespaceDisabled = dialog.saveButton.getAttribute('aria-disabled');
		dialog.setPrompt('Summarize changes');
		assert.deepStrictEqual([initialDisabled, whitespaceDisabled, dialog.saveButton.getAttribute('aria-disabled')], ['true', 'true', 'false']);
		dialog.saveButton.click();
		const result = await dialog.result;
		assert.ok(result?.kind === 'create');
		assert.strictEqual(result.value.name, 'Summarize changes');
	});

	suite('Automation customization selection', () => {
		test('hides the customization loading summary when trigger fields own collapsed Advanced', async () => {
			const choices = new DeferredPromise<readonly IAutomationCustomizationChoice[] | undefined>();
			const container = DOM.$('div');
			const triggerFields = DOM.$('.automation-trigger-fields');
			const selection = disposables.add(new AutomationCustomizationSelection(
				container,
				upcastPartial<IAutomationService>({ getCustomizationChoices: async () => choices.p }),
				upcastPartial<IHoverService>({ setupDelayedHover: () => toDisposable(() => { }) }),
				new NullLogService(),
				undefined,
				triggerFields,
			));
			selection.setAdditionalContentVisible(true);
			selection.updateTarget({ kind: 'quickChat', providerId: 'cloud', sessionTypeId: 'cloud-agent' });
			const disclosure = container.querySelector<HTMLElement>('.automation-advanced-disclosure')!;
			const summary = container.querySelector<HTMLElement>('.automation-advanced-summary')!;
			const body = container.querySelector<HTMLElement>('.automation-advanced-content')!;
			const collapsed = {
				sectionDisplay: container.querySelector<HTMLElement>('.automation-advanced')?.style.display,
				summaryText: summary.textContent,
				summaryHidden: summary.hidden,
				bodyDisplay: body.style.display,
			};
			disclosure.click();
			const expanded = {
				summaryHidden: summary.hidden,
				bodyDisplay: body.style.display,
				loading: container.querySelector('.automation-customizations-message')?.textContent,
			};
			void choices.complete([]);
			await timeout(0);
			assert.deepStrictEqual({ collapsed, expanded }, {
				collapsed: { sectionDisplay: '', summaryText: 'Loading…', summaryHidden: true, bodyDisplay: 'none' },
				expanded: { summaryHidden: true, bodyDisplay: '', loading: 'Loading customizations…' },
			});
		});

		test('cancels target reloads and preserves only explicit toggles by id', async () => {
			const requests: { target: string; cancelled: () => boolean; result: DeferredPromise<readonly IAutomationCustomizationChoice[] | undefined> }[] = [];
			const container = DOM.$('div');
			const selection = disposables.add(new AutomationCustomizationSelection(
				container,
				upcastPartial<IAutomationService>({
					getCustomizationChoices: async (target, existingId, token) => {
						assert.strictEqual(existingId, 'existing');
						const result = new DeferredPromise<readonly IAutomationCustomizationChoice[] | undefined>();
						requests.push({ target: target.sessionTypeId ?? '', cancelled: () => token.isCancellationRequested, result });
						return result.p;
					},
				}),
				upcastPartial<IHoverService>({ setupDelayedHover: () => toDisposable(() => { }) }),
				new NullLogService(),
				'existing',
			));
			selection.updateTarget({ kind: 'quickChat', providerId: 'host', sessionTypeId: 'one' });
			void requests[0].result.complete([
				{ id: 'toggled', label: 'Toggled', selected: true, outdated: false },
				{ id: 'default', label: 'Default', selected: true, outdated: false },
			]);
			await timeout(0);
			container.querySelector<HTMLElement>('.automation-advanced-disclosure')!.click();
			container.querySelector<HTMLElement>('.monaco-checkbox')!.click();
			selection.updateTarget({ kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'two', isolation: { kind: 'folder' } });
			selection.updateTarget({ kind: 'workspace', folderUri: FOLDER, providerId: 'host2', sessionTypeId: 'three', isolation: { kind: 'folder' } });
			void requests[2].result.complete([
				{ id: 'new', label: 'New', selected: true, outdated: false },
				{ id: 'toggled', label: 'Toggled', selected: true, outdated: true },
				{ id: 'default', label: 'Default', selected: false, outdated: false },
			]);
			await timeout(0);
			void requests[1].result.complete([{ id: 'stale', label: 'Stale', selected: true, outdated: false }]);
			await timeout(0);
			assert.deepStrictEqual({
				requests: requests.map(request => ({ target: request.target, cancelled: request.cancelled() })),
				selected: selection.getSelectedIds(),
				summary: container.querySelector('.automation-advanced-summary')?.textContent,
			}, {
				requests: [{ target: 'one', cancelled: true }, { target: 'two', cancelled: true }, { target: 'three', cancelled: false }],
				selected: ['new'],
				summary: '1 of 3 customizations · 1 outdated',
			});
		});

		test('reloads on isolation changes and waits for a pending load before reporting the selection', async () => {
			const requests: DeferredPromise<readonly IAutomationCustomizationChoice[] | undefined>[] = [];
			const selection = disposables.add(new AutomationCustomizationSelection(
				DOM.$('div'),
				upcastPartial<IAutomationService>({
					getCustomizationChoices: async () => {
						const result = new DeferredPromise<readonly IAutomationCustomizationChoice[] | undefined>();
						requests.push(result);
						return result.p;
					},
				}),
				upcastPartial<IHoverService>({ setupDelayedHover: () => toDisposable(() => { }) }),
				new NullLogService(),
			));
			selection.updateTarget({ kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'one', isolation: { kind: 'folder' } });
			selection.updateTarget({ kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'one', isolation: { kind: 'worktree', branch: 'main' } });
			const beforeLoad = selection.getSelectedIds();
			const waited = selection.waitForChoices(CancellationToken.None).then(() => selection.getSelectedIds());
			void requests[1].complete([{ id: 'plugin', label: 'Plugin', selected: true, outdated: false }]);
			assert.deepStrictEqual({ requests: requests.length, beforeLoad, afterLoad: await waited }, {
				requests: 2, beforeLoad: undefined, afterLoad: ['plugin'],
			});
		});
	});

	test('preserves a supplied quick-chat target and custom name', async () => {
		const initialValues = {
			name: ' Custom title ', prompt: 'Review changes',
			target: { kind: 'quickChat' as const, providerId: 'host', sessionTypeId: 'copilotcli' },
			schedule: { interval: 'daily' as const, scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
			enabled: true,
		};
		const dialog = openDialog({ initialValues });
		assert.deepStrictEqual(dialog.getTarget(), { quickChat: true, workspace: undefined });
		dialog.saveButton.click();
		assert.deepStrictEqual(await dialog.result, { kind: 'create', value: initialValues });
	});

	for (const editing of [false, true]) {
		test(`preserves a supplied title and workspace when ${editing ? 'editing' : 'creating'}`, async () => {
			const existing: IAutomationDescriptor = {
				id: 'existing', name: 'My custom title', prompt: 'Review changes',
				target: { kind: 'workspace', folderUri: FOLDER, providerId: 'host', sessionTypeId: 'copilotcli', isolation: { kind: 'folder' } },
				schedule: { interval: 'manual', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
				enabled: false, createdAt: '', updatedAt: '',
			};
			const dialog = openDialog(editing ? { existing } : { initialValues: existing });
			assert.deepStrictEqual({ name: dialog.nameInput.value, target: dialog.getTarget() }, {
				name: existing.name, target: { quickChat: false, workspace: FOLDER },
			});
			if (editing) {
				dialog.setName(' ');
				assert.strictEqual(dialog.saveButton.getAttribute('aria-disabled'), 'true');
				dialog.setName(existing.name);
			}
			dialog.saveButton.click();
			const result = await dialog.result;
			assert.deepStrictEqual(result, {
				kind: editing ? 'update' : 'create',
				...(editing ? { id: existing.id } : {}),
				value: { name: existing.name, prompt: existing.prompt, target: existing.target, schedule: existing.schedule, enabled: existing.enabled },
			});
		});
	}
});

suite('Automation dialog layout', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders target and prompt controls before the schedule in DOM and keyboard order', () => {
		const configurationService = new TestConfigurationService();
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			contextKeyService: () => contextKeyService,
		}, disposables);
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(IMenuService, disposables.add(instantiationService.createInstance(MenuService)));
		instantiationService.stub(IActionWidgetService, new RecordingActionWidgetService());
		instantiationService.stub(IGitService, upcastPartial<IGitService>({ openRepository: async () => undefined }));
		const sessionTypesChanged = disposables.add(new Emitter<void>());
		const sessionsManagementService = instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			automationSession: constObservable(undefined),
			onDidChangeSessionTypes: sessionTypesChanged.event,
			getSessionTypesForFolder: () => [],
			getQuickChatSessionTypes: () => [],
			getAllProviderSessionTypes: () => [],
			isNewSessionTargetAvailable: () => true,
			isQuickChatTargetAvailable: () => true,
		}));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);

		const workspaceButton = DOM.$('button', { type: 'button' }, 'Select workspace');
		let targetModel: AutomationIsolationModel | undefined;
		instantiationService.stubInstance(MobileAutomationsWorkspacePicker, {
			setTargetModel: model => { targetModel = model; },
			setCloudConfiguration: () => { },
			setCloudMode: () => { },
			setLayoutService: () => { },
			onDidSelectWorkspace: Event.None,
			render: container => container.appendChild(workspaceButton),
			dispose: () => { },
		});
		instantiationService.stubInstance(MobileSessionTypePicker, {
			setQuickChatSource: () => { },
			setFolderSource: () => { },
			modelTargetChatSessionType: constObservable(undefined),
			onDidChangeSelectedPick: Event.None,
			selectedPick: undefined,
			render: () => { },
			dispose: () => { },
		});
		instantiationService.stubInstance(SessionModelSelection, { dispose: () => { } });
		instantiationService.stubInstance(AutomationInputCompletions, { dispose: () => { } });
		const promptInput = document.createElement('textarea');
		promptInput.setAttribute('aria-label', 'Prompt');
		disposables.add(MenuRegistry.appendMenuItem(Menus.AutomationsDialogInputToolbar, {
			command: { id: 'test.automation.agent', title: 'Agent' },
			group: 'navigation',
		}));
		disposables.add(MenuRegistry.appendMenuItem(Menus.NewSessionControl, {
			command: { id: 'test.automation.executionMode', title: 'Interactive' },
			group: 'navigation',
		}));
		const inputToolbarWidget = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, DOM.$('div'), Menus.AutomationsDialogInputToolbar, {}));
		const inputToolbar = inputToolbarWidget.getElement();
		inputToolbar.classList.add('chat-input-toolbar');
		instantiationService.stubInstance(ChatInputPart, {
			render: (container, value) => {
				promptInput.value = value ?? '';
				const inputContainer = DOM.append(container, DOM.$('.chat-input-container'));
				inputContainer.append(promptInput, inputToolbar);
			},
			inputToolbarElement: inputToolbar,
			setInputToolbarAriaLabel: label => inputToolbarWidget.setAriaLabel(label),
			inputEditor: upcastPartial<ChatInputPart['inputEditor']>({
				updateOptions: () => { },
				onDidChangeModelContent: Event.None,
				getValue: () => promptInput.value,
			}),
			layout: () => { },
			dispose: () => { },
		});

		const form = DOM.append(document.body, DOM.$('.automation-form'));
		disposables.add(toDisposable(() => form.remove()));
		const formDisposables = disposables.add(new DisposableStore());
		const state: IFormState = { ...createFormState(), folderUri: undefined, providerId: undefined, sessionTypeId: undefined };
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		let validationCalls = 0;
		const handle = renderForm(
			form, state, formDisposables, validation, () => validationCalls++, instantiationService, contextKeyService,
			instantiationService.get(IContextViewService), configurationService, instantiationService.get(IWorkbenchLayoutService),
			new NullLogService(), sessionsManagementService, instantiationService.get(IWorkspaceTrustRequestService),
			'Review the workspace', undefined, undefined,
			constObservable([]),
		);
		disposables.add(registerAutomationDialogKeyboardNavigation(DOM.getWindow(form), handle.getFocusableElements, () => false));
		workspaceButton.focus();
		dispatchKey(workspaceButton, 'keydown', 'Tab');

		const targetRow = form.querySelector('.automation-target-row')!;
		const promptSection = form.querySelector('.automation-prompt-section')!;
		const inputContainer = form.querySelector('.chat-input-container')!;
		const sessionControls = form.querySelector('.automation-session-configuration')!;
		const scheduleRow = form.querySelector('.automation-form-schedule-row')!;
		assert.deepStrictEqual({
			formSections: Array.from(form.querySelector('.automation-form-content')!.children, element => element.className),
			enabledCheckbox: form.querySelector('[role="checkbox"][aria-label="Enabled"]'),
			targetLabel: targetRow.querySelector('.automation-target-toolbar')?.getAttribute('aria-label'),
			targetContainsWorkspace: targetRow.contains(workspaceButton),
			targetBeforePrompt: !!(targetRow.compareDocumentPosition(promptSection) & Node.DOCUMENT_POSITION_FOLLOWING),
			targetControls: Array.from(targetRow.querySelectorAll('button:not([disabled]), a[href]'), element => element.textContent),
			hintInTarget: !!targetRow.querySelector('.automation-target-hint'),
			promptFocused: document.activeElement === promptInput,
			prompt: handle.getPrompt(),
			targetUnselected: !state.isQuickChat && state.folderUri === undefined && state.sessionTypeId === undefined,
			configurationInsideInput: inputContainer.contains(inputToolbar),
			controlsInsideInput: inputContainer.contains(sessionControls),
			controlsAfterInput: !!(inputContainer.compareDocumentPosition(sessionControls) & Node.DOCUMENT_POSITION_FOLLOWING),
			scheduleAfterControls: !!(sessionControls.compareDocumentPosition(scheduleRow) & Node.DOCUMENT_POSITION_FOLLOWING),
			configurationHeader: form.querySelector('#automation-session-configuration-label'),
			inputToolbarWrapperRole: inputToolbar.getAttribute('role'),
			inputToolbarLabel: inputToolbar.querySelector('[role="toolbar"]')?.getAttribute('aria-label'),
			inputToolbarLabelCount: form.querySelectorAll('[aria-label="Session configuration options"]').length,
			controlsWrapperRole: sessionControls.getAttribute('role'),
			controlsLabel: sessionControls.querySelector('[role="toolbar"]')?.getAttribute('aria-label'),
			controlsLabelCount: form.querySelectorAll('[aria-label="Session controls"]').length,
			inputToolbarHidden: inputToolbar.style.display === 'none',
		}, {
			formSections: [
				'automation-form-row',
				'automation-cloud-row',
				'automation-session-section',
				'automation-form-row automation-form-schedule-row',
				'automation-trigger-editor',
				'automation-trigger-required-fields',
				'automation-target-error',
				'automation-advanced',
			],
			enabledCheckbox: null,
			targetLabel: 'Target',
			targetContainsWorkspace: true,
			targetBeforePrompt: true,
			targetControls: ['Select workspace'],
			hintInTarget: false,
			promptFocused: true,
			prompt: 'Review the workspace',
			targetUnselected: true,
			configurationInsideInput: true,
			controlsInsideInput: false,
			controlsAfterInput: true,
			scheduleAfterControls: true,
			configurationHeader: null,
			inputToolbarWrapperRole: null,
			inputToolbarLabel: 'Session configuration options',
			inputToolbarLabelCount: 1,
			controlsWrapperRole: null,
			controlsLabel: 'Session controls',
			controlsLabelCount: 1,
			inputToolbarHidden: true,
		});

		dispatchKey(promptInput, 'keydown', 'Tab');
		const scheduleInput = scheduleRow.querySelector<HTMLElement>('[aria-label="Trigger"]')!;
		const scheduleFocused = document.activeElement === scheduleInput;
		dispatchKey(scheduleInput, 'keydown', 'Tab', true);
		assert.deepStrictEqual({
			scheduleFocused,
			promptFocusedOnShiftTab: document.activeElement === promptInput,
		}, {
			scheduleFocused: true,
			promptFocusedOnShiftTab: true,
		});

		assert.ok(targetModel);
		targetModel.setQuickChat(true);
		assert.deepStrictEqual({
			status: form.querySelector('.automation-session-configuration-unavailable')?.textContent,
			inputToolbarVisible: inputToolbar.style.display !== 'none',
			inputToolbarInert: inputToolbar.inert,
			inputToolbarAriaHidden: inputToolbar.getAttribute('aria-hidden'),
			promptInert: promptInput.inert || !!promptInput.closest('[inert]'),
			controlsInert: form.querySelector('.automation-session-controls')?.hasAttribute('inert'),
		}, {
			status: 'Session configuration unavailable',
			inputToolbarVisible: true,
			inputToolbarInert: true,
			inputToolbarAriaHidden: 'true',
			promptInert: false,
			controlsInert: true,
		});

		const targetGroup = form.querySelector('.automation-target-toolbar')!;
		const targetError = form.querySelector<HTMLElement>('.automation-target-error')!;
		const validationPresentation = () => ({
			text: targetError.textContent,
			visible: targetError.style.display !== 'none',
			description: targetGroup.getAttribute('aria-describedby'),
			invalid: targetGroup.getAttribute('aria-invalid'),
			role: targetError.getAttribute('role'),
			live: targetError.getAttribute('aria-live'),
		});
		updateSaveButtonState(undefined, state, validation, form, handle.getPrompt, handle.getBranch, sessionsManagementService, false);
		handle.showTargetValidationError(validation.sessionTypeError);
		const unavailable = validationPresentation();
		state.providerId = 'remote';
		state.sessionTypeId = 'copilotcli';
		updateSaveButtonState(undefined, state, validation, form, handle.getPrompt, handle.getBranch, sessionsManagementService, true, 'local');
		handle.showTargetValidationError(validation.sessionTypeError);
		const crossHost = validationPresentation();
		updateSaveButtonState(undefined, state, validation, form, handle.getPrompt, handle.getBranch, sessionsManagementService, true, 'remote');
		handle.showTargetValidationError(validation.sessionTypeError);
		assert.deepStrictEqual({ unavailable, crossHost, resolved: validationPresentation() }, {
			unavailable: {
				text: 'Choose an available Agent Host that supports automations.',
				visible: true, description: targetError.id, invalid: 'true', role: 'status', live: 'polite',
			},
			crossHost: {
				text: 'To use another Agent Host, duplicate this automation. The original keeps its schedule until you disable it.',
				visible: true, description: targetError.id, invalid: 'true', role: 'status', live: 'polite',
			},
			resolved: { text: '', visible: false, description: null, invalid: null, role: 'status', live: 'polite' },
		});
		const previousValidationCalls = validationCalls;
		sessionTypesChanged.fire();
		assert.ok(validationCalls > previousValidationCalls, 'session capabilities must revalidate even when the selected host is unchanged');
	});

	test('editing honors Update without create capability and reacts when update authority is lost', () => {
		const existing: IAutomationDescriptor = {
			id: 'host:ahp-automation:/existing',
			name: 'Review',
			prompt: 'Review changes',
			target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			enabled: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
		};
		const catalogueState = observableValue<AutomationCatalogueState>('catalogue', 'ready');
		const automations = observableValue<readonly IAutomationDescriptor[]>('automations', [existing]);
		let canUpdate = true;
		const service = upcastPartial<IAutomationService>({
			catalogueState, automations, availableProviders: constObservable([]),
			canCreateAutomation: () => false,
			canUpdateAutomation: () => catalogueState.get() === 'ready' && canUpdate,
		});
		const editing = getAutomationDialogProviders(service, existing);
		const creating = getAutomationDialogProviders(service, undefined);
		const states: (readonly string[])[] = [];
		disposables.add(autorun(reader => states.push(editing.read(reader))));
		const state = createFormState({ providerId: 'host', isQuickChat: true, folderUri: undefined, isolationMode: undefined });
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		const form = document.createElement('form');
		const { service: sessionsManagementService } = createAutomationDraftService();
		updateSaveButtonState(undefined, state, validation, form, () => 'Renamed review prompt', () => undefined, sessionsManagementService, editing.get().includes('host'), 'host');
		const editableError = validation.sessionTypeError;
		canUpdate = false;
		automations.set([{ ...existing }], undefined);
		updateSaveButtonState(undefined, state, validation, form, () => 'Renamed review prompt', () => undefined, sessionsManagementService, editing.get().includes('host'), 'host');
		assert.deepStrictEqual({ states, creationProviders: creating.get(), editableError, restrictedError: validation.sessionTypeError }, {
			states: [['host'], []],
			creationProviders: [],
			editableError: undefined,
			restrictedError: 'Choose an available Agent Host that supports automations.',
		});
	});

	test('keeps target actions out of the prompt toolbar', () => {
		const targetActions = MenuRegistry.getMenuItems(Menus.AutomationsDialogTargetToolbar).filter(isIMenuItem);
		const promptActions = [
			...MenuRegistry.getMenuItems(Menus.AutomationsDialogInputToolbar),
			...MenuRegistry.getMenuItems(MenuId.ChatInputSecondary),
		].filter(isIMenuItem);
		assert.deepStrictEqual({
			target: targetActions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(item => item.command.id),
			duplicatedInPrompt: promptActions.some(item => targetActions.some(target => target.command.id === item.command.id)),
		}, {
			target: [
				'workbench.action.chat.renderAutomationsWorkspacePicker',
				'workbench.action.chat.renderAutomationsHarnessChip',
				'workbench.action.chat.renderAutomationsIsolationGroup',
			],
			duplicatedInPrompt: false,
		});
	});
});

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

class RecordingQuickTree extends mock<IQuickTree<IQuickTreeItem>>() {
	private readonly acceptEmitter = new Emitter<void>();
	private readonly hideEmitter = new Emitter<IQuickInputHideEvent>();
	private readonly checkedEmitter = new Emitter<readonly IQuickTreeItem[]>();
	override readonly onDidChangeCheckedLeafItems = this.checkedEmitter.event;
	override readonly onDidAccept = this.acceptEmitter.event;
	override readonly onDidHide = this.hideEmitter.event;
	override title: string | undefined;
	override placeholder: string | undefined;
	override matchOnDescription = false;
	override sortByLabel = true;
	items: IQuickTreeItem[] = [];
	visible = false;
	disposed = false;

	get leaves(): IQuickTreeItem[] {
		return this.items.flatMap(item => item.children ? item.children as IQuickTreeItem[] : [item]);
	}
	override get checkedLeafItems(): readonly IQuickTreeItem[] {
		return this.leaves.filter(item => item.checked === true);
	}
	override setItemTree(items: IQuickTreeItem[]): void {
		this.items = items.map(item => ({ ...item, children: item.children?.map(child => ({ ...child })) }));
	}
	override show(): void {
		this.visible = true;
	}
	override hide(reason = QuickInputHideReason.Other): void {
		if (this.visible) {
			this.visible = false;
			this.hideEmitter.fire({ reason });
		}
	}
	toggle(label: string): void {
		const item = this.leaves.find(candidate => candidate.label === label)!;
		item.checked = item.checked !== true;
		this.checkedEmitter.fire(this.checkedLeafItems);
	}
	override accept(): void {
		this.acceptEmitter.fire();
	}
	override dispose(): void {
		this.hide();
		this.disposed = true;
		this.acceptEmitter.dispose();
		this.hideEmitter.dispose();
		this.checkedEmitter.dispose();
	}
}

class RecordingQuickInputService extends mock<IQuickInputService>() {
	trees: RecordingQuickTree[] = [];
	override createQuickTree<T extends IQuickTreeItem>(): IQuickTree<T> {
		const tree = new RecordingQuickTree();
		this.trees.push(tree);
		return tree as unknown as IQuickTree<T>;
	}
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

function createAutomationDraftService(
	captureSupported = true,
	captureError?: Error,
	capturePromise?: Promise<IAutomationSessionConfiguration | null | undefined>,
	targetAvailability: { readonly workspace?: boolean; readonly quickChat?: boolean } = {},
) {
	const automationSession = observableValue<ISession | undefined>('automationSession', undefined);
	const created: Array<{ kind: 'workspace' | 'quickChat'; providerId: string | undefined; sessionTypeId: string; folderUri?: string; sessionTemplate?: IAutomationSessionTemplate }> = [];
	const discarded: string[] = [];
	const sessionConfigurations = new Map<string, IAutomationSessionConfiguration>();
	let nextId = 1;
	const createDraft = (kind: 'workspace' | 'quickChat', providerId: string | undefined, sessionTypeId: string, folderUri?: URI, sessionTemplate?: IAutomationSessionTemplate): ISession => {
		const previous = automationSession.get();
		if (previous) {
			discarded.push(previous.sessionId);
		}
		const session = upcastPartial<ISession>({
			sessionId: `automation-${nextId++}`,
			providerId: providerId ?? 'resolved-provider',
			sessionType: sessionTypeId,
		});
		created.push({ kind, providerId, sessionTypeId, folderUri: folderUri?.toString(), ...(sessionTemplate ? { sessionTemplate } : {}) });
		sessionConfigurations.set(session.sessionId, { sessionTemplate });
		automationSession.set(session, undefined);
		return session;
	};
	const service = upcastPartial<ISessionsManagementService>({
		automationSession,
		createAutomationSession: (folderUri, options) => createDraft('workspace', options?.providerId, options?.sessionTypeId ?? 'default', folderUri, options?.sessionTemplate),
		createAutomationQuickChat: options => createDraft('quickChat', options?.providerId, options?.sessionTypeId ?? 'default', undefined, options?.sessionTemplate),
		isNewSessionTargetAvailable: () => targetAvailability.workspace !== false,
		isQuickChatTargetAvailable: () => targetAvailability.quickChat !== false,
		supportsAutomationSessionConfiguration: () => captureSupported,
		getAutomationSessionConfiguration: async session => {
			if (captureError) {
				throw captureError;
			}
			if (capturePromise) {
				return capturePromise;
			}
			return captureSupported ? sessionConfigurations.get(session.sessionId) : null;
		},
		discardAutomationSession: session => {
			const current = automationSession.get();
			if (!current || (session && session.sessionId !== current.sessionId)) {
				return;
			}
			discarded.push(current.sessionId);
			automationSession.set(undefined, undefined);
		},
	});
	return { service, created, discarded, sessionConfigurations };
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
			availability: synchronizer.availability.get(),
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
			availability: 'idle',
		});
	});

	test('restores and captures the target session template', async () => {
		const { service, created } = createAutomationDraftService();
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => { }));
		const sessionTemplate = {
			modelId: 'model',
			agent: { uri: 'file:///agent.md' },
			config: { mode: 'plan' },
		};

		synchronizer.update({
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration: { sessionTemplate },
		});

		const captured = await synchronizer.getSessionConfiguration();

		assert.deepStrictEqual({
			created,
			captured,
		}, {
			created: [{
				kind: 'workspace',
				providerId: 'provider',
				sessionTypeId: 'type',
				folderUri: 'file:///workspace',
				sessionTemplate,
			}],
			captured: { kind: 'captured', configuration: { sessionTemplate } },
		});
	});

	test('preserves saved configuration when workspace and quick-chat targets are unavailable', async () => {
		const workspaceConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: { config: { mode: 'plan' } },
		};
		const quickChatConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: { config: { mode: 'autopilot', autoApprove: 'assisted' } },
		};
		const { service, created } = createAutomationDraftService(true, undefined, undefined, { workspace: false, quickChat: false });
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => { }));

		synchronizer.update({
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration: workspaceConfiguration,
		});
		const workspaceCapture = await synchronizer.getSessionConfiguration();
		const workspaceAvailability = synchronizer.availability.get();

		synchronizer.update({
			kind: 'quickChat',
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration: quickChatConfiguration,
		});
		const quickChatCapture = await synchronizer.getSessionConfiguration();

		assert.deepStrictEqual({
			created,
			workspaceCapture,
			workspaceAvailability,
			quickChatCapture,
			quickChatAvailability: synchronizer.availability.get(),
		}, {
			created: [],
			workspaceCapture: { kind: 'preserved', configuration: workspaceConfiguration },
			workspaceAvailability: 'unavailable',
			quickChatCapture: { kind: 'preserved', configuration: quickChatConfiguration },
			quickChatAvailability: 'unavailable',
		});
	});

	test('distinguishes a valid empty capture from unsupported capture', async () => {
		const sessionConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: {
				modelId: 'model',
				config: { mode: 'plan' },
			},
			modelId: 'model',
			mode: 'plan',
		};
		const supported = createAutomationDraftService();
		const supportedSynchronizer = disposables.add(new AutomationSessionDraftSynchronizer(supported.service, async () => true, () => { }));
		supportedSynchronizer.update({
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration,
		});
		await supportedSynchronizer.waitForSync();
		const supportedSessionId = supported.service.automationSession.get()!.sessionId;
		supported.sessionConfigurations.set(supportedSessionId, {});

		const unsupported = createAutomationDraftService(false);
		const unsupportedSynchronizer = disposables.add(new AutomationSessionDraftSynchronizer(unsupported.service, async () => true, () => { }));
		unsupportedSynchronizer.update({
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration,
		});

		assert.deepStrictEqual({
			supported: await supportedSynchronizer.getSessionConfiguration(),
			unsupported: await unsupportedSynchronizer.getSessionConfiguration(),
		}, {
			supported: { kind: 'captured', configuration: {} },
			unsupported: { kind: 'preserved', configuration: sessionConfiguration },
		});
	});

	test('reports capture failures instead of silently preserving configuration', async () => {
		const sessionConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: { config: { mode: 'plan' } },
		};
		const { service } = createAutomationDraftService(true, new Error('capture failed'));
		let errorCount = 0;
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => errorCount++));
		synchronizer.update({
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration,
		});

		const capture = await synchronizer.getSessionConfiguration();
		assert.deepStrictEqual({
			capture: capture.kind === 'failed' ? { kind: capture.kind, message: getErrorMessage(capture.error) } : capture,
			errorCount,
		}, {
			capture: { kind: 'failed', message: 'capture failed' },
			errorCount: 1,
		});
	});

	test('bounds complete configuration capture and reports timeouts', async () => {
		const sessionConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: { config: { mode: 'plan' } },
		};
		const { service } = createAutomationDraftService(true, undefined, new Promise(() => { }));
		let errorCount = 0;
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => errorCount++, 1));
		synchronizer.update({
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration,
		});

		const capture = await synchronizer.getSessionConfiguration();
		assert.deepStrictEqual({
			capture: capture.kind === 'failed' ? { kind: capture.kind, timedOut: getErrorMessage(capture.error).includes('Timed out') } : capture,
			errorCount,
		}, {
			capture: { kind: 'failed', timedOut: true },
			errorCount: 1,
		});
	});

	test('coalesces an equal target while synchronization is pending', async () => {
		const validation = new DeferredPromise<boolean>();
		const { service, created } = createAutomationDraftService();
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, () => validation.p, () => { }));
		const target = {
			kind: 'workspace',
			folderUri: URI.parse('file:///workspace'),
			providerId: 'provider',
			sessionTypeId: 'type',
		} as const;

		synchronizer.update(target);
		await Promise.resolve();
		synchronizer.update(target);
		validation.complete(true);
		await synchronizer.waitForSync();

		assert.deepStrictEqual(created, [{
			kind: 'workspace',
			providerId: 'provider',
			sessionTypeId: 'type',
			folderUri: 'file:///workspace',
		}]);
	});

	test('serializes synchronization when the target changes during validation', async () => {
		const firstValidation = new DeferredPromise<boolean>();
		const validated: string[] = [];
		const { service, created } = createAutomationDraftService();
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async folderUri => {
			validated.push(folderUri.path);
			return folderUri.path === '/first' ? firstValidation.p : true;
		}, () => { }));

		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///first'), providerId: 'provider', sessionTypeId: 'type' });
		await Promise.resolve();
		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///second'), providerId: 'provider', sessionTypeId: 'type' });
		const beforeFirstSettled = [...validated];
		firstValidation.complete(true);
		await synchronizer.waitForSync();

		assert.deepStrictEqual({
			beforeFirstSettled,
			validated,
			created,
		}, {
			beforeFirstSettled: ['/first'],
			validated: ['/first', '/second'],
			created: [{
				kind: 'workspace',
				providerId: 'provider',
				sessionTypeId: 'type',
				folderUri: 'file:///second',
			}],
		});
	});

	test('carries captured configuration when returning to a previous target', async () => {
		const initialConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: { modelId: 'model', modelConfiguration: { thinkingLevel: 'high' }, config: { mode: 'interactive' } },
		};
		const capturedConfiguration: IAutomationSessionConfiguration = {
			sessionTemplate: { modelId: 'model', modelConfiguration: { thinkingLevel: 'low' }, config: { mode: 'plan', autoApprove: 'assisted' } },
		};
		const { service, created, sessionConfigurations } = createAutomationDraftService();
		const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => { }));
		const firstTarget = {
			kind: 'workspace',
			folderUri: URI.parse('file:///first'),
			providerId: 'provider',
			sessionTypeId: 'type',
			sessionConfiguration: initialConfiguration,
		} as const;

		synchronizer.update(firstTarget);
		await synchronizer.waitForSync();
		sessionConfigurations.set(service.automationSession.get()!.sessionId, capturedConfiguration);
		synchronizer.update({ kind: 'workspace', folderUri: URI.parse('file:///second'), providerId: 'provider', sessionTypeId: 'type' });
		await synchronizer.waitForSync();
		synchronizer.update(firstTarget);
		await synchronizer.waitForSync();

		assert.deepStrictEqual(created.map(entry => ({
			folderUri: entry.folderUri,
			sessionTemplate: entry.sessionTemplate,
		})), [{
			folderUri: 'file:///first',
			sessionTemplate: initialConfiguration.sessionTemplate,
		}, {
			folderUri: 'file:///second',
			sessionTemplate: undefined,
		}, {
			folderUri: 'file:///first',
			sessionTemplate: capturedConfiguration.sessionTemplate,
		}]);
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
		firstWorkspaceValidation.complete(true);
		await synchronizer.waitForSync();

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
			availability: synchronizer.availability.get(),
		}, {
			created: [],
			currentSession: undefined,
			errorCount: 1,
			availability: 'unavailable',
		});
	});

	test('retries an unchanged target after draft creation fails', async () => {
		const automationSession = observableValue<ISession | undefined>('automationSession', undefined);
		let createCount = 0;
		let errorCount = 0;
		const service = upcastPartial<ISessionsManagementService>({
			automationSession,
			isNewSessionTargetAvailable: () => true,
			isQuickChatTargetAvailable: () => true,
			supportsAutomationSessionConfiguration: () => true,
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
			availability: synchronizer.availability.get(),
		}, {
			createCount: 2,
			errorCount: 1,
			sessionId: 'automation-retry',
			availability: 'available',
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

suite('Automation dialog target validation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('an offset outside the quarter-hour grid blocks cloud save with an explicit schedule error', () => {
		const state = createFormState({ timeZone: 'UTC', timezoneOffset: 44, hour: 9, minute: 45, isolationMode: undefined });
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		const form = document.createElement('form');
		const saveButton = disposables.add(new Button(form, defaultButtonStyles));
		updateSaveButtonState(saveButton, state, validation, form, () => 'prompt', () => undefined,
			upcastPartial<ISessionsManagementService>({ isNewSessionTargetAvailable: () => true }));
		assert.deepStrictEqual({ enabled: saveButton.enabled, error: validation.scheduleError }, {
			enabled: false, error: 'Choose a time that corresponds to minute 00, 15, 30, or 45 in UTC.',
		});
	});

	for (const editing of [false, true]) {
		test(`validates the retained host, workspace, and session type before ${editing ? 'saving' : 'creating'}`, () => {
			const remoteFolder = URI.parse('vscode-remote://ssh-remote+host/workspace');
			const sessionsManagementService = upcastPartial<ISessionsManagementService>({
				isNewSessionTargetAvailable: (folder, options) => isEqual(folder, remoteFolder) && options?.providerId === 'remote' && options.sessionTypeId === 'copilotcli',
				isQuickChatTargetAvailable: options => options?.providerId === 'remote' && options.sessionTypeId === 'copilotcli',
			});
			const state = createFormState({ providerId: 'remote', isQuickChat: true, folderUri: undefined, isolationMode: undefined });
			const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
			const form = document.createElement('form');
			const saveButton = disposables.add(new Button(form, defaultButtonStyles));
			const validate = () => {
				updateSaveButtonState(saveButton, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService, true, editing ? 'remote' : undefined);
				return { enabled: saveButton.enabled, error: validation.sessionTypeError };
			};

			const quickChat = validate();
			state.isQuickChat = false;
			state.folderUri = FOLDER;
			const localWorkspace = validate();
			state.folderUri = remoteFolder;
			const remoteWorkspace = validate();
			state.sessionTypeId = 'unavailable';
			const unavailableWorkspaceType = validate();
			state.isQuickChat = true;
			state.folderUri = undefined;
			const unavailableQuickChatType = validate();
			state.sessionTypeId = 'copilotcli';

			const workspaceError = 'The selected Agent Host and session type cannot use this workspace. Choose another workspace or session type.';
			assert.deepStrictEqual({
				quickChat, localWorkspace, remoteWorkspace, unavailableWorkspaceType, unavailableQuickChatType,
				restoredQuickChat: validate(),
				selectedHost: state.providerId,
			}, {
				quickChat: { enabled: true, error: undefined },
				localWorkspace: { enabled: false, error: workspaceError },
				remoteWorkspace: { enabled: true, error: undefined },
				unavailableWorkspaceType: { enabled: false, error: workspaceError },
				unavailableQuickChatType: { enabled: false, error: 'The selected Agent Host and session type cannot run without a workspace. Choose a workspace or another session type.' },
				restoredQuickChat: { enabled: true, error: undefined },
				selectedHost: 'remote',
			});
		});
	}
});

suite('Automation branch picker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const { service: sessionsManagementService } = createAutomationDraftService();

	function createItem(options?: {
		readonly state?: IFormState;
		readonly getRefs?: IGitRepository['getRefs'];
		readonly failOpenRepositoryOnce?: boolean;
		readonly providerInitiallyUnavailable?: boolean;
		readonly revalidate?: () => void;
		readonly visible?: boolean;
		readonly hasRepository?: boolean | ((folder: URI) => boolean | Promise<boolean>);
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
			openRepository: async folder => {
				openRepositoryAttempts++;
				if (options?.failOpenRepositoryOnce && openRepositoryAttempts === 1) {
					throw new Error('failed to open repository');
				}
				const hasRepository = typeof options?.hasRepository === 'function' ? await options.hasRepository(folder) : options?.hasRepository;
				return hasRepository === false ? undefined : repository;
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

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService);
		assert.strictEqual(validation.branchError, 'A branch is required for Worktree isolation.');

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => 'main', sessionsManagementService);
		assert.strictEqual(validation.branchError, undefined);
	});

	test('prevents saving unavailable and cross-host targets with actionable validation', () => {
		const state = createFormState({ providerId: 'remote', isolationMode: undefined });
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		const form = document.createElement('form');
		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService, false);
		const unavailable = validation.sessionTypeError;
		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService, true, 'local');
		const differentHost = validation.sessionTypeError;
		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService, true, 'remote');
		assert.deepStrictEqual({ unavailable, differentHost, sameHost: validation.sessionTypeError }, {
			unavailable: 'Choose an available Agent Host that supports automations.',
			differentHost: 'To use another Agent Host, duplicate this automation. The original keeps its schedule until you disable it.',
			sameHost: undefined,
		});
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

		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService);
		const validTarget = { ...validation };
		state.providerId = undefined;
		state.sessionTypeId = undefined;
		updateSaveButtonState(undefined, state, validation, form, () => 'prompt', () => undefined, sessionsManagementService);

		assert.deepStrictEqual({
			validTarget,
			missingTarget: validation,
		}, {
			validTarget: {
				scheduleError: undefined,
				nameError: undefined,
				promptError: undefined,
				folderError: undefined,
				sessionTypeError: undefined,
				branchError: undefined,
			},
			missingTarget: {
				scheduleError: undefined,
				nameError: undefined,
				promptError: undefined,
				folderError: undefined,
				sessionTypeError: 'Session type is required.',
				branchError: undefined,
			},
		});
	});

	test('requires a concrete provider for workspace-backed targets', () => {
		const state = createFormState({ providerId: undefined, isolationMode: 'workspace' });
		const validation: IValidationState = {
			nameError: undefined,
			promptError: undefined,
			folderError: undefined,
			sessionTypeError: undefined,
			branchError: undefined,
		};

		updateSaveButtonState(undefined, state, validation, document.createElement('form'), () => 'prompt', () => undefined, sessionsManagementService);

		assert.deepStrictEqual(validation, {
			nameError: undefined,
			promptError: undefined,
			folderError: undefined,
			sessionTypeError: 'Session type is required.',
			branchError: undefined,
			scheduleError: undefined,
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

	test('hides the Worktree and branch pickers for a non-Git workspace', async () => {
		const { container, model, state } = createItem({ visible: true, hasRepository: false });
		await timeout(0);

		assert.deepStrictEqual({
			display: container.style.display,
			ariaHidden: container.getAttribute('aria-hidden'),
			isolationMode: state.isolationMode,
			branch: model.persistedBranch,
		}, {
			display: 'none',
			ariaHidden: 'true',
			isolationMode: 'workspace',
			branch: undefined,
		});
	});

	test('keeps saving available when switching from Worktree to a non-Git workspace', async () => {
		const { container, model, state } = createItem({ hasRepository: folder => isEqual(folder, FOLDER) });
		const form = document.createElement('form');
		const saveButton = disposables.add(new Button(form, defaultButtonStyles));
		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };
		const snapshot = () => {
			updateSaveButtonState(saveButton, state, validation, form, () => 'prompt', () => model.persistedBranch, sessionsManagementService);
			return {
				display: container.style.display,
				isolationMode: state.isolationMode,
				branch: model.persistedBranch,
				branchError: validation.branchError,
				canSave: saveButton.enabled,
			};
		};
		await timeout(0);
		const git = snapshot();
		model.setWorkspace(URI.file('/non-git'));
		await timeout(0);
		const nonGit = snapshot();
		model.setWorkspace(FOLDER);
		await timeout(0);
		const restoredGit = snapshot();
		model.selectIsolationMode('worktree');

		assert.deepStrictEqual({ git, nonGit, restoredGit, reselectedWorktree: snapshot() }, {
			git: { display: '', isolationMode: 'worktree', branch: 'main', branchError: undefined, canSave: true },
			nonGit: { display: 'none', isolationMode: 'workspace', branch: undefined, branchError: undefined, canSave: true },
			restoredGit: { display: '', isolationMode: 'workspace', branch: undefined, branchError: undefined, canSave: true },
			reselectedWorktree: { display: '', isolationMode: 'worktree', branch: 'main', branchError: undefined, canSave: true },
		});
	});

	test('ignores a stale non-Git result after returning to a Git workspace', async () => {
		const nonGitResult = new DeferredPromise<boolean>();
		const { container, model, state } = createItem({
			hasRepository: folder => isEqual(folder, FOLDER) ? true : nonGitResult.p,
		});
		await timeout(0);
		model.setWorkspace(URI.file('/non-git'));
		const pendingMode = state.isolationMode;
		model.setWorkspace(FOLDER);
		await timeout(0);
		await nonGitResult.complete(false);
		await timeout(0);

		assert.deepStrictEqual({
			pendingMode,
			display: container.style.display,
			isolationMode: state.isolationMode,
			branch: model.persistedBranch,
		}, {
			pendingMode: 'worktree',
			display: '',
			isolationMode: 'worktree',
			branch: 'main',
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

});

suite('Automation dialog keyboard navigation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const escapeScenarios = [
		{ name: 'a normal Escape press', interveningEvents: [] },
		{ name: 'repeated Escape keydowns', interveningEvents: [{ type: 'keydown', repeat: true }, { type: 'keydown', repeat: true }] },
		{ name: 'another keydown before Escape is released', interveningEvents: [{ type: 'keydown', key: 'a', keyCode: 65 }] },
		{ name: 'another keyup before Escape is released', interveningEvents: [{ type: 'keyup', key: 'a', keyCode: 65 }] },
	];

	for (const { name, interveningEvents } of escapeScenarios) {
		test(`keeps the dialog open when the Trigger popup handles ${name}`, async () => {
			const container = DOM.append(document.body, DOM.$('div'));
			disposables.add({ dispose: () => container.remove() });
			const contextView = disposables.add(new ContextViewHandler(upcastPartial<ILayoutService>({
				mainContainer: container,
				activeContainer: container,
				onDidLayoutContainer: Event.None,
			})));
			let select!: HTMLSelectElement;
			let promptCancellationAttempts = 0;
			const dialog = disposables.add(new Dialog(container, 'New automation', ['Cancel'], {
				cancelId: 0,
				isExternalFocusAllowed: isAutomationDialogPopupTarget,
				renderBody: body => {
					const selectBox = disposables.add(new SelectBox(
						[{ text: 'Manual' }, { text: 'Daily' }, { text: 'Weekly' }],
						1,
						contextView,
						defaultSelectBoxStyles,
						{ ariaLabel: 'Trigger', useCustomDrawn: true },
					));
					selectBox.render(body);
					select = body.querySelector('select')!;
					disposables.add(registerAutomationDialogKeyboardNavigation(
						DOM.getWindow(body),
						() => [select],
						isAutomationDialogPopupTarget,
						undefined,
						() => {
							promptCancellationAttempts++;
							return false;
						},
					));
				},
				buttonStyles: defaultButtonStyles,
				checkboxStyles: defaultCheckboxStyles,
				inputBoxStyles: defaultInputBoxStyles,
				dialogStyles: defaultDialogStyles,
			}));
			let closed = false;
			const result = dialog.show().then(() => { closed = true; });
			const dispatch = (type: string, options: KeyboardEventInit = {}) => {
				document.activeElement!.dispatchEvent(new KeyboardEvent(type, {
					key: 'Escape', keyCode: 27, bubbles: true, cancelable: true, ...options,
				}));
			};

			select.click();
			const popupTarget = document.activeElement;
			assert.ok(DOM.isHTMLElement(popupTarget) && isAutomationDialogPopupTarget(popupTarget));
			dispatch('keydown');
			for (const { type, ...options } of interveningEvents) {
				dispatch(type, options);
			}
			dispatch('keyup');
			await timeout(0);

			assert.deepStrictEqual({
				closed,
				expanded: select.getAttribute('aria-expanded'),
				focusRestored: document.activeElement === select,
				value: select.value,
				promptCancellationAttempts,
			}, {
				closed: false,
				expanded: 'false',
				focusRestored: true,
				value: 'Daily',
				promptCancellationAttempts: 0,
			});

			dispatch('keydown');
			dispatch('keyup');
			await timeout(0);
			assert.strictEqual(closed, true, 'A separate Escape press still closes the dialog');
			dialog.dispose();
			await result;
		});
	}

	function createPromptDialog(cancelPromptSuggestion: () => boolean) {
		const container = DOM.append(document.body, DOM.$('div'));
		disposables.add({ dispose: () => container.remove() });
		const prompt = DOM.$<HTMLTextAreaElement>('textarea');
		prompt.value = 'Unsaved automation prompt';
		const dialog = disposables.add(new Dialog(container, 'New automation', ['Cancel'], {
			cancelId: 0,
			isExternalFocusAllowed: isAutomationDialogPopupTarget,
			renderBody: body => {
				body.appendChild(prompt);
				disposables.add(registerAutomationDialogKeyboardNavigation(
					DOM.getWindow(body),
					() => [prompt],
					isAutomationDialogPopupTarget,
					undefined,
					cancelPromptSuggestion,
				));
			},
			buttonStyles: defaultButtonStyles,
			checkboxStyles: defaultCheckboxStyles,
			inputBoxStyles: defaultInputBoxStyles,
			dialogStyles: defaultDialogStyles,
		}));
		let closed = false;
		const result = dialog.show().then(() => { closed = true; });
		prompt.focus();
		return {
			dialog,
			prompt,
			result,
			isClosed: () => closed,
			dispatch: (type: string, options: KeyboardEventInit = {}) => {
				const event = new KeyboardEvent(type, {
					key: 'Escape', keyCode: 27, bubbles: true, cancelable: true, ...options,
				});
				document.activeElement!.dispatchEvent(event);
				return event;
			},
		};
	}

	for (const { name, interveningEvents, shiftKey } of [
		...escapeScenarios.map(scenario => ({ ...scenario, shiftKey: false })),
		{ name: 'Shift+Escape', interveningEvents: [], shiftKey: true },
	]) {
		test(`keeps the dialog open when prompt suggestions handle ${name}`, async () => {
			let suggestionsActive = true;
			let cancellationAttempts = 0;
			const { dialog, prompt, result, isClosed, dispatch } = createPromptDialog(() => {
				cancellationAttempts++;
				const cancelled = suggestionsActive;
				suggestionsActive = false;
				return cancelled;
			});
			const keydown = dispatch('keydown', { shiftKey });
			for (const { type, ...options } of interveningEvents) {
				dispatch(type, options);
			}
			dispatch('keyup', { shiftKey });
			await timeout(0);

			const afterSuggestionEscape = {
				closed: isClosed(),
				suggestionsActive,
				cancellationAttempts,
				promptFocused: document.activeElement === prompt,
				value: prompt.value,
				keydownPrevented: keydown.defaultPrevented,
			};
			dispatch('keydown');
			dispatch('keyup');
			await timeout(0);

			assert.deepStrictEqual({
				afterSuggestionEscape,
				closedAfterNextEscape: isClosed(),
			}, {
				afterSuggestionEscape: {
					closed: false,
					suggestionsActive: false,
					cancellationAttempts: 1,
					promptFocused: true,
					value: 'Unsaved automation prompt',
					keydownPrevented: true,
				},
				closedAfterNextEscape: true,
			});
			dialog.dispose();
			await result;
		});
	}

	for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
		test(`does not cancel prompt suggestions for Escape with ${modifier}`, async () => {
			let cancellationAttempts = 0;
			const { dialog, prompt, result, isClosed, dispatch } = createPromptDialog(() => {
				cancellationAttempts++;
				return true;
			});
			const keydown = dispatch('keydown', { [modifier]: true });
			dispatch('keyup', { [modifier]: true });
			await timeout(0);

			assert.deepStrictEqual({
				closed: isClosed(),
				cancellationAttempts,
				promptFocused: document.activeElement === prompt,
				keydownPrevented: keydown.defaultPrevented,
			}, {
				closed: false,
				cancellationAttempts: 0,
				promptFocused: true,
				keydownPrevented: false,
			});
			dialog.dispose();
			await result;
		});
	}

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
		const inertContainer = container.appendChild(document.createElement('div'));
		inertContainer.setAttribute('inert', '');
		const inert = inertContainer.appendChild(document.createElement('button'));
		const ariaDisabled = container.appendChild(document.createElement('button'));
		ariaDisabled.setAttribute('aria-disabled', 'true');
		const third = container.appendChild(document.createElement('button'));
		const navigation = disposables.add(registerAutomationDialogKeyboardNavigation(
			targetWindow,
			() => [first, hidden, wrapper, second, inert, ariaDisabled, third],
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
