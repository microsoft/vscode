/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpression, ContextKeyValue, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { EditorCloseContext, IEditorCloseEvent } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IAgentHostActiveClientService } from '../../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatAttachmentResolveService } from '../../../chat/browser/attachments/chatAttachmentResolveService.js';
import { ChatAttachmentModel } from '../../../chat/browser/attachments/chatAttachmentModel.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { IChatInputCompletionsParams, IChatInputCompletionsResult, IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../../chat/common/chatSessionsService.js';
import { IChatViewModel } from '../../../chat/common/model/chatViewModel.js';
import { PromptsType } from '../../../chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../../chat/common/promptSyntax/service/promptsService.js';
import { IIssueWizardIntakeService, IIssueWizardScreenshotAnnotationService, IssueWizardIntakeService } from '../../browser/issueWizardIntakeService.js';
import { IIssueWizardLaunchOptions, IIssueWizardLauncherService, ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID, ISSUE_WIZARD_COMMAND_ID, IssueWizardLauncherService, IssueWizardStatusbarContribution } from '../../browser/issueWizard.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IScreenshotService } from '../../browser/screenshotService.js';
import { IScreenshot } from '../../browser/issueReporterOverlay.js';

suite('Issue Wizard Launch Command', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let notifications: { warn: string[]; error: string[] };
	let intakeResult: readonly IChatRequestVariableEntry[] | undefined;
	let screenshotCollectionCount: number;
	let acceptedRequests: { query: string; attachmentIds: string[] }[];
	let attachedContext: IChatRequestVariableEntry[];
	let activeAttachments: IChatRequestVariableEntry[];
	let attachedSessionResources: URI[];
	let openedSessionResources: URI[];
	let openedWidgets: IChatWidget[];
	let focusedSessionResources: URI[];
	let openedSessionOptions: { sessionType: string; displayName: string; workspaceFolder: URI }[];
	let completionRequests: { sessionResource: URI; params: IChatInputCompletionsParams }[];
	let parsedSkillUris: URI[];
	let lastFocusedWidget: IChatWidget | undefined;
	let onDidCloseEditor: Emitter<IEditorCloseEvent>;
	let onDidRemoveWidget: Emitter<IChatWidget>;
	let chatSentiment: IChatSentiment;
	let onDidChangeChatSentiment: Emitter<void>;

	const workspaceFolderUri = URI.file('/workspace');
	const defaultSkillUri = URI.file('/application/vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md');
	const defaultSkillUriString = defaultSkillUri.toString();
	const defaultSyncedSkillUri = URI.parse('vscode-synced-customization:/agent-host-codex/skills/issue-wizard/SKILL.md');
	const defaultMaterializedSkillUri = URI.file('/user-data/agentPlugins/vscode-synced-customization-agent-host-codex/123/skills/issue-wizard/SKILL.md');
	const defaultSkillDescription = 'Establish a shared understanding of a VS Code bug before troubleshooting.';
	const agentHostSessionType = 'agent-host-codex';

	function createWorkspaceFolder(uri: URI, name: string, index: number): IWorkspaceFolder {
		return { uri, name, index, toResource: relativePath => URI.joinPath(uri, relativePath) };
	}

	function createWorkspace(folders: IWorkspaceFolder[]): IWorkspace {
		return { id: 'issue-wizard-tests', folders, transient: false, configuration: null };
	}

	function setupServices(options?: {
		enabled?: boolean;
		folders?: IWorkspaceFolder[];
		activeResource?: URI;
		agentHostSessionTypes?: string[];
		builtinSkillUri?: URI | undefined;
		completionSkillUri?: URI;
		completionSkillSyncedUri?: URI;
		provideSkillCompletion?: boolean;
		skillCompletionUnavailableAttempts?: number;
		openSessionReturns?: boolean;
		aiHidden?: boolean;
		collectScreenshot?: () => Promise<readonly IChatRequestVariableEntry[] | undefined>;
	}): void {
		notifications = { warn: [], error: [] };
		intakeResult = undefined;
		screenshotCollectionCount = 0;
		acceptedRequests = [];
		attachedContext = [];
		activeAttachments = [];
		attachedSessionResources = [];
		openedSessionResources = [];
		openedWidgets = [];
		focusedSessionResources = [];
		openedSessionOptions = [];
		completionRequests = [];
		parsedSkillUris = [];
		lastFocusedWidget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource: URI.parse('agent-host-codex:/unrelated') }) });
		onDidCloseEditor = disposables.add(new Emitter<IEditorCloseEvent>());
		onDidRemoveWidget = disposables.add(new Emitter<IChatWidget>());
		onDidChangeChatSentiment = disposables.add(new Emitter<void>());
		chatSentiment = { completed: true, hidden: options?.aiHidden ?? false };

		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = onDidChangeChatSentiment.event;
			override get sentiment(): IChatSentiment { return chatSentiment; }
		});
		instantiationService.stub(IAgentHostEnablementService, {
			_serviceBrand: undefined,
			enabled: constObservable(options?.enabled ?? true),
			managedSandboxEnforced: constObservable(false),
			managedSandboxAllowsBypass: constObservable(false),
		});
		instantiationService.stub(IAgentHostActiveClientService, upcastPartial<IAgentHostActiveClientService>({
			getOrigin: syncedUri => extUriBiasedIgnorePathCase.isEqual(syncedUri, defaultSyncedSkillUri)
				? { uri: defaultSkillUri, source: 'builtin' }
				: undefined,
		}));

		const folders = options?.folders ?? [createWorkspaceFolder(workspaceFolderUri, 'workspace', 0)];
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace { return createWorkspace(folders); }
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return folders.find(folder => extUriBiasedIgnorePathCase.isEqualOrParent(resource, folder.uri)) ?? null;
			}
		});

		const activeEditor = options?.activeResource ? disposables.add(new TestFileEditorInput(options.activeResource, 'issueWizardTestInput')) : undefined;
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override readonly activeEditor = activeEditor;
			override readonly onDidCloseEditor = onDidCloseEditor.event;
		});

		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override warn(message: string): void { notifications.warn.push(message); }
			override error(message: string): void { notifications.error.push(message); }
		});

		instantiationService.stub(IIssueWizardIntakeService, new class extends mock<IIssueWizardIntakeService>() {
			override async collectScreenshot(): Promise<readonly IChatRequestVariableEntry[] | undefined> {
				screenshotCollectionCount++;
				return options?.collectScreenshot ? options.collectScreenshot() : intakeResult;
			}
		});

		const hasBuiltinSkillUri = options !== undefined && Object.prototype.hasOwnProperty.call(options, 'builtinSkillUri');
		instantiationService.stub(IPromptsService, {
			...mock<IPromptsService>(),
			listPromptFilesForStorage: async (type, storage) => {
				assert.strictEqual(type, PromptsType.skill);
				assert.strictEqual(storage, PromptsStorage.builtIn);
				const skillUri = hasBuiltinSkillUri ? options?.builtinSkillUri : defaultSkillUri;
				return skillUri ? [{ uri: skillUri, storage: PromptsStorage.builtIn, type: PromptsType.skill, name: 'issue-wizard', description: defaultSkillDescription }] : [];
			},
			parseNew: async uri => {
				parsedSkillUris.push(uri);
				return { uri };
			},
		});

		const contributions = (options?.agentHostSessionTypes ?? [agentHostSessionType]).map(type => upcastPartial<ResolvedChatSessionsExtensionPoint>({
			type,
			agentHostProviderId: type.substring('agent-host-'.length),
		}));
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
			override readonly onDidChangeItemsProviders = Event.None;
			override readonly onDidChangeSessionItems = Event.None;
			override readonly onDidCommitSession = Event.None;
			override readonly onDidChangeAvailability = Event.None;
			override readonly onDidChangeInProgress = Event.None;
			override readonly onDidChangeContentProviderSchemes = Event.None;
			override getAllChatSessionContributions(): ResolvedChatSessionsExtensionPoint[] { return contributions; }
			override async provideChatInputCompletions(sessionResource: URI, params: IChatInputCompletionsParams): Promise<IChatInputCompletionsResult | undefined> {
				completionRequests.push({ sessionResource, params });
				if (options?.provideSkillCompletion === false || completionRequests.length <= (options?.skillCompletionUnavailableAttempts ?? 0)) {
					return { items: [] };
				}
				const completionSkillUri = options?.completionSkillUri ?? defaultSkillUri;
				return {
					items: [{
						insertText: '/issue-wizard ',
						attachment: {
							kind: 'skill',
							uri: completionSkillUri,
							...(options?.completionSkillSyncedUri ? { syncedUri: options.completionSkillSyncedUri } : {}),
							displayName: 'issue-wizard',
							description: defaultSkillDescription,
							_meta: {
								uri: completionSkillUri.toString(),
								...(options?.completionSkillSyncedUri ? { syncedUri: options.completionSkillSyncedUri.toString() } : {}),
								name: 'issue-wizard',
								displayName: 'issue-wizard',
								description: defaultSkillDescription,
							},
						},
					}],
				};
			}
		});

		const shouldReturnWidget = options?.openSessionReturns ?? true;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return lastFocusedWidget; },
			onDidRemoveWidget: onDidRemoveWidget.event,
			reveal: async () => true,
			openNewAgentHostEditorSession: async sessionOptions => {
				openedSessionOptions.push(sessionOptions);
				const sessionResource = URI.parse(`${sessionOptions.sessionType}:/untitled-${openedSessionResources.length + 1}`);
				openedSessionResources.push(sessionResource);
				if (!shouldReturnWidget) { return undefined; }
				const widget = upcastPartial<IChatWidget>({
					viewModel: upcastPartial<IChatViewModel>({ sessionResource }),
					onDidFocus: Event.None,
					attachmentModel: upcastPartial<ChatAttachmentModel>({
						get attachments() { return activeAttachments; },
						addContext: (...entries: IChatRequestVariableEntry[]) => {
							for (const entry of entries) {
								attachedContext.push(entry);
								attachedSessionResources.push(sessionResource);
								if (!activeAttachments.some(attachment => attachment.id === entry.id)) {
									activeAttachments.push(entry);
								}
							}
						},
						delete: (...ids: string[]) => {
							activeAttachments = activeAttachments.filter(attachment => !ids.includes(attachment.id));
						},
					}),
					acceptInput: async query => {
						if (query) {
							acceptedRequests.push({
								query,
								attachmentIds: activeAttachments.map(attachment => attachment.id),
							});
						}
					},
					focusInput: () => focusedSessionResources.push(sessionResource),
				});
				openedWidgets.push(widget);
				lastFocusedWidget = widget;
				return { sessionResource, widget };
			},
		}));
		instantiationService.stub(IIssueWizardLauncherService, disposables.add(instantiationService.createInstance(IssueWizardLauncherService)));
	}

	async function runCommand(options?: IIssueWizardLaunchOptions): Promise<void> {
		const command = CommandsRegistry.getCommand(ISSUE_WIZARD_COMMAND_ID);
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler, options);
	}

	async function runAddScreenshotCommand(): Promise<void> {
		const command = CommandsRegistry.getCommand(ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID);
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler);
	}

	test('creates and focuses a fresh Agent Host editor session with the bundled skill', async () => {
		setupServices();
		await runCommand();
		const firstSession = openedSessionResources[0];
		await runCommand();

		assert.deepStrictEqual({
			sessionTypes: openedSessionResources.map(resource => resource.scheme),
			freshSession: !extUriBiasedIgnorePathCase.isEqual(firstSession, openedSessionResources[1]),
			selectedFolders: openedSessionOptions.map(options => options.workspaceFolder.toString()),
			displayNames: openedSessionOptions.map(options => options.displayName),
			focusedSessions: focusedSessionResources.map(resource => resource.toString()),
			queries: acceptedRequests.map(request => request.query),
			attachmentKinds: attachedContext.map(context => context.kind),
			notifications,
		}, {
			sessionTypes: [agentHostSessionType, agentHostSessionType],
			freshSession: true,
			selectedFolders: [workspaceFolderUri.toString(), workspaceFolderUri.toString()],
			displayNames: ['Issue Wizard', 'Issue Wizard'],
			focusedSessions: openedSessionResources.map(resource => resource.toString()),
			queries: ['/issue-wizard Help me troubleshoot a VS Code issue.', '/issue-wizard Help me troubleshoot a VS Code issue.'],
			attachmentKinds: ['generic', 'generic'],
			notifications: { warn: [], error: [] },
		});
	});

	test('shows the existing floating screenshot bar without recording controls after launch', async () => {
		setupServices();
		await runCommand();

		const captureBar = document.querySelector<HTMLElement>('.issue-reporter-floating-bar');
		assert.deepStrictEqual({
			visible: !!captureBar && captureBar.style.display !== 'none',
			screenshotLabel: captureBar?.querySelector<HTMLElement>('.wizard-segmented-main')?.textContent,
			hasRecordingControl: !!captureBar?.querySelector('.wizard-record-btn'),
		}, {
			visible: true,
			screenshotLabel: 'Screenshot',
			hasRecordingControl: false,
		});
	});

	test('removes the capture bar when its exact Issue Wizard widget closes', async () => {
		setupServices();
		await runCommand();
		const captureBarVisibleBeforeClose = !!document.querySelector('.issue-reporter-floating-bar');

		onDidRemoveWidget.fire(openedWidgets[0]);
		await runAddScreenshotCommand();

		assert.deepStrictEqual({
			captureBarVisibleBeforeClose,
			captureBarVisible: !!document.querySelector('.issue-reporter-floating-bar'),
			screenshotCollectionCount,
			notifications,
		}, {
			captureBarVisibleBeforeClose: true,
			captureBarVisible: false,
			screenshotCollectionCount: 0,
			notifications: { warn: ['Open an Issue Wizard session before adding a highlighted screenshot.'], error: [] },
		});
	});

	test('removes the capture bar only when its exact Issue Wizard editor closes', async () => {
		setupServices();
		await runCommand();
		const unrelatedEditor = disposables.add(new TestFileEditorInput(URI.parse(`${agentHostSessionType}:/unrelated-session`), 'unrelatedChatInput'));
		onDidCloseEditor.fire({ editor: unrelatedEditor, groupId: 1, context: EditorCloseContext.UNKNOWN, index: 0, sticky: false });
		const captureBarVisibleAfterUnrelatedClose = !!document.querySelector('.issue-reporter-floating-bar');

		const issueWizardEditor = disposables.add(new TestFileEditorInput(openedSessionResources[0], 'issueWizardChatInput'));
		onDidCloseEditor.fire({ editor: issueWizardEditor, groupId: 1, context: EditorCloseContext.UNKNOWN, index: 0, sticky: false });
		await runAddScreenshotCommand();

		assert.deepStrictEqual({
			captureBarVisibleAfterUnrelatedClose,
			captureBarVisibleAfterIssueWizardClose: !!document.querySelector('.issue-reporter-floating-bar'),
			screenshotCollectionCount,
			notifications,
		}, {
			captureBarVisibleAfterUnrelatedClose: true,
			captureBarVisibleAfterIssueWizardClose: false,
			screenshotCollectionCount: 0,
			notifications: { warn: ['Open an Issue Wizard session before adding a highlighted screenshot.'], error: [] },
		});
	});

	test('removes the capture bar when AI features are disabled', async () => {
		setupServices();
		await runCommand();
		const visibleBeforeDisablement = !!document.querySelector('.issue-reporter-floating-bar');

		chatSentiment = { completed: true, hidden: true };
		onDidChangeChatSentiment.fire();
		assert.deepStrictEqual({ visibleBeforeDisablement, visibleAfterDisablement: !!document.querySelector('.issue-reporter-floating-bar') }, {
			visibleBeforeDisablement: true,
			visibleAfterDisablement: false,
		});
	});

	test('preserves a supplied symptom in the bootstrap message', async () => {
		setupServices();
		await runCommand({ symptom: 'Saving stalls for 10 seconds' });
		assert.deepStrictEqual({ screenshotCollectionCount, query: acceptedRequests[0].query }, {
			screenshotCollectionCount: 0,
			query: '/issue-wizard Help me troubleshoot a VS Code issue.\nSymptom: Saving stalls for 10 seconds',
		});
	});

	test('invokes the discovered built-in exactly once as a ranged Agent Host skill reference', async () => {
		setupServices();
		await runCommand();

		assert.deepStrictEqual({
			completionRequests: completionRequests.map(request => ({ sessionResource: request.sessionResource.toString(), params: request.params })),
			parsedSkillUris: parsedSkillUris.map(uri => uri.toString()),
			bootstrapAttachmentIds: acceptedRequests[0].attachmentIds,
			skillReference: attachedContext[0],
			remainingAttachmentIds: activeAttachments.map(attachment => attachment.id),
		}, {
			completionRequests: [{ sessionResource: openedSessionResources[0].toString(), params: { text: '/issue-wizard', offset: 13 } }],
			parsedSkillUris: [],
			bootstrapAttachmentIds: [defaultSkillUriString],
			skillReference: {
				kind: 'generic',
				id: defaultSkillUriString,
				name: 'issue-wizard',
				range: { start: 0, endExclusive: 13 },
				value: { $mid: 'agentHostCompletion', kind: 'skill' },
				_meta: {
					uri: defaultSkillUriString,
					name: 'issue-wizard',
					displayName: 'issue-wizard',
					description: defaultSkillDescription,
				},
			},
			remainingAttachmentIds: [],
		});
	});

	test('the screenshot command attaches to the exact Issue Wizard after focus changes', async () => {
		const screenshotAttachment: IChatRequestVariableEntry = { kind: 'image', id: 'img-1', name: 'Issue screenshot', value: new Uint8Array([1, 2, 3]) };
		setupServices({ collectScreenshot: async () => [screenshotAttachment] });
		await runCommand();
		lastFocusedWidget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource: URI.parse(`${agentHostSessionType}:/unrelated-session`) }) });

		await runAddScreenshotCommand();

		assert.deepStrictEqual({
			screenshotCollectionCount,
			queries: acceptedRequests.map(request => request.query),
			bootstrapAttachmentIds: acceptedRequests[0].attachmentIds,
			attachmentIds: attachedContext.map(context => context.id),
			composerAttachmentIds: activeAttachments.map(context => context.id),
			screenshotSession: attachedSessionResources.at(-1)?.toString(),
		}, {
			screenshotCollectionCount: 1,
			queries: ['/issue-wizard Help me troubleshoot a VS Code issue.'],
			bootstrapAttachmentIds: [defaultSkillUriString],
			attachmentIds: [defaultSkillUriString, 'img-1'],
			composerAttachmentIds: ['img-1'],
			screenshotSession: openedSessionResources[0].toString(),
		});
	});

	test('cancelling highlighted screenshot collection does not submit or attach anything', async () => {
		setupServices();
		await runCommand();
		await runAddScreenshotCommand();
		assert.deepStrictEqual({ opened: openedSessionResources.length, acceptedRequests, attachmentKinds: attachedContext.map(context => context.kind), notifications }, {
			opened: 1,
			acceptedRequests: [{ query: '/issue-wizard Help me troubleshoot a VS Code issue.', attachmentIds: [defaultSkillUriString] }],
			attachmentKinds: ['generic'],
			notifications: { warn: [], error: [] },
		});
	});

	test('reports a user-visible failure when Agent Host cannot resolve the bundled skill invocation', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
		setupServices({ provideSkillCompletion: false });
		await runCommand();

		assert.deepStrictEqual({ completionRequestCount: completionRequests.length, acceptedRequests, attachedContext, notifications }, {
			completionRequestCount: 200,
			acceptedRequests: [],
			attachedContext: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: The bundled Issue Wizard skill could not be invoked by Agent Host.'] },
		});
	}));

	test('rejects a same-named workspace skill that shadows the bundled skill', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
		setupServices({ completionSkillUri: URI.file('/workspace/.github/skills/issue-wizard/SKILL.md') });
		await runCommand();

		assert.deepStrictEqual({ acceptedRequests, attachedContext, notifications }, {
			acceptedRequests: [],
			attachedContext: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: The bundled Issue Wizard skill could not be invoked by Agent Host.'] },
		});
	}));

	test('invokes the bundled skill through its materialized Agent Host copy', async () => {
		setupServices({ completionSkillUri: defaultMaterializedSkillUri, completionSkillSyncedUri: defaultSyncedSkillUri });
		await runCommand();

		assert.deepStrictEqual({ acceptedRequests, notifications }, {
			acceptedRequests: [{ query: '/issue-wizard Help me troubleshoot a VS Code issue.', attachmentIds: [defaultMaterializedSkillUri.toString()] }],
			notifications: { warn: [], error: [] },
		});
	});

	test('waits through a cold Agent Host skill materialization before bootstrapping', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
		setupServices({
			completionSkillUri: defaultMaterializedSkillUri,
			completionSkillSyncedUri: defaultSyncedSkillUri,
			skillCompletionUnavailableAttempts: 199,
		});
		await runCommand();

		assert.deepStrictEqual({ completionRequestCount: completionRequests.length, acceptedRequests, notifications }, {
			completionRequestCount: 200,
			acceptedRequests: [{ query: '/issue-wizard Help me troubleshoot a VS Code issue.', attachmentIds: [defaultMaterializedSkillUri.toString()] }],
			notifications: { warn: [], error: [] },
		});
	}));

	test('does not collect a screenshot outside an active Issue Wizard session', async () => {
		setupServices();
		await runAddScreenshotCommand();
		assert.deepStrictEqual({ screenshotCollectionCount, notifications }, {
			screenshotCollectionCount: 0,
			notifications: { warn: ['Open an Issue Wizard session before adding a highlighted screenshot.'], error: [] },
		});
	});

	test('reports unavailable state when Agent Host is disabled', async () => {
		setupServices({ enabled: false });
		await runCommand();
		assert.deepStrictEqual({ openedSessionResources, acceptedRequests, notifications }, {
			openedSessionResources: [],
			acceptedRequests: [],
			notifications: { warn: ['Issue Wizard is unavailable because Agent Host is disabled in this window.'], error: [] },
		});
	});

	test('does not launch when AI features are hidden', async () => {
		setupServices({ aiHidden: true });
		await runCommand();
		assert.deepStrictEqual({ openedSessionResources, acceptedRequests, notifications }, {
			openedSessionResources: [],
			acceptedRequests: [],
			notifications: { warn: ['Issue Wizard is unavailable because AI features are disabled in this window.'], error: [] },
		});
	});

	test('reports unavailable state when no Agent Host session type is registered', async () => {
		setupServices({ agentHostSessionTypes: [] });
		await runCommand();
		assert.deepStrictEqual({ openedSessionResources, acceptedRequests, notifications }, {
			openedSessionResources: [],
			acceptedRequests: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: No Agent Host session provider is available.'] },
		});
	});

	test('reports a user-visible failure when the bundled skill cannot be resolved', async () => {
		setupServices({ builtinSkillUri: undefined });
		await runCommand();
		assert.deepStrictEqual({ acceptedRequests, attachedContext, notifications }, {
			acceptedRequests: [],
			attachedContext: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: The bundled Issue Wizard skill could not be loaded.'] },
		});
	});

	test('reports a user-visible failure when the exact session widget cannot be opened', async () => {
		setupServices({ openSessionReturns: false });
		await runCommand();
		assert.deepStrictEqual({ opened: openedSessionResources.length, acceptedRequests, notifications }, {
			opened: 1,
			acceptedRequests: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: Chat session was not created.'] },
		});
	});

	test('uses a valid workspace folder when the active resource is outside a multi-root workspace', async () => {
		const firstFolder = URI.file('/workspace');
		setupServices({
			folders: [createWorkspaceFolder(firstFolder, 'workspace', 0), createWorkspaceFolder(URI.file('/workspace-a'), 'workspace-a', 1)],
			activeResource: URI.file('/workspace-a-not-a-child/file.txt'),
		});
		await runCommand();
		assert.strictEqual(openedSessionOptions[0].workspaceFolder.toString(), firstFolder.toString());
	});
});

suite('Issue Wizard Screenshot Intake', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const screenshotDataUrl = 'data:image/png;base64,AQID';
	const annotatedDataUrl = 'data:image/jpeg;base64,BAUG';
	const resolvedAttachment: IChatRequestVariableEntry = { kind: 'image', id: 'resolved-image', name: 'Issue screenshot', value: new Uint8Array([4, 5, 6]) };

	function createIntake(options?: { cancelAnnotation?: boolean }) {
		const events: string[] = [];
		let resolvedImages: Parameters<IChatAttachmentResolveService['resolveImageAttachContext']>[0] = [];
		const dialogService = new class extends mock<IDialogService>() { };
		const screenshotService = new class extends mock<IScreenshotService>() {
			override async captureScreenshot(): Promise<string | undefined> {
				events.push('capture');
				return screenshotDataUrl;
			}
		};
		const annotationService = new class extends mock<IIssueWizardScreenshotAnnotationService>() {
			override async annotate(dataUrl: string): Promise<IScreenshot | undefined> {
				events.push(`annotate:${dataUrl}`);
				return options?.cancelAnnotation ? undefined : { dataUrl, annotatedDataUrl, width: 20, height: 10 };
			}
		};
		const attachmentResolveService = new class extends mock<IChatAttachmentResolveService>() {
			override async resolveImageAttachContext(images: Parameters<IChatAttachmentResolveService['resolveImageAttachContext']>[0]): Promise<IChatRequestVariableEntry[]> {
				events.push('resolve');
				resolvedImages = images;
				return [resolvedAttachment];
			}
		};
		return {
			intake: new IssueWizardIntakeService(dialogService, screenshotService, annotationService, attachmentResolveService),
			events,
			getResolvedImages: () => resolvedImages,
		};
	}

	test('captures, annotates, and resolves a highlighted screenshot attachment', async () => {
		const { intake, events, getResolvedImages } = createIntake();
		const result = await intake.collectScreenshot();
		const image = getResolvedImages()[0];

		assert.deepStrictEqual({
			events,
			result,
			resolvedImage: image && { name: image.name, mimeType: image.mimeType, data: Array.from(image.data) },
		}, {
			events: ['capture', `annotate:${screenshotDataUrl}`, 'resolve'],
			result: [resolvedAttachment],
			resolvedImage: { name: 'Issue screenshot', mimeType: 'image/jpeg', data: [4, 5, 6] },
		});
	});

	test('cancelling annotation does not resolve or attach screenshot context', async () => {
		const { intake, events, getResolvedImages } = createIntake({ cancelAnnotation: true });
		const result = await intake.collectScreenshot();

		assert.deepStrictEqual({ events, result, resolvedImages: getResolvedImages() }, {
			events: ['capture', `annotate:${screenshotDataUrl}`],
			result: undefined,
			resolvedImages: [],
		});
	});
});

suite('Issue Wizard Contributions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function evaluate(when: ContextKeyExpression | undefined, enabled: boolean): boolean | undefined {
		return when?.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => (key === ChatContextKeys.enabled.key ? enabled : undefined) as T });
	}

	test('hides command palette and Help menu entries when AI features are disabled', () => {
		const commandPaletteItem = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.find(item => isIMenuItem(item) && item.command.id === ISSUE_WIZARD_COMMAND_ID);
		const screenshotCommandPaletteItem = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.find(item => isIMenuItem(item) && item.command.id === ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID);
		const helpItem = MenuRegistry.getMenuItems(MenuId.MenubarHelpMenu)
			.find(item => isIMenuItem(item) && item.command.id === ISSUE_WIZARD_COMMAND_ID);
		const commandWhen = commandPaletteItem && isIMenuItem(commandPaletteItem) ? commandPaletteItem.when : undefined;
		const screenshotCommandWhen = screenshotCommandPaletteItem && isIMenuItem(screenshotCommandPaletteItem) ? screenshotCommandPaletteItem.when : undefined;
		const helpWhen = helpItem && isIMenuItem(helpItem) ? helpItem.when : undefined;

		assert.deepStrictEqual({
			commandRegistered: !!commandPaletteItem,
			screenshotCommandRegistered: !!screenshotCommandPaletteItem,
			helpRegistered: !!helpItem,
			commandEnabled: evaluate(commandWhen, true),
			commandDisabled: evaluate(commandWhen, false),
			screenshotCommandEnabled: evaluate(screenshotCommandWhen, true),
			screenshotCommandDisabled: evaluate(screenshotCommandWhen, false),
			helpEnabled: evaluate(helpWhen, true),
			helpDisabled: evaluate(helpWhen, false),
		}, {
			commandRegistered: true,
			screenshotCommandRegistered: true,
			helpRegistered: true,
			commandEnabled: true,
			commandDisabled: false,
			screenshotCommandEnabled: true,
			screenshotCommandDisabled: false,
			helpEnabled: true,
			helpDisabled: false,
		});
	});

	test('owns the status entry immediately and hides it with AI sentiment', () => {
		const onDidChangeSentiment = disposables.add(new Emitter<void>());
		let sentiment: IChatSentiment = { completed: true, hidden: true };
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = onDidChangeSentiment.event;
			override get sentiment(): IChatSentiment { return sentiment; }
		};
		const entries: IStatusbarEntry[] = [];
		let activeEntryCount = 0;
		const statusbarService = new class extends mock<IStatusbarService>() {
			override addEntry(entry: IStatusbarEntry): IStatusbarEntryAccessor {
				entries.push(entry);
				activeEntryCount++;
				return { update: () => { }, dispose: () => { activeEntryCount--; } };
			}
		};
		const contribution = disposables.add(new IssueWizardStatusbarContribution(statusbarService, entitlementService));
		const activeEntryCountWhenHidden = activeEntryCount;

		sentiment = { completed: true, hidden: false };
		onDidChangeSentiment.fire();
		const visibleState = { activeEntryCount, command: entries[0]?.command };

		contribution.dispose();
		assert.deepStrictEqual({ activeEntryCountWhenHidden, visibleState, activeEntryCountAfterDispose: activeEntryCount }, {
			activeEntryCountWhenHidden: 0,
			visibleState: { activeEntryCount: 1, command: ISSUE_WIZARD_COMMAND_ID },
			activeEntryCountAfterDispose: 0,
		});
	});
});
