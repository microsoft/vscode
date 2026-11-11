/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestDataTelemetryService } from '../../../../../platform/telemetry/test/common/testTelemetryService.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatViewFactory } from '../../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { INewChatComposerInputOptions } from '../../../../../workbench/contrib/sessions/browser/chat/newChatComposerInput.js';
import { SharedChatInputComposer } from '../../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { WorkspacePicker } from '../../../../../workbench/contrib/sessions/browser/chat/sessionWorkspacePicker.js';
import { IPreferredSessionType } from '../../../../../workbench/contrib/sessions/browser/chat/sessionTypePicker.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
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
		let sendFailure: Error | undefined;
		const createDraft = (folder: URI | undefined) => {
			const session = Object.assign(createTestActiveSession(`draft-${drafts.length}`, false), { providerId: 'host', sessionType: 'copilotcli' });
			drafts.push({ folder, session });
			return session;
		};
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessionTypes: Event.None,
			createQuickChat: () => createDraft(undefined),
			createNewSession: folder => createDraft(folder),
			discardNewSession: session => { if (session) { discarded.push(session); } },
			isQuickChatTargetAvailable: () => true,
			isNewSessionTargetAvailable: () => true,
			sendNewChatRequest: async (session, options) => {
				requests.push({ session, options });
				if (sendFailure) {
					throw sendFailure;
				}
			},
		}));
		const commands: string[] = [];
		instantiationService.stub(ICommandService, { executeCommand: async command => { commands.push(command); } });
		const workspaceChanged = store.add(new Emitter<void>());
		let selectedFolder: URI | undefined;
		instantiationService.stubInstance(WorkspacePicker, {
			onDidChangeSelection: workspaceChanged.event,
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
		const creations = spy(instantiationService, 'createInstance');
		store.add(toDisposable(() => creations.restore()));
		const root = DOM.$('div');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const composer = store.add(instantiationService.createInstance(AutomationComposer, root));
		const options = creations.getCalls().find(call => call.args[0] === SharedChatInputComposer)!.args[1] as INewChatComposerInputOptions;
		root.appendChild(composer.element);
		return {
			composer, root, input, providers, prompts, disabledSkills, drafts, requests, discarded, telemetry, commands, configuration, options,
			selectFolder: (folder: URI | undefined) => { selectedFolder = folder; workspaceChanged.fire(); },
			selectHarness: (value: IPreferredSessionType) => { pick = value; pickChanged.fire(value); },
			setSendFailure: (error: Error | undefined) => { sendFailure = error; },
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

	test('manual creation and import do not send or change the authoring draft', async () => {
		const { composer, options, drafts, requests, commands, input } = setup();
		const buttons = Array.from(composer.element.querySelectorAll<HTMLElement>('.automation-authoring-actions .monaco-button'));
		for (const button of buttons) {
			button.click();
		}
		await Promise.resolve();
		assert.deepStrictEqual({
			labels: buttons.map(button => button.textContent), commands, requests,
			drafts: drafts.length, input: input.value, persistDraft: options.persistDraft, metrics: options.inputEditorOptions,
		}, {
			labels: ['Create manually', 'Import'], commands: ['sessionsView.newAutomation', 'sessions.automations.import'], requests: [],
			drafts: 1, input: 'Review changes', persistDraft: false, metrics: { fontSize: 16, lineHeight: 24 },
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

	test('send failure keeps configuration and allows retry without creating another draft', async () => {
		const { composer, options, drafts, requests, setSendFailure } = setup();
		setSendFailure(new Error('Provider disconnected'));
		const failed = await options.sendRequest({ query: 'Review changes' });
		setSendFailure(undefined);
		const retried = await options.sendRequest({ query: 'Review changes' });
		assert.deepStrictEqual({ failed, retried, drafts: drafts.length, sessions: requests.map(request => request.session === drafts[0].session), staleError: composer.getAccessibleContent().includes('Provider disconnected') }, {
			failed: false, retried: true, drafts: 1, sessions: [true, true], staleError: false,
		});
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
});
