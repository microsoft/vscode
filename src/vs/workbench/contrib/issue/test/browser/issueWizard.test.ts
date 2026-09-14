/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ACTION_ID_OPEN_CHAT } from '../../../chat/browser/actions/chatActions.js';
import { ICustomizationHarnessService } from '../../../chat/common/customizationHarnessService.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { IIssueWizardIntakeResult, IIssueWizardIntakeService, IIssueWizardLaunchOptions } from '../../browser/issueWizardIntakeService.js';
import { ISSUE_WIZARD_COMMAND_ID } from '../../browser/issueWizard.js';

suite('Issue Wizard Launch Command', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let notifications: { warn: string[]; error: string[] };
	let intakeResult: IIssueWizardIntakeResult;
	let intakeOptions: (IIssueWizardLaunchOptions | undefined)[];
	let capturedCommands: string[];
	let acceptedQueries: string[];
	let attachedContext: IChatRequestVariableEntry[];
	let chatSessionResource: URI | undefined;

	const workspaceFolderUri = URI.file('/workspace');

	function createWorkspaceFolder(uri: URI, name: string, index: number): IWorkspaceFolder {
		return {
			uri,
			name,
			index,
			toResource: relativePath => URI.joinPath(uri, relativePath),
		};
	}

	function createWorkspace(folders: IWorkspaceFolder[]): IWorkspace {
		return {
			id: 'issue-wizard-tests',
			folders,
			transient: false,
			configuration: null,
		};
	}

	function setupServices(options?: { enabled?: boolean; folders?: IWorkspaceFolder[]; slashPromptUri?: URI | undefined; chatSessionResource?: URI | undefined; executeOpenChatThrows?: Error | undefined }): void {
		notifications = { warn: [], error: [] };
		intakeOptions = [];
		intakeResult = {};
		capturedCommands = [];
		acceptedQueries = [];
		attachedContext = [];
		chatSessionResource = options?.chatSessionResource ?? URI.parse('vscode-agent-host-session://tests/issue-wizard');

		instantiationService = workbenchInstantiationService(undefined, disposables);

		instantiationService.stub(IAgentHostEnablementService, {
			_serviceBrand: undefined,
			enabled: constObservable(options?.enabled ?? true),
			managedSandboxEnforced: constObservable(false),
			managedSandboxAllowsBypass: constObservable(false),
		});

		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace {
				return createWorkspace(options?.folders ?? [createWorkspaceFolder(workspaceFolderUri, 'workspace', 0)]);
			}

			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				for (const folder of this.getWorkspace().folders) {
					if (resource.toString().startsWith(folder.uri.toString())) {
						return folder;
					}
				}
				return null;
			}
		});

		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override warn(message: string): void {
				notifications.warn.push(message);
			}
			override error(message: string): void {
				notifications.error.push(message);
			}
		});

		instantiationService.stub(IIssueWizardIntakeService, new class extends mock<IIssueWizardIntakeService>() {
			override async collect(optionsArg?: IIssueWizardLaunchOptions): Promise<IIssueWizardIntakeResult> {
				intakeOptions.push(optionsArg);
				return intakeResult;
			}
		});

		instantiationService.stub(ICustomizationHarnessService, {
			...mock<ICustomizationHarnessService>(),
			resolvePromptSlashCommand: async () => {
				if (!options?.slashPromptUri) {
					return undefined;
				}
				return {
					parsedPromptFile: {
						uri: options.slashPromptUri,
					},
				} as Awaited<ReturnType<ICustomizationHarnessService['resolvePromptSlashCommand']>>;
			},
		});

		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(commandId: string): Promise<T> {
				capturedCommands.push(commandId);
				if (commandId === ACTION_ID_OPEN_CHAT && options?.executeOpenChatThrows) {
					throw options.executeOpenChatThrows;
				}
				return undefined as T;
			}
		});

		instantiationService.stub(IChatWidgetService, {
			...mock<IChatWidgetService>(),
			lastFocusedWidget: chatSessionResource ? {
				viewModel: { model: { sessionResource: chatSessionResource } },
				attachmentModel: {
					addContext: (entry: IChatRequestVariableEntry) => {
						attachedContext.push(entry);
					}
				},
				acceptInput: async (query?: string) => {
					if (query) {
						acceptedQueries.push(query);
					}
					return undefined;
				},
				onDidChangeViewModel: Event.None,
				onDidAcceptInput: Event.None,
				onDidHide: Event.None,
				onDidShow: Event.None,
				onDidSubmitAgent: Event.None,
				onDidChangeAgent: Event.None,
				onDidChangeParsedInput: Event.None,
				onDidChangeActiveInputEditor: Event.None,
				onDidFocus: Event.None,
				onDidScroll: Event.None,
			} as unknown as NonNullable<IChatWidgetService['lastFocusedWidget']> : undefined,
		});
	}

	async function runCommand(options?: IIssueWizardLaunchOptions): Promise<void> {
		const command = CommandsRegistry.getCommand(ISSUE_WIZARD_COMMAND_ID);
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler, options);
	}

	test('creates a fresh chat session and sends bootstrap message', async () => {
		setupServices();

		await runCommand();

		assert.deepStrictEqual(intakeOptions, [undefined]);
		assert.deepStrictEqual(capturedCommands, [ACTION_ID_OPEN_CHAT]);
		assert.strictEqual(acceptedQueries.length, 1);
		assert.ok(acceptedQueries[0].startsWith('/issue-wizard'));
		assert.ok(acceptedQueries[0].includes('Help me troubleshoot a VS Code issue.'));
		assert.deepStrictEqual(notifications, { warn: [], error: [] });
	});

	test('preserves supplied symptom in bootstrap message', async () => {
		setupServices();
		intakeResult = { symptom: 'Saving stalls for 10 seconds' };

		await runCommand({ symptom: 'Saving stalls for 10 seconds', promptForIntake: false });

		assert.deepStrictEqual(intakeOptions, [{ symptom: 'Saving stalls for 10 seconds', promptForIntake: false }]);
		assert.ok(acceptedQueries[0].includes('Symptom: Saving stalls for 10 seconds'));
	});

	test('attaches issue-wizard skill and screenshot context when available', async () => {
		const screenshotAttachment: IChatRequestVariableEntry = {
			kind: 'image',
			id: 'img-1',
			name: 'Issue screenshot',
			value: new Uint8Array([1, 2, 3]),
		};
		setupServices({ slashPromptUri: URI.file('/workspace/.github/skills/issue-wizard/SKILL.md') });
		intakeResult = { attachedContext: [screenshotAttachment] };

		await runCommand({ includeScreenshot: true, promptForIntake: false });

		assert.strictEqual(attachedContext.length, 2);
		assert.strictEqual(attachedContext[0].kind, 'promptFile');
		assert.strictEqual(attachedContext[1].id, 'img-1');
	});

	test('reports unavailable state when agent host is disabled', async () => {
		setupServices({ enabled: false });

		await runCommand();

		assert.deepStrictEqual(capturedCommands, []);
		assert.deepStrictEqual(acceptedQueries, []);
		assert.strictEqual(notifications.warn.length, 1);
		assert.ok(notifications.warn[0].includes('Issue Wizard is unavailable'));
	});

	test('reports unavailable state when no workspace folder is open', async () => {
		setupServices({ folders: [] });

		await runCommand();

		assert.deepStrictEqual(capturedCommands, []);
		assert.deepStrictEqual(acceptedQueries, []);
		assert.strictEqual(notifications.warn.length, 1);
		assert.ok(notifications.warn[0].includes('open workspace folder'));
	});

	test('uses first workspace folder when no editor is active in multi-root', async () => {
		setupServices({
			folders: [
				createWorkspaceFolder(URI.file('/workspace-a'), 'workspace-a', 0),
				createWorkspaceFolder(URI.file('/workspace-b'), 'workspace-b', 1),
			],
		});

		await runCommand();

		assert.deepStrictEqual(capturedCommands, [ACTION_ID_OPEN_CHAT]);
		assert.deepStrictEqual(notifications, { warn: [], error: [] });
	});

	test('reports start failure when chat session cannot be created', async () => {
		setupServices({ chatSessionResource: undefined });

		await runCommand();

		assert.deepStrictEqual(capturedCommands, [ACTION_ID_OPEN_CHAT]);
		assert.strictEqual(notifications.error.length, 1);
		assert.ok(notifications.error[0].includes('failed to start'));
	});
});
