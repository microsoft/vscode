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
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpression, ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatAttachmentResolveService } from '../../../chat/browser/attachments/chatAttachmentResolveService.js';
import { ChatAttachmentModel } from '../../../chat/browser/attachments/chatAttachmentModel.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../../chat/common/chatSessionsService.js';
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
	let acceptedQueries: string[];
	let attachedContext: IChatRequestVariableEntry[];
	let openedSessionResources: URI[];
	let focusedSessionResources: URI[];
	let openedSessionOptions: { sessionType: string; displayName: string; workspaceFolder: URI }[];
	let lastFocusedWidget: IChatWidget | undefined;

	const workspaceFolderUri = URI.file('/workspace');
	const defaultSkillUri = URI.file('/application/vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md');
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
		openSessionReturns?: boolean;
		collectScreenshot?: () => Promise<readonly IChatRequestVariableEntry[] | undefined>;
	}): void {
		notifications = { warn: [], error: [] };
		intakeResult = undefined;
		screenshotCollectionCount = 0;
		acceptedQueries = [];
		attachedContext = [];
		openedSessionResources = [];
		focusedSessionResources = [];
		openedSessionOptions = [];
		lastFocusedWidget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource: URI.parse('agent-host-codex:/unrelated') }) });

		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IAgentHostEnablementService, {
			_serviceBrand: undefined,
			enabled: constObservable(options?.enabled ?? true),
			managedSandboxEnforced: constObservable(false),
			managedSandboxAllowsBypass: constObservable(false),
		});

		const folders = options?.folders ?? [createWorkspaceFolder(workspaceFolderUri, 'workspace', 0)];
		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace { return createWorkspace(folders); }
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return folders.find(folder => extUriBiasedIgnorePathCase.isEqualOrParent(resource, folder.uri)) ?? null;
			}
		});

		if (options?.activeResource) {
			const activeEditor = disposables.add(new TestFileEditorInput(options.activeResource, 'issueWizardTestInput'));
			instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
				override readonly activeEditor = activeEditor;
			});
		}

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
				return skillUri ? [{ uri: skillUri, storage: PromptsStorage.builtIn, type: PromptsType.skill }] : [];
			},
			parseNew: async uri => ({ uri }),
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
		});

		const shouldReturnWidget = options?.openSessionReturns ?? true;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return lastFocusedWidget; },
			openNewAgentHostEditorSession: async sessionOptions => {
				openedSessionOptions.push(sessionOptions);
				const sessionResource = URI.parse(`${sessionOptions.sessionType}:/untitled-${openedSessionResources.length + 1}`);
				openedSessionResources.push(sessionResource);
				if (!shouldReturnWidget) { return undefined; }
				const widget = upcastPartial<IChatWidget>({
					viewModel: upcastPartial<IChatViewModel>({ sessionResource }),
					attachmentModel: upcastPartial<ChatAttachmentModel>({ addContext: (entry: IChatRequestVariableEntry) => { attachedContext.push(entry); } }),
					acceptInput: async query => { if (query) { acceptedQueries.push(query); } },
					focusInput: () => focusedSessionResources.push(sessionResource),
				});
				lastFocusedWidget = widget;
				return { sessionResource, widget };
			},
		}));
		instantiationService.stub(IIssueWizardLauncherService, instantiationService.createInstance(IssueWizardLauncherService));
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
			queries: acceptedQueries,
			attachmentKinds: attachedContext.map(context => context.kind),
			notifications,
		}, {
			sessionTypes: [agentHostSessionType, agentHostSessionType],
			freshSession: true,
			selectedFolders: [workspaceFolderUri.toString(), workspaceFolderUri.toString()],
			displayNames: ['Issue Wizard', 'Issue Wizard'],
			focusedSessions: openedSessionResources.map(resource => resource.toString()),
			queries: ['Use the bundled Issue Wizard skill.\nHelp me troubleshoot a VS Code issue.', 'Use the bundled Issue Wizard skill.\nHelp me troubleshoot a VS Code issue.'],
			attachmentKinds: ['promptFile', 'promptFile'],
			notifications: { warn: [], error: [] },
		});
	});

	test('preserves a supplied symptom in the bootstrap message', async () => {
		setupServices();
		await runCommand({ symptom: 'Saving stalls for 10 seconds' });
		assert.deepStrictEqual({ screenshotCollectionCount, query: acceptedQueries[0] }, {
			screenshotCollectionCount: 0,
			query: 'Use the bundled Issue Wizard skill.\nHelp me troubleshoot a VS Code issue.\nSymptom: Saving stalls for 10 seconds',
		});
	});

	test('attaches the built-in skill directly so a same-named slash command cannot shadow it', async () => {
		setupServices();
		await runCommand();

		assert.deepStrictEqual({
			usesShadowableSlashCommand: acceptedQueries[0].startsWith('/issue-wizard'),
			attachmentIds: attachedContext.map(context => context.id),
		}, {
			usesShadowableSlashCommand: false,
			attachmentIds: [`vscode.prompt.file__${defaultSkillUri.toString()}`],
		});
	});

	test('adds highlighted screenshot context after the conversation has started', async () => {
		const screenshotAttachment: IChatRequestVariableEntry = { kind: 'image', id: 'img-1', name: 'Issue screenshot', value: new Uint8Array([1, 2, 3]) };
		setupServices({ collectScreenshot: async () => [screenshotAttachment] });
		await runCommand();
		assert.ok(lastFocusedWidget?.viewModel);
		Object.defineProperty(lastFocusedWidget.viewModel, 'sessionResource', { value: URI.parse(`${agentHostSessionType}:/persisted-session`) });
		await runAddScreenshotCommand();

		assert.deepStrictEqual({ screenshotCollectionCount, queries: acceptedQueries, attachmentIds: attachedContext.map(context => context.id) }, {
			screenshotCollectionCount: 1,
			queries: ['Use the bundled Issue Wizard skill.\nHelp me troubleshoot a VS Code issue.'],
			attachmentIds: [`vscode.prompt.file__${defaultSkillUri.toString()}`, 'img-1'],
		});
	});

	test('cancelling highlighted screenshot collection does not submit or attach anything', async () => {
		setupServices();
		await runCommand();
		await runAddScreenshotCommand();
		assert.deepStrictEqual({ opened: openedSessionResources.length, acceptedQueries, attachmentKinds: attachedContext.map(context => context.kind), notifications }, {
			opened: 1,
			acceptedQueries: ['Use the bundled Issue Wizard skill.\nHelp me troubleshoot a VS Code issue.'],
			attachmentKinds: ['promptFile'],
			notifications: { warn: [], error: [] },
		});
	});

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
		assert.deepStrictEqual({ openedSessionResources, acceptedQueries, notifications }, {
			openedSessionResources: [],
			acceptedQueries: [],
			notifications: { warn: ['Issue Wizard is unavailable because Agent Host is disabled in this window.'], error: [] },
		});
	});

	test('reports unavailable state when no Agent Host session type is registered', async () => {
		setupServices({ agentHostSessionTypes: [] });
		await runCommand();
		assert.deepStrictEqual({ openedSessionResources, acceptedQueries, notifications }, {
			openedSessionResources: [],
			acceptedQueries: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: No Agent Host session provider is available.'] },
		});
	});

	test('reports a user-visible failure when the bundled skill cannot be resolved', async () => {
		setupServices({ builtinSkillUri: undefined });
		await runCommand();
		assert.deepStrictEqual({ acceptedQueries, attachedContext, notifications }, {
			acceptedQueries: [],
			attachedContext: [],
			notifications: { warn: [], error: ['Issue Wizard failed to start: The bundled Issue Wizard skill could not be loaded.'] },
		});
	});

	test('reports a user-visible failure when the exact session widget cannot be opened', async () => {
		setupServices({ openSessionReturns: false });
		await runCommand();
		assert.deepStrictEqual({ opened: openedSessionResources.length, acceptedQueries, notifications }, {
			opened: 1,
			acceptedQueries: [],
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

	function evaluate(when: ContextKeyExpression | undefined, enabled: boolean): boolean {
		assert.ok(when);
		return when.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => (key === ChatContextKeys.enabled.key ? enabled : undefined) as T });
	}

	test('hides command palette and Help menu entries when AI features are disabled', () => {
		const commandPaletteItem = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.find(item => isIMenuItem(item) && item.command.id === ISSUE_WIZARD_COMMAND_ID);
		const screenshotCommandPaletteItem = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.find(item => isIMenuItem(item) && item.command.id === ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID);
		const helpItem = MenuRegistry.getMenuItems(MenuId.MenubarHelpMenu)
			.find(item => isIMenuItem(item) && item.command.id === ISSUE_WIZARD_COMMAND_ID);
		assert.ok(commandPaletteItem && isIMenuItem(commandPaletteItem));
		assert.ok(screenshotCommandPaletteItem && isIMenuItem(screenshotCommandPaletteItem));
		assert.ok(helpItem && isIMenuItem(helpItem));

		assert.deepStrictEqual({
			commandEnabled: evaluate(commandPaletteItem.when, true),
			commandDisabled: evaluate(commandPaletteItem.when, false),
			screenshotCommandEnabled: evaluate(screenshotCommandPaletteItem.when, true),
			screenshotCommandDisabled: evaluate(screenshotCommandPaletteItem.when, false),
			helpEnabled: evaluate(helpItem.when, true),
			helpDisabled: evaluate(helpItem.when, false),
		}, {
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
		assert.strictEqual(activeEntryCount, 0);

		sentiment = { completed: true, hidden: false };
		onDidChangeSentiment.fire();
		assert.deepStrictEqual({ activeEntryCount, command: entries[0].command }, { activeEntryCount: 1, command: ISSUE_WIZARD_COMMAND_ID });

		contribution.dispose();
		assert.strictEqual(activeEntryCount, 0);
	});
});
