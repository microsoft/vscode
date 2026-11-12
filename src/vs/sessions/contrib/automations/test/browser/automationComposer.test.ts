/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestDataTelemetryService } from '../../../../../platform/telemetry/test/common/testTelemetryService.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { INewChatComposerInputOptions } from '../../../../../workbench/contrib/sessions/browser/chat/newChatComposerInput.js';
import { SharedChatInputComposer } from '../../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { WorkspacePicker } from '../../../../../workbench/contrib/sessions/browser/chat/sessionWorkspacePicker.js';
import { IPreferredSessionType } from '../../../../../workbench/contrib/sessions/browser/chat/sessionTypePicker.js';
import { ISendRequestOptions, ISendRequestSentEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { IChatRequestVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { IPromptsService, PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { BUILTIN_SKILLS_URI } from '../../../chat/browser/promptsService.js';
import { AutomationComposer } from '../../browser/automationComposer.js';

suite('Automation composer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const skill = joinPath(BUILTIN_SKILLS_URI, 'automate', 'SKILL.md');
	const folder = URI.file('/workspace');

	function setup() {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService({ chat: { automations: { enabled: true } } });
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatViewFactory, { inputEditorOptions: { fontSize: 16, lineHeight: 24 } });
		const telemetry = new TestDataTelemetryService();
		instantiationService.stub(ITelemetryService, telemetry);
		const providers = observableValue('providers', [{ id: 'host', label: 'Host' }]);
		instantiationService.stub(IAutomationService, upcastPartial<IAutomationService>({
			availableProviders: providers,
			getProviderConfiguration: () => undefined,
		}));
		const disabledSkills = new ResourceSet();
		const prompts = upcastPartial<IPromptsService>({
			findAgentSkills: async () => [{
				name: 'automate', uri: URI.file('/personal/automate/SKILL.md'), description: 'Shadowing skill',
				storage: PromptsStorage.user, disableModelInvocation: false, userInvocable: true,
			}],
			listPromptFilesForStorage: async () => [{ name: 'automate', uri: skill, type: PromptsType.skill, storage: PromptsStorage.builtIn }],
			getDisabledPromptFiles: () => disabledSkills,
		});
		instantiationService.stub(IPromptsService, prompts);
		const drafts: { folder: URI | undefined; session: ISession }[] = [];
		const requests: { session: ISession; options: ISendRequestOptions }[] = [];
		const discarded: ISession[] = [];
		const opened: URI[] = [];
		const notifications: string[] = [];
		const sent = store.add(new Emitter<ISendRequestSentEvent>());
		const currentDraft = observableValue<ISession | undefined>('currentDraft', undefined);
		let sendFailure: Error | undefined;
		let openFailure: Error | undefined;
		let replacement: ISession | undefined;
		const createDraft = (folder: URI | undefined, providerId = 'host') => {
			const session = Object.assign(createTestActiveSession(`draft-${drafts.length}`, false), { providerId, sessionType: 'copilotcli' });
			drafts.push({ folder, session });
			currentDraft.set(session, undefined);
			return session;
		};
		const defaultSlotCalls: string[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessionTypes: Event.None,
			onDidSendRequest: sent.event,
			createQuickChat: () => { defaultSlotCalls.push('createQuickChat'); return createDraft(undefined); },
			createNewSession: folder => { defaultSlotCalls.push('createNewSession'); return createDraft(folder); },
			discardNewSession: () => { defaultSlotCalls.push('discardNewSession'); },
			createNewSessionSlot: () => ({
				id: 'automation',
				newSession: currentDraft,
				createQuickChat: options => createDraft(undefined, options?.providerId),
				createNewSession: (folder, options) => createDraft(folder, options?.providerId),
				discardNewSession: session => { if (session) { discarded.push(session); } },
				dispose: () => {
					const draft = currentDraft.get();
					if (draft) {
						discarded.push(draft);
					}
				},
			}),
			isQuickChatTargetAvailable: () => true,
			isNewSessionTargetAvailable: () => true,
			sendNewChatRequest: async (session, options) => {
				requests.push({ session, options });
				if (sendFailure) {
					throw sendFailure;
				}
				currentDraft.set(undefined, undefined);
				sent.fire({ session: replacement ?? session, chat: session.mainChat.get(), options, isNewSession: true, isNewChat: true });
			},
		}));
		instantiationService.stub(ISessionsService, {
			openSession: async resource => {
				opened.push(resource);
				if (openFailure) {
					throw openFailure;
				}
			}
		});
		instantiationService.stub(INotificationService, { error: message => notifications.push(String(message)) });
		const preferredDevContainers: string[] = [];
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>(providerId: string) => upcastPartial<IAgentHostSessionsProvider>({
				id: providerId,
				preferDevContainer: sessionId => { preferredDevContainers.push(sessionId); },
			}) as unknown as T,
		}));
		const workspaceChanged = store.add(new Emitter<void>());
		const workspaceMode = store.add(new Emitter<{ readonly folderUri: URI; readonly preferDevContainer: boolean }>());
		let selectedFolder: URI | undefined;
		instantiationService.stubInstance(WorkspacePicker, {
			onDidChangeSelection: workspaceChanged.event,
			onDidSelectWorkspaceMode: workspaceMode.event,
			get selectedFolderUri() { return selectedFolder; },
			validateSelectedWorkspace: async () => true,
			render: container => DOM.append(container, DOM.$('button', { 'aria-label': 'Select Workspace' }, 'Select workspace')),
			dispose: () => { },
		});
		const pickChanged = store.add(new Emitter<IPreferredSessionType | undefined>());
		let pick: IPreferredSessionType = { providerId: 'host', sessionTypeId: 'copilotcli' };
		const input = DOM.$<HTMLTextAreaElement>('textarea');
		input.value = 'Review changes';
		instantiationService.stubInstance(SharedChatInputComposer, {
			pickerHoverDelegate: upcastPartial<SharedChatInputComposer['pickerHoverDelegate']>({}),
			sessionTypePicker: upcastPartial<SharedChatInputComposer['sessionTypePicker']>({
				get selectedPick() { return pick; },
				setQuickChatSource: () => { },
				setFolderSource: () => { },
				onDidChangeSelectedPick: pickChanged.event,
			}),
			render: container => { container.appendChild(input); },
			focus: () => input.focus(),
			getInputValue: () => input.value,
			dispose: () => { },
		});
		const creations: ReturnType<typeof spy>[] = [];
		const createChild = stub(instantiationService, 'createChild').callsFake(services => {
			const child = store.add(new TestInstantiationService(services, false, instantiationService));
			const creation = spy(child, 'createInstance');
			creations.push(creation);
			store.add(toDisposable(() => creation.restore()));
			return child;
		});
		store.add(toDisposable(() => createChild.restore()));
		const root = DOM.$('div');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const composer = store.add(instantiationService.createInstance(AutomationComposer, root));
		const options = creations.flatMap(creation => creation.getCalls()).find(call => call.args[0] === SharedChatInputComposer)!.args[1] as INewChatComposerInputOptions;
		root.appendChild(composer.element);
		return {
			composer, root, input, providers, prompts, disabledSkills, drafts, requests, discarded, telemetry, configuration, options, opened, notifications, currentDraft, defaultSlotCalls, preferredDevContainers,
			selectFolder: (folder: URI | undefined, preferDevContainer = false) => {
				if (folder) {
					workspaceMode.fire({ folderUri: folder, preferDevContainer });
				}
				selectedFolder = folder;
				workspaceChanged.fire();
			},
			selectHarness: (value: IPreferredSessionType) => { pick = value; pickChanged.fire(value); },
			setSendFailure: (error: Error | undefined) => { sendFailure = error; },
			setOpenFailure: (error: Error) => { openFailure = error; },
			replaceStartedSession: (session: ISession) => { replacement = session; },
		};
	}

	for (const query of ['Review changes', '/automate Review changes']) {
		test(`sends the configured normal draft with the pinned bundled skill, not a shadowing skill (${query})`, async () => {
			const { options, drafts, requests, telemetry, selectFolder } = setup();
			selectFolder(folder);
			const draft = drafts.at(-1)!;
			const sent = await options.sendRequest({ query });
			assert.deepStrictEqual({ sent, target: draft.folder, requests, outcomes: telemetry.events.filter(event => event.name === 'automation.dialogOutcome').map(event => event.data) }, {
				sent: true, target: folder,
				requests: [{
					session: draft.session,
					options: {
						query: 'Follow only the attached automate SKILL.md to help me create an automation. Use this session\'s workspace as the default automation workspace unless I choose another.\n\nReview changes',
						attachedContext: [toPromptFileVariableEntry(skill, PromptFileVariableKind.PromptFile)],
					},
				}],
				outcomes: [{ operation: 'create', outcome: 'sessionStarted' }],
			});
		});
	}

	for (const unavailable of ['disabled', 'skills disabled', 'missing bundled skill']) {
		test(`an unavailable bundled skill prevents dispatch and leaves the input available (${unavailable})`, async () => {
			const { options, composer, input, prompts, disabledSkills, requests } = setup();
			if (unavailable === 'disabled') {
				disabledSkills.add(skill);
			} else if (unavailable === 'skills disabled') {
				prompts.findAgentSkills = async () => undefined;
			} else {
				prompts.listPromptFilesForStorage = async () => [];
			}
			const sent = await options.sendRequest({ query: input.value });
			assert.deepStrictEqual({
				sent, requests, input: input.value,
				message: composer.element.querySelector('[role="alert"]')?.textContent,
			}, {
				sent: false, requests: [], input: 'Review changes',
				message: 'The built-in /automate skill is unavailable or disabled. Enable it before starting the walkthrough.',
			});
		});
	}

	test('stale submit actions cannot send after AI or the selected provider becomes unavailable', async () => {
		const { options, providers, configuration, requests } = setup();
		providers.set([], undefined);
		const providerUnavailable = await options.sendRequest({ query: 'Review changes' });
		providers.set([{ id: 'host', label: 'Host' }], undefined);
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		const aiDisabled = await options.sendRequest({ query: 'Review changes' });
		assert.deepStrictEqual({ providerUnavailable, aiDisabled, requests }, { providerUnavailable: false, aiDisabled: false, requests: [] });
	});

	test('uses the automation input menu and lower provider controls without inline creation buttons', () => {
		const { composer, options, input } = setup();
		assert.deepStrictEqual({
			menu: options.inputToolbar,
			lowerControls: typeof options.renderRepositoryControls,
			inlineButtons: composer.element.querySelectorAll('.automation-authoring-actions').length,
			input: input.value, persistDraft: options.persistDraft, metrics: options.inputEditorOptions,
		}, {
			menu: Menus.AutomationsDialogInputToolbar, lowerControls: 'function', inlineButtons: 0,
			input: 'Review changes', persistDraft: false, metrics: { fontSize: 16, lineHeight: 24 },
		});
	});

	test('accessible content and focus include the composer above the cards', () => {
		const { composer, root, input } = setup();
		composer.focus();
		assert.deepStrictEqual({
			found: AutomationComposer.getForElement(input) === composer,
			focused: DOM.isActiveElement(input),
			content: composer.getAccessibleContent(),
			description: root.querySelector('.automation-authoring-workspace-description')?.textContent,
		}, {
			found: true, focused: true, content: 'Create an automation\nDefault workspace: No workspace\nReview changes',
			description: 'The automation will use the selected workspace by default.',
		});
	});

	test('an in-flight skill lookup cannot send after the composer is disposed', async () => {
		const { options, composer, prompts, requests } = setup();
		const pending = new DeferredPromise<Awaited<ReturnType<IPromptsService['findAgentSkills']>>>();
		prompts.findAgentSkills = () => pending.p;
		const sending = options.sendRequest({ query: 'Review changes' });
		composer.dispose();
		await pending.complete([]);
		assert.deepStrictEqual({ sent: await sending, requests }, { sent: false, requests: [] });
	});

	test('send failure keeps configuration and allows retry without creating another draft or authoring flow', async () => {
		const { composer, options, drafts, requests, telemetry, setSendFailure } = setup();
		setSendFailure(new Error('Provider disconnected'));
		const failed = await options.sendRequest({ query: 'Review changes' });
		setSendFailure(undefined);
		const retried = await options.sendRequest({ query: 'Review changes' });
		assert.deepStrictEqual({
			failed, retried, drafts: drafts.length, sessions: requests.map(request => request.session === drafts[0].session), staleError: composer.getAccessibleContent().includes('Provider disconnected'),
			initiated: telemetry.events.filter(event => event.name === 'automation.newInitiated').length,
			outcomes: telemetry.events.filter(event => event.name === 'automation.dialogOutcome').map(event => event.data.outcome),
		}, {
			failed: false, retried: true, drafts: 1, sessions: [true, true], staleError: false,
			initiated: 1, outcomes: ['sessionStartFailed', 'sessionStarted'],
		});
	});

	test('holds its draft apart from the New Session draft and discards only its own', () => {
		const { composer, drafts, discarded, defaultSlotCalls } = setup();
		const draft = drafts.at(-1)!.session;
		composer.dispose();
		assert.deepStrictEqual({ defaultSlotCalls, discarded: discarded.map(session => session === draft) }, { defaultSlotCalls: [], discarded: [true] });
	});

	test('applies a Dev Container workspace choice to the draft for that folder only', () => {
		const { providers, drafts, preferredDevContainers, selectFolder, selectHarness } = setup();
		providers.set([{ id: LOCAL_AGENT_HOST_PROVIDER_ID, label: 'Local' }], undefined);
		selectHarness({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' });
		selectFolder(folder, true);
		const containerDraft = drafts.at(-1)!.session.sessionId;
		selectFolder(URI.file('/other'));
		assert.deepStrictEqual({ preferredDevContainers, drafts: drafts.map(draft => draft.folder?.path) }, {
			preferredDevContainers: [containerDraft], drafts: [undefined, undefined, '/workspace', '/other'],
		});
	});

	test('moves inline reference ranges into the sent query and drops ranges in the removed /automate', async () => {
		const { options, requests } = setup();
		const reference = (id: string, start: number, endExclusive: number) => upcastPartial<IChatRequestVariableEntry>({ kind: 'file', id, name: id, value: URI.file(`/${id}`), range: { start, endExclusive } });
		await options.sendRequest({ query: '/automate Review #file:a.ts', attachments: [reference('command', 0, 9), reference('a.ts', 17, 27)] });
		const sent = requests[0].options;
		assert.deepStrictEqual(sent.attachedContext!.slice(0, 2).map(entry => entry.range && sent.query.slice(entry.range.start, entry.range.endExclusive)), [undefined, '#file:a.ts']);
	});

	test('a workspace restored during skill lookup retargets the draft before a retry', async () => {
		const { options, prompts, requests, drafts, selectFolder } = setup();
		const pending = new DeferredPromise<Awaited<ReturnType<IPromptsService['findAgentSkills']>>>();
		prompts.findAgentSkills = () => pending.p;
		const sending = options.sendRequest({ query: 'Review changes' });
		selectFolder(folder);
		await pending.complete([]);
		const stale = await sending;
		const sent = await options.sendRequest({ query: 'Review changes' });
		assert.deepStrictEqual({ stale, sent, targets: drafts.map(draft => draft.folder), requests: requests.map(request => request.session === drafts[1].session) }, {
			stale: false, sent: true, targets: [undefined, folder], requests: [true],
		});
	});

	test('opens the confirmed replacement session after Send rather than leaving the composer active', async () => {
		const { options, drafts, opened, replaceStartedSession } = setup();
		const replacement = createTestActiveSession('confirmed');
		replaceStartedSession(replacement);
		const sent = await options.sendRequest({ query: 'Review changes' });
		assert.deepStrictEqual({ sent, opened, anotherSend: await options.sendRequest({ query: 'Review changes' }), drafts: drafts.length }, {
			sent: true, opened: [replacement.resource], anotherSend: false, drafts: 1,
		});
	});

	test('failure to open a started session does not restore a duplicate send or report dispatch failure', async () => {
		const { options, notifications, telemetry, setOpenFailure } = setup();
		setOpenFailure(new Error('View unavailable'));
		const sent = await options.sendRequest({ query: 'Review changes' });
		assert.deepStrictEqual({
			sent, anotherSend: await options.sendRequest({ query: 'Review changes' }), notifications,
			outcomes: telemetry.events.filter(event => event.name === 'automation.dialogOutcome').map(event => event.data),
		}, {
			sent: true, anotherSend: false,
			notifications: ['The session started, but could not be opened. Open it from Chats instead of sending again.'],
			outcomes: [{ operation: 'create', outcome: 'sessionStarted' }],
		});
	});

	test('recreates a discarded backing draft without losing the idea or selected workspace', () => {
		const { options, drafts, currentDraft, input, selectFolder } = setup();
		selectFolder(folder);
		input.value = 'An unsent automation idea';
		currentDraft.set(undefined, undefined);
		assert.deepStrictEqual({
			drafts: drafts.map(draft => draft.folder),
			boundToCurrent: options.session.get() === currentDraft.get(),
			idea: input.value,
			ready: options.canSendRequest.get(),
		}, { drafts: [undefined, folder, folder], boundToCurrent: true, idea: 'An unsent automation idea', ready: true });
	});
});
