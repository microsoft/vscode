/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotification, INotificationHandle, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IIssueWizardBootstrapRequest, IIssueWizardLauncherService, IIssueWizardLaunchOptions, IIssueWizardLaunchTarget } from '../../../../../workbench/contrib/issue/browser/issueWizard.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { Menus } from '../../../../browser/menus.js';
import { IActiveSession, ICreateNewSessionOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatModelSource, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IOpenNewSessionOptions, ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISSUE_WIZARD_AGENTS_COMMAND_ID } from '../../browser/issueWizard.contribution.js';
import '../../../accountMenu/browser/account.contribution.js';

suite('Sessions Issue Wizard Contribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceFolder = URI.file('/workspace');
	const skillAttachment: IChatRequestVariableEntry = {
		kind: 'generic',
		id: 'issue-wizard-skill',
		name: 'issue-wizard',
		value: 'skill',
	};
	const initialSessionConfig = {
		permissions: {
			allow: [],
			deny: ['ask_user', 'AskUserQuestion', 'request_user_input'],
		},
	};

	test('contributes an accessible bug action immediately before the account action', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarRightLayout).filter(isIMenuItem);
		const wizard = items.find(item => item.command.id === ISSUE_WIZARD_AGENTS_COMMAND_ID);
		const account = items.find(item => item.command.id === 'sessions.action.titleBarAccountWidget');
		const context = (aiEnabled: boolean): IContext => ({
			getValue: <T>(key: string) => (key === ChatContextKeys.enabled.key ? aiEnabled : false) as T,
		});

		assert.deepStrictEqual({
			commandRegistered: !!CommandsRegistry.getCommand(ISSUE_WIZARD_AGENTS_COMMAND_ID),
			enabledWithAI: wizard?.command.precondition?.evaluate(context(true)),
			enabledWithoutAI: wizard?.command.precondition?.evaluate(context(false)),
			visibleWithAI: wizard?.when?.evaluate(context(true)),
			visibleWithoutAI: wizard?.when?.evaluate(context(false)),
			group: wizard?.group,
			order: wizard?.order,
			icon: ThemeIcon.isThemeIcon(wizard?.command.icon) ? wizard.command.icon.id : undefined,
			title: wizard && (typeof wizard.command.title === 'string' ? wizard.command.title : wizard.command.title.value),
			tooltip: wizard?.command.tooltip,
			immediatelyBeforeAccount: wizard?.group === account?.group && Number(wizard?.order) + 1 === Number(account?.order),
		}, {
			commandRegistered: true,
			enabledWithAI: true,
			enabledWithoutAI: false,
			visibleWithAI: true,
			visibleWithoutAI: false,
			group: 'navigation',
			order: 99,
			icon: Codicon.bug.id,
			title: 'Issue Wizard',
			tooltip: 'Start Issue Wizard to troubleshoot a VS Code problem',
			immediatelyBeforeAccount: true,
		});
	});

	test('creates, focuses, and bootstraps a workspace session', async () => {
		const sourceSession = createSession('source', workspaceFolder);
		const wizardSession = createSession('wizard', workspaceFolder);
		const harness = createHarness(sourceSession, wizardSession);

		await harness.run({ symptom: 'Saving stalls' });

		assert.deepStrictEqual({
			calls: harness.calls,
			modelSelections: harness.modelSelections,
			screenshotTargets: harness.screenshotTargets,
			initialSessionConfigs: harness.initialSessionConfigs,
		}, {
			calls: [
				{ launch: { symptom: 'Saving stalls' } },
				{
					openWorkspace: {
						folderUri: workspaceFolder.toString(),
						providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
						sessionTypeId: 'codex',
						cancelRestore: true,
					},
				},
				{
					send: {
						session: wizardSession.resource.toString(),
						query: '/issue-wizard Help me troubleshoot a VS Code issue.\nSymptom: Saving stalls',
						attachedContext: [skillAttachment],
						title: 'Issue Wizard',
					},
				},
			],
			modelSelections: [{
				sessionId: wizardSession.sessionId,
				chat: wizardSession.mainChat.get().resource.toString(),
				modelId: 'agent-host-codex:gpt-6-astra',
				source: ChatModelSource.Chosen,
			}],
			screenshotTargets: [{ sessionResource: wizardSession.activeChat.get().resource.toString(), exactWidget: true }],
			initialSessionConfigs: [initialSessionConfig],
		});
	});

	test('uses a focused quick chat when the active session has no workspace', async () => {
		const sourceSession = createSession('source');
		const wizardSession = createSession('wizard');
		const harness = createHarness(sourceSession, wizardSession);

		await harness.run();

		assert.deepStrictEqual({
			calls: harness.calls,
			modelSelections: harness.modelSelections,
			screenshotTargets: harness.screenshotTargets,
		}, {
			calls: [
				{ launch: undefined },
				{ openQuickChat: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'codex' } },
				{
					send: {
						session: wizardSession.resource.toString(),
						query: '/issue-wizard Help me troubleshoot a VS Code issue.',
						attachedContext: [skillAttachment],
						title: 'Issue Wizard',
					},
				},
			],
			modelSelections: [{
				sessionId: wizardSession.sessionId,
				chat: wizardSession.mainChat.get().resource.toString(),
				modelId: 'agent-host-codex:gpt-6-astra',
				source: ChatModelSource.Chosen,
			}],
			screenshotTargets: [{ sessionResource: wizardSession.activeChat.get().resource.toString(), exactWidget: true }],
		});
	});

	test('returns to the exact Issue Wizard chat after saving a screenshot', async () => {
		const sourceSession = createSession('source', workspaceFolder);
		const wizardSession = createSession('wizard', workspaceFolder);
		const unrelatedSession = createSession('unrelated', workspaceFolder);
		const harness = createHarness(sourceSession, wizardSession);

		await harness.run();
		harness.setSourceSession(unrelatedSession);
		const exactWidget = await harness.revealScreenshotTarget();

		assert.deepStrictEqual({
			exactWidget,
			lastCall: harness.calls.at(-1),
		}, {
			exactWidget: true,
			lastCall: {
				openChat: {
					session: wizardSession.resource.toString(),
					chat: wizardSession.activeChat.get().resource.toString(),
				},
			},
		});
	});

	test('leaves launch failure recoverable when quick chat creation is unavailable', async () => {
		const harness = createHarness(createSession('source'), undefined);

		await harness.run();

		assert.deepStrictEqual(harness.calls, [
			{ launch: undefined },
			{ openQuickChat: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'codex' } },
			{ sessionUnavailable: true },
		]);
	});

	test('retries an exact bootstrap request in a fresh workspace session, even after switching active folders', async () => {
		const sourceSession = createSession('source', workspaceFolder);
		const switchedSourceSession = createSession('source-switched', URI.file('/workspace-switched'));
		const firstWizardSession = createSession('wizard-1', workspaceFolder);
		const retryWizardSession = createSession('wizard-2', workspaceFolder);
		const harness = createHarness(sourceSession, [firstWizardSession, retryWizardSession], [new Error('send failed')]);

		await harness.run({ symptom: 'Saving stalls' });
		harness.setSourceSession(switchedSourceSession);
		await harness.retry();

		assert.deepStrictEqual({
			calls: harness.calls,
			sameAttachment: harness.sentRequests[0].attachedContext?.[0] === harness.sentRequests[1].attachedContext?.[0],
		}, {
			calls: [
				{ launch: { symptom: 'Saving stalls' } },
				{
					openWorkspace: {
						folderUri: workspaceFolder.toString(),
						providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
						sessionTypeId: 'codex',
						cancelRestore: true,
					},
				},
				{
					send: {
						session: firstWizardSession.resource.toString(),
						query: '/issue-wizard Help me troubleshoot a VS Code issue.\nSymptom: Saving stalls',
						attachedContext: [skillAttachment],
						title: 'Issue Wizard',
					},
				},
				{ retryOffered: { message: 'Issue Wizard could not send its first request. Retry when ready.', label: 'Retry', sticky: true } },
				{
					openWorkspace: {
						folderUri: workspaceFolder.toString(),
						providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
						sessionTypeId: 'codex',
						cancelRestore: true,
					},
				},
				{
					send: {
						session: retryWizardSession.resource.toString(),
						query: '/issue-wizard Help me troubleshoot a VS Code issue.\nSymptom: Saving stalls',
						attachedContext: [skillAttachment],
						title: 'Issue Wizard',
					},
				},
			],
			sameAttachment: true,
		});
	});

	test('does not bootstrap a same-workspace pre-existing draft when fresh workspace session creation falls back', async () => {
		const sourceSession = createSession('source', workspaceFolder);
		const harness = createHarness(sourceSession, createSession('unrelated-draft', workspaceFolder), [], { workspaceCreationFallsBack: true });

		await harness.run({ symptom: 'Saving stalls' });

		assert.deepStrictEqual(harness.calls, [
			{ launch: { symptom: 'Saving stalls' } },
			{
				openWorkspace: {
					folderUri: workspaceFolder.toString(),
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					sessionTypeId: 'codex',
					cancelRestore: true,
				},
			},
			{ sessionUnavailable: true },
		]);
	});

	test('keeps failed investigations independently retryable and replaces only the matching notification on repeated failure', async () => {
		const sourceSession = createSession('source');
		const harness = createHarness(sourceSession, [createSession('wizard-1'), createSession('wizard-2'), createSession('wizard-3'), createSession('wizard-4')], [new Error('first failed'), new Error('second failed'), new Error('retry failed')]);

		await harness.run();
		const firstNotificationId = harness.retryNotificationIds()[0];
		assert.ok(firstNotificationId);

		await harness.run();
		const idsAfterSecondFailure = harness.retryNotificationIds();
		assert.strictEqual(idsAfterSecondFailure.length, 2);
		assert.ok(idsAfterSecondFailure.every((id): id is string => typeof id === 'string'));
		const secondNotificationId = idsAfterSecondFailure.find(id => id !== firstNotificationId);
		assert.ok(secondNotificationId);

		await harness.retry(firstNotificationId);
		const idsAfterRetryFailure = harness.retryNotificationIds();
		assert.strictEqual(idsAfterRetryFailure.length, 2);
		assert.ok(idsAfterRetryFailure.includes(firstNotificationId));
		assert.ok(idsAfterRetryFailure.includes(secondNotificationId));

		await harness.retry(secondNotificationId);
		assert.deepStrictEqual(harness.retryNotificationIds(), [firstNotificationId]);

		assert.deepStrictEqual(harness.calls.filter(call => Object.prototype.hasOwnProperty.call(call, 'retryOffered') || Object.prototype.hasOwnProperty.call(call, 'openQuickChat')), [
			{ openQuickChat: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'codex' } },
			{ retryOffered: { message: 'Issue Wizard could not send its first request. Retry when ready.', label: 'Retry', sticky: true } },
			{ openQuickChat: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'codex' } },
			{ retryOffered: { message: 'Issue Wizard could not send its first request. Retry when ready.', label: 'Retry', sticky: true } },
			{ openQuickChat: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'codex' } },
			{ retryOffered: { message: 'Issue Wizard could not send its first request. Retry when ready.', label: 'Retry', sticky: true } },
			{ openQuickChat: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'codex' } },
		]);
	});

	function createHarness(sourceSession: IActiveSession, wizardSessions: IActiveSession | readonly (IActiveSession | undefined)[] | undefined, sendErrors: readonly Error[] = [], options?: { readonly workspaceCreationFallsBack?: boolean }) {
		const calls: object[] = [];
		const modelSelections: { sessionId: string; chat: string; modelId: string; source: ChatModelSource }[] = [];
		const sentRequests: { query: string; attachedContext?: IChatRequestVariableEntry[]; title?: string }[] = [];
		const retryNotifications: { id: string | undefined; message: string; label: string | undefined; sticky: boolean | undefined }[] = [];
		const retryActions = new Map<string, () => Promise<void>>();
		const initialSessionConfigs: (Readonly<Record<string, unknown>> | undefined)[] = [];
		let latestRetryId: string | undefined;
		let sessionIndex = 0;
		let sendErrorIndex = 0;
		const sourceSessionObservable = observableValue<IActiveSession | undefined>('issueWizard.sourceSession', sourceSession);
		const chatWidgets = new Map<string, IChatWidget>();
		const screenshotTargets: { sessionResource: string; exactWidget: boolean }[] = [];
		let revealScreenshotTarget: (() => Promise<boolean>) | undefined;
		const nextSession = () => Array.isArray(wizardSessions) ? wizardSessions[sessionIndex++] : wizardSessions;
		const activateSession = (session: IActiveSession): void => {
			sourceSessionObservable.set(session, undefined);
			const sessionResource = session.activeChat.get().resource;
			chatWidgets.set(sessionResource.toString(), upcastPartial<IChatWidget>({}));
		};
		const instantiationService = disposables.add(new TestInstantiationService());
		const provider = upcastPartial<ISessionsProvider>({
			setModel: (sessionId, chatResource, modelId, source) => modelSelections.push({ sessionId, chat: chatResource.toString(), modelId, source }),
		});
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>(providerId: string) => providerId === LOCAL_AGENT_HOST_PROVIDER_ID ? provider as T : undefined,
		}));
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = sourceSessionObservable;

			override async openNewSession(openOptions?: IOpenNewSessionOptions) {
				const { onSessionCreated, initialSessionConfig: config, ...recordedOptions } = openOptions ?? {};
				initialSessionConfigs.push(config);
				calls.push({
					openWorkspace: openOptions && {
						...recordedOptions,
						folderUri: openOptions.folderUri?.toString(),
					},
				});
				const session = nextSession();
				if (session && !options?.workspaceCreationFallsBack) {
					onSessionCreated?.(session);
					activateSession(session);
				}
				return { session, trustDeclined: false };
			}

			override openQuickChat(options: ICreateNewSessionOptions = {}): IActiveSession | undefined {
				const { initialSessionConfig: config, ...recordedOptions } = options;
				initialSessionConfigs.push(config);
				calls.push({ openQuickChat: recordedOptions });
				const session = nextSession();
				if (session) {
					activateSession(session);
				}
				return session;
			}

			override async openChat(session: ISession, chatUri: URI): Promise<void> {
				calls.push({ openChat: { session: session.resource.toString(), chat: chatUri.toString() } });
				sourceSessionObservable.set(session as IActiveSession, undefined);
			}
		}());
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: sessionResource => chatWidgets.get(sessionResource.toString()),
		}));
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override async sendNewChatRequest(session: ISession, request: { query: string; attachedContext?: IChatRequestVariableEntry[]; title?: string }): Promise<void> {
				sentRequests.push(request);
				calls.push({
					send: {
						session: session.resource.toString(),
						query: request.query,
						attachedContext: request.attachedContext,
						title: request.title,
					},
				});
				if (sendErrorIndex < sendErrors.length) {
					const error = sendErrors[sendErrorIndex++];
					throw error;
				}
			}
		}());
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override notify(notification: INotification): INotificationHandle {
				const retryNotification = {
					id: notification.id,
					message: String(notification.message),
					label: notification.actions?.primary?.[0]?.label,
					sticky: notification.sticky,
				};
				const duplicateIndex = retryNotifications.findIndex(existing =>
					typeof existing.id === 'string' || typeof retryNotification.id === 'string'
						? existing.id === retryNotification.id
						: existing.message === retryNotification.message && existing.label === retryNotification.label
				);
				if (duplicateIndex >= 0) {
					retryNotifications.splice(duplicateIndex, 1);
				}
				retryNotifications.unshift(retryNotification);

				let isClosed = false;
				const close = () => {
					if (isClosed) {
						return;
					}
					isClosed = true;
					const index = retryNotifications.indexOf(retryNotification);
					if (index >= 0) {
						retryNotifications.splice(index, 1);
					}
				};

				calls.push({
					retryOffered: {
						message: retryNotification.message,
						label: retryNotification.label,
						sticky: retryNotification.sticky,
					},
				});
				if (typeof notification.id === 'string' && notification.actions?.primary?.[0]) {
					latestRetryId = notification.id;
					retryActions.set(notification.id, async () => {
						close();
						await notification.actions?.primary?.[0].run();
					});
				}
				return upcastPartial<INotificationHandle>({ close });
			}
		}());
		instantiationService.stub(IIssueWizardLauncherService, new class extends mock<IIssueWizardLauncherService>() {
			override readonly captureBarActive = false;

			override async launchInTarget(target: IIssueWizardLaunchTarget, options?: IIssueWizardLaunchOptions): Promise<void> {
				calls.push({ launch: options });
				const session = await target.createSession({
					sessionType: 'agent-host-codex',
					displayName: 'Issue Wizard',
					modelId: 'agent-host-codex:gpt-6-astra',
					initialSessionConfig,
				});
				if (!session) {
					calls.push({ sessionUnavailable: true });
					return;
				}
				const request: IIssueWizardBootstrapRequest = {
					query: `/issue-wizard Help me troubleshoot a VS Code issue.${options?.symptom ? `\nSymptom: ${options.symptom}` : ''}`,
					attachedContext: [skillAttachment],
				};
				await session.send(request);
				const screenshotTarget = session.getScreenshotTarget();
				if (screenshotTarget) {
					screenshotTargets.push({
						sessionResource: screenshotTarget.sessionResource.toString(),
						exactWidget: screenshotTarget.widget === chatWidgets.get(screenshotTarget.sessionResource.toString()),
					});
					revealScreenshotTarget = async () =>
						await session.revealScreenshotTarget(screenshotTarget) === chatWidgets.get(screenshotTarget.sessionResource.toString());
				}
			}
		}());

		return {
			calls,
			initialSessionConfigs,
			modelSelections,
			screenshotTargets,
			sentRequests,
			setSourceSession: (session: IActiveSession) => {
				sourceSessionObservable.set(session, undefined);
			},
			revealScreenshotTarget: async () => {
				assert.ok(revealScreenshotTarget);
				return revealScreenshotTarget();
			},
			retryNotificationIds: () => retryNotifications.map(notification => notification.id),
			retry: async (notificationId?: string) => {
				const id = notificationId ?? latestRetryId;
				assert.ok(id);
				const action = retryActions.get(id);
				assert.ok(action);
				await action();
			},
			run: async (options?: IIssueWizardLaunchOptions) => {
				const command = CommandsRegistry.getCommand(ISSUE_WIZARD_AGENTS_COMMAND_ID);
				assert.ok(command);
				await instantiationService.invokeFunction(command.handler, options);
			},
		};
	}
});

function createSession(id: string, folder?: URI): IActiveSession {
	const activeChat = upcastPartial<IChat>({ resource: URI.parse(`agent-host-codex:/${id}/chat`) });
	return upcastPartial<IActiveSession>({
		providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
		sessionId: id,
		resource: URI.parse(`agent-host-codex:/${id}`),
		activeChat: constObservable(activeChat),
		mainChat: constObservable(activeChat),
		workspace: constObservable(folder ? {
			uri: folder,
			label: 'workspace',
			icon: Codicon.folder,
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
			folders: [{ root: folder, workingDirectory: folder, name: 'workspace', description: undefined }],
		} : undefined),
	});
}
