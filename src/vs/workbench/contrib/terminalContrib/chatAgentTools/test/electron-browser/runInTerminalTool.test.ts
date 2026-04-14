/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { Separator } from '../../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isLinux, isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { count } from '../../../../../../base/common/strings.js';
import { hasKey, type SingleOrMany } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalProfile } from '../../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IHistoryService } from '../../../../../services/history/common/history.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { IChatService, type IChatTerminalToolInvocationData } from '../../../../chat/common/chatService/chatService.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
import { ChatPermissionLevel } from '../../../../chat/common/constants.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck, type ITerminalSandboxPrerequisiteCheckResult } from '../../common/terminalSandboxService.js';
import { ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocationPreparationContext, ToolDataSource, ToolSet, type ToolConfirmationAction } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalChatService, ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService } from '../../../../terminal/common/terminal.js';
import type { ICommandLinePresenter } from '../../browser/tools/commandLinePresenter/commandLinePresenter.js';
import { createRunInTerminalToolData, RunInTerminalTool, shouldAutomaticallyRetryUnsandboxed, type IRunInTerminalInputParams } from '../../browser/tools/runInTerminalTool.js';
import { ShellIntegrationQuality } from '../../browser/toolTerminalCreator.js';
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSandboxEnabledValue, TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { TerminalChatService } from '../../../chat/browser/terminalChatService.js';
import type { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IAgentSessionsService } from '../../../../chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession } from '../../../../chat/browser/agentSessions/agentSessionsModel.js';
import { isDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ChatAgentToolsContribution } from '../../browser/terminal.chatAgentTools.contribution.js';
import { TerminalToolId } from '../../browser/tools/toolIds.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../../../base/common/codicons.js';

class TestRunInTerminalTool extends RunInTerminalTool {
	protected override _osBackend: Promise<OperatingSystem> = Promise.resolve(OperatingSystem.Windows);

	get sessionTerminalAssociations() { return this._sessionTerminalAssociations; }
	get sessionTerminalInstances() { return this._sessionTerminalInstances; }
	get profileFetcher() { return this._profileFetcher; }
	get commandLinePresenters(): ICommandLinePresenter[] { return (this as unknown as Record<string, ICommandLinePresenter[]>)['_commandLinePresenters']; }

	setBackendOs(os: OperatingSystem) {
		this._osBackend = Promise.resolve(os);
	}
}

type ITestRunInTerminalToolInvocationData = IChatTerminalToolInvocationData & { requiresConfirmationForRetry?: boolean };

suite('RunInTerminalTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let fileService: IFileService;
	let storageService: IStorageService;
	let workspaceContextService: TestContextService;
	let terminalServiceDisposeEmitter: Emitter<ITerminalInstance>;
	let chatServiceDisposeEmitter: Emitter<{ sessionResources: URI[]; reason: 'cleared' }>;
	let chatSessionArchivedEmitter: Emitter<IAgentSession>;
	let capturedSteeringRequests: { sessionResource: URI; message: string }[];
	let sandboxEnabled: boolean;
	let sandboxPrereqResult: ITerminalSandboxPrerequisiteCheckResult;
	let terminalSandboxService: ITerminalSandboxService;
	let createdTerminalInstance: ITerminalInstance;

	let runInTerminalTool: TestRunInTerminalTool;

	setup(() => {
		configurationService = new TestConfigurationService();
		workspaceContextService = new TestContextService();

		const logService = new NullLogService();
		fileService = store.add(new FileService(logService));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
		setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');
		sandboxEnabled = false;
		sandboxPrereqResult = {
			enabled: false,
			sandboxConfigPath: undefined,
			failedCheck: undefined,
		};

		const commandFinishedEmitter = new Emitter<{ exitCode: number | undefined }>();
		const onDisposedEmitter = new Emitter<ITerminalInstance>();
		const onDidAddCapabilityEmitter = new Emitter<{ id: TerminalCapability }>();
		const onDidInputDataEmitter = new Emitter<string>();
		createdTerminalInstance = {
			sendText: async (_text: string) => {
				// Simulate successful command completion after sendText
				queueMicrotask(() => commandFinishedEmitter.fire({ exitCode: 0 }));
			},
			focus: () => { },
			capabilities: {
				get: (cap: TerminalCapability) => {
					if (cap === TerminalCapability.CommandDetection) {
						return {
							onCommandFinished: commandFinishedEmitter.event,
						};
					}
					return undefined;
				},
				onDidAddCapability: onDidAddCapabilityEmitter.event,
			},
			onDidInputData: onDidInputDataEmitter.event,
			onDisposed: onDisposedEmitter.event,
		} as unknown as ITerminalInstance;
		terminalServiceDisposeEmitter = new Emitter<ITerminalInstance>();
		chatServiceDisposeEmitter = new Emitter<{ sessionResources: URI[]; reason: 'cleared' }>();
		chatSessionArchivedEmitter = new Emitter<IAgentSession>();
		capturedSteeringRequests = [];

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			fileService: () => fileService,
		}, store);

		const chatServiceStub = {
			onDidDisposeSession: chatServiceDisposeEmitter.event,
			getSession: () => undefined,
			sendRequest: async (sessionResource: URI, message: string) => {
				capturedSteeringRequests.push({ sessionResource, message });
				return { kind: 'rejected', reason: 'test' };
			},
			acquireExistingSession: () => ({
				object: {
					lastRequest: undefined,
					onDidChange: Event.None,
				},
				dispose: () => { },
			}) as unknown as NonNullable<ReturnType<IChatService['acquireExistingSession']>>,
		} as unknown as IChatService;
		instantiationService.stub(IChatService, chatServiceStub);
		instantiationService.stub(IAgentSessionsService, {
			onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
			model: {
				onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
			} as IAgentSessionsService['model']
		});
		instantiationService.stub(ITerminalService, {
			createTerminal: async () => createdTerminalInstance,
			onDidDisposeInstance: terminalServiceDisposeEmitter.event,
			onDidChangeInstances: Event.None,
			revealTerminal: async () => { },
			setActiveInstance: () => { },
			setNextCommandId: async () => { }
		});
		instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(IHistoryService, {
			getLastActiveWorkspaceRoot: () => undefined
		});
		terminalSandboxService = {
			_serviceBrand: undefined,
			isEnabled: async () => sandboxEnabled,
			wrapCommand: (command: string, requestUnsandboxedExecution?: boolean) => ({
				command: requestUnsandboxedExecution ? `unsandboxed:${command}` : `sandbox:${command}`,
				isSandboxWrapped: !requestUnsandboxedExecution,
			}),
			getSandboxConfigPath: async () => sandboxEnabled ? '/tmp/sandbox.json' : undefined,
			checkForSandboxingPrereqs: async () => sandboxPrereqResult,
			getTempDir: () => undefined,
			setNeedsForceUpdateConfigFile: () => { },
			getOS: async () => OperatingSystem.Linux,
			getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
			getMissingSandboxDependencies: async () => [],
			installMissingSandboxDependencies: async (missingDependencies, _sessionResource, _token, options) => {
				const terminal = await options.createTerminal();
				await options.focusTerminal(terminal);
				await terminal.sendText(`sudo apt install -y ${missingDependencies.join(' ')}`, true);
				return { exitCode: 0 };
			},
		};
		instantiationService.stub(ITerminalSandboxService, terminalSandboxService);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		instantiationService.stub(ILanguageModelToolsService, {
			getTools() {
				return [];
			},
		});
		instantiationService.stub(ITerminalProfileResolverService, {
			getDefaultProfile: async () => ({ path: 'bash' } as ITerminalProfile)
		});

		storageService = instantiationService.get(IStorageService);
		storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, true, StorageScope.APPLICATION, StorageTarget.USER);

		runInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
	});

	function setAutoApprove(value: { [key: string]: { approve: boolean; matchCommandLine?: boolean } | boolean }) {
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
	}

	function setConfig(key: string, value: unknown) {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([key]),
			source: ConfigurationTarget.USER,
			change: null!,
		});
	}

	function clearAutoApproveWarningAcceptedState() {
		storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
	}

	/**
	 * Executes a test scenario for the RunInTerminalTool
	 */
	async function executeToolTest(
		params: Partial<IRunInTerminalInputParams>
	): Promise<IPreparedToolInvocation | undefined> {
		const context: IToolInvocationPreparationContext = {
			parameters: {
				command: 'echo hello',
				explanation: 'Print hello to the console',
				goal: 'Print hello',
				...params
			} as IRunInTerminalInputParams
		} as IToolInvocationPreparationContext;

		const result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
		return result;
	}

	function isSeparator(action: ToolConfirmationAction): action is Separator {
		return action instanceof Separator;
	}

	/**
	 * Helper to assert that a command should be auto-approved (no confirmation required)
	 */
	function assertAutoApproved(preparedInvocation: IPreparedToolInvocation | undefined) {
		ok(preparedInvocation, 'Expected prepared invocation to be defined');
		ok(!preparedInvocation.confirmationMessages, 'Expected no confirmation messages for auto-approved command');
	}

	/**
	 * Helper to assert that a command requires confirmation
	 */
	function assertConfirmationRequired(preparedInvocation: IPreparedToolInvocation | undefined, expectedTitle?: string) {
		ok(preparedInvocation, 'Expected prepared invocation to be defined');
		ok(preparedInvocation.confirmationMessages, 'Expected confirmation messages for non-approved command');
		if (expectedTitle) {
			strictEqual(preparedInvocation.confirmationMessages!.title, expectedTitle);
		}
	}

	function confirmAutomaticUnsandboxRetry(tool: RunInTerminalTool, sessionResource: URI | undefined, command: string, shell: string, blockedDomains: string[] | undefined, requiresConfirmationForRetry: boolean | undefined): Promise<boolean> {
		return (tool as unknown as Record<string, (sessionResource: URI | undefined, command: string, shell: string, blockedDomains: string[] | undefined, requiresConfirmationForRetry: boolean | undefined, token: CancellationToken) => Promise<boolean>>)['_confirmAutomaticUnsandboxRetry'](sessionResource, command, shell, blockedDomains, requiresConfirmationForRetry, CancellationToken.None);
	}

	function getAutomaticUnsandboxRetryTitle(tool: RunInTerminalTool, shellType: string, blockedDomains: string[] | undefined): IMarkdownString {
		return (tool as unknown as Record<string, (shellType: string, blockedDomains: string[] | undefined) => IMarkdownString>)['_getAutomaticUnsandboxRetryTitle'](shellType, blockedDomains);
	}

	suite('sandbox invocation messaging', () => {
		test('should instruct models to use $TMPDIR instead of /tmp when sandboxed', async () => {
			sandboxEnabled = true;

			const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);

			ok(toolData.modelDescription?.includes('must utilize the $TMPDIR environment variable'), 'Expected sandboxed tool description to require $TMPDIR usage');
			ok(toolData.modelDescription?.includes('The /tmp directory is not guaranteed to be accessible or writable and must be avoided'), 'Expected sandboxed tool description to discourage /tmp usage');
		});

		test('should include requestUnsandboxedExecution in schema when sandbox is enabled', async () => {
			sandboxEnabled = true;

			const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
			const properties = toolData.inputSchema?.properties as Record<string, object> | undefined;
			const requestUnsandboxedExecutionProperty = properties?.['requestUnsandboxedExecution'] as { description?: string } | undefined;
			const requestUnsandboxedExecutionReasonProperty = properties?.['requestUnsandboxedExecutionReason'] as { description?: string } | undefined;

			ok(properties?.['requestUnsandboxedExecution'], 'Expected requestUnsandboxedExecution in schema when sandbox is enabled');
			ok(properties?.['requestUnsandboxedExecutionReason'], 'Expected requestUnsandboxedExecutionReason in schema when sandbox is enabled');
			ok(requestUnsandboxedExecutionProperty?.description?.includes('after first executing the command in sandbox and observing that sandboxing caused the failure'), 'Expected schema description to require a sandboxed first attempt');
			ok(requestUnsandboxedExecutionReasonProperty?.description?.includes('sandboxed execution failure or blocked-domain requirement'), 'Expected reason schema description to require concrete sandbox justification');
		});

		test('should not include requestUnsandboxedExecution in schema when sandbox is disabled', async () => {
			sandboxEnabled = false;

			const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);
			const properties = toolData.inputSchema?.properties as Record<string, object> | undefined;

			ok(!properties?.['requestUnsandboxedExecution'], 'Expected no requestUnsandboxedExecution in schema when sandbox is disabled');
			ok(!properties?.['requestUnsandboxedExecutionReason'], 'Expected no requestUnsandboxedExecutionReason in schema when sandbox is disabled');
		});

		test('should reflect sandbox setting changes in tool data', async () => {
			sandboxEnabled = false;

			const toolDataBefore = await instantiationService.invokeFunction(createRunInTerminalToolData);
			const propertiesBefore = toolDataBefore.inputSchema?.properties as Record<string, object> | undefined;
			ok(!propertiesBefore?.['requestUnsandboxedExecution'], 'Expected no requestUnsandboxedExecution before enabling sandbox');

			sandboxEnabled = true;
			sandboxPrereqResult = {
				enabled: true,
				sandboxConfigPath: '/tmp/sandbox.json',
				failedCheck: undefined,
			};

			const toolDataAfter = await instantiationService.invokeFunction(createRunInTerminalToolData);
			const propertiesAfter = toolDataAfter.inputSchema?.properties as Record<string, object> | undefined;
			ok(propertiesAfter?.['requestUnsandboxedExecution'], 'Expected requestUnsandboxedExecution after enabling sandbox');
			ok(toolDataAfter.modelDescription?.includes('Sandboxing:'), 'Expected sandbox instructions in description after enabling sandbox');
		});

		test('should show confirmation to install missing sandbox dependencies when prereq check fails', async () => {
			sandboxEnabled = false;
			sandboxPrereqResult = {
				enabled: false,
				sandboxConfigPath: '/tmp/sandbox.json',
				failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
				missingDependencies: ['bubblewrap'],
			};

			const result = await executeToolTest({
				command: 'echo hello',
				explanation: 'Print hello',
				goal: 'Print hello'
			});

			// The tool should return confirmation messages for the user
			ok(result, 'Expected prepared invocation to be defined');
			ok(result?.confirmationMessages, 'Expected confirmationMessages when deps are missing');
			ok(result?.confirmationMessages?.customButtons?.length === 2, 'Expected two custom buttons');
			// missingDependencies should be in toolSpecificData so invoke can handle it
			strictEqual((result?.toolSpecificData as IChatTerminalToolInvocationData | undefined)?.missingSandboxDependencies?.length, 1);
		});

		test('should include allowed and denied network domains in model description', async () => {
			sandboxEnabled = true;
			terminalSandboxService.getResolvedNetworkDomains = () => ({
				allowedDomains: ['github.com', 'npmjs.org'],
				deniedDomains: ['evil.com'],
			});

			const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);

			ok(toolData.modelDescription?.includes('github.com, npmjs.org'), 'Expected allowed domains in description');
			ok(toolData.modelDescription?.includes('evil.com'), 'Expected denied domains in description');
			ok(toolData.modelDescription?.includes('without first executing the command in sandbox mode'), 'Expected model description to require a sandboxed first attempt before unsandboxing');
		});

		test('should exclude denied domains from effective allowed list', async () => {
			sandboxEnabled = true;
			terminalSandboxService.getResolvedNetworkDomains = () => ({
				allowedDomains: ['github.com', 'evil.com', 'npmjs.org'],
				deniedDomains: ['evil.com'],
			});

			const toolData = await instantiationService.invokeFunction(createRunInTerminalToolData);

			ok(toolData.modelDescription?.includes('github.com, npmjs.org'), 'Expected effective allowed list without denied domain');
			ok(!toolData.modelDescription?.includes('accessible in the sandbox (all other network access is blocked): github.com, evil.com'), 'Expected denied domain removed from allowed list');
		});

		test('should use sandbox labels when command is sandbox wrapped', async () => {
			sandboxEnabled = true;
			sandboxPrereqResult = {
				enabled: true,
				sandboxConfigPath: '/tmp/vscode-sandbox-settings.json',
				failedCheck: undefined,
			};
			terminalSandboxService.wrapCommand = (command: string) => ({
				command: `sandbox-runtime ${command}`,
				isSandboxWrapped: true,
			});

			const preparedInvocation = await executeToolTest({ command: 'echo hello' });

			ok(preparedInvocation, 'Expected prepared invocation to be defined');
			strictEqual((preparedInvocation.invocationMessage as IMarkdownString).value, 'Running `echo hello` in sandbox');

			const terminalData = preparedInvocation.toolSpecificData as IChatTerminalToolInvocationData;
			strictEqual(terminalData.commandLine.isSandboxWrapped, true);
		});

		test('should not show sandbox wrapper in chat when sandboxed async command is detached', async () => {
			runInTerminalTool.setBackendOs(OperatingSystem.Linux);
			setConfig(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, true);
			sandboxEnabled = true;
			sandboxPrereqResult = {
				enabled: true,
				sandboxConfigPath: '/tmp/vscode-sandbox-settings.json',
				failedCheck: undefined,
			};
			terminalSandboxService.wrapCommand = (command: string) => ({
				command: `sandbox-runtime ${command}`,
				isSandboxWrapped: true,
			});

			const preparedInvocation = await executeToolTest({ command: 'echo hello', mode: 'async' });

			ok(preparedInvocation, 'Expected prepared invocation to be defined');
			strictEqual((preparedInvocation.invocationMessage as IMarkdownString).value, 'Running `echo hello` in sandbox');

			const terminalData = preparedInvocation.toolSpecificData as IChatTerminalToolInvocationData;
			strictEqual(terminalData.commandLine.forDisplay, 'echo hello');
			strictEqual(terminalData.commandLine.toolEdited, 'nohup sandbox-runtime echo hello &');
		});
	});

	suite('automatic sandbox retry', () => {
		const baseRetryOptions = {
			didSandboxWrapCommand: true,
			requestUnsandboxedExecution: false,
			isPersistentSession: false,
			isBackgroundExecution: false,
			didTimeout: false,
			exitCode: 1,
			output: '/bin/bash: /workspace/out.txt: Operation not permitted',
		};

		test('should retry completed foreground sandbox commands when output indicates sandbox block', () => {
			strictEqual(shouldAutomaticallyRetryUnsandboxed(baseRetryOptions), true);
		});

		test('should not retry when the command is already unsandboxed', () => {
			strictEqual(shouldAutomaticallyRetryUnsandboxed({
				...baseRetryOptions,
				requestUnsandboxedExecution: true,
			}), false);
		});

		test('should not retry background, timed-out, successful, or non-sandbox-blocked results', () => {
			strictEqual(shouldAutomaticallyRetryUnsandboxed({
				...baseRetryOptions,
				isBackgroundExecution: true,
			}), false);
			strictEqual(shouldAutomaticallyRetryUnsandboxed({
				...baseRetryOptions,
				didTimeout: true,
			}), false);
			strictEqual(shouldAutomaticallyRetryUnsandboxed({
				...baseRetryOptions,
				exitCode: 0,
			}), false);
			strictEqual(shouldAutomaticallyRetryUnsandboxed({
				...baseRetryOptions,
				output: 'regular command failure',
			}), false);
		});

		test('should not show retry elicitation when prepared invocation was auto-approved', async () => {
			setAutoApprove({ echo: true });

			const preparedInvocation = await executeToolTest({ command: 'echo hello' });
			assertAutoApproved(preparedInvocation);
			const terminalData = preparedInvocation!.toolSpecificData as ITestRunInTerminalToolInvocationData;
			strictEqual(terminalData.requiresConfirmationForRetry, false);

			const shouldRetry = await confirmAutomaticUnsandboxRetry(runInTerminalTool, undefined, 'echo hello', 'bash', undefined, terminalData.requiresConfirmationForRetry);

			strictEqual(shouldRetry, true);
		});

		test('should not show retry elicitation when prepared invocation was session auto-approved', async () => {
			const sessionResource = LocalChatSessionUri.forSession('auto-retry-approval-session');
			instantiationService.stub(IChatWidgetService, {
				getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })) as unknown as IChatWidgetService['getWidgetBySessionResource'],
				lastFocusedWidget: undefined,
			});
			const autoApproveRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
			const preparedInvocation = await autoApproveRunInTerminalTool.prepareToolInvocation({
				parameters: {
					command: 'rm dangerous-file.txt',
					explanation: 'Remove a file',
					goal: 'Remove a file',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams,
				chatSessionResource: sessionResource,
			} as IToolInvocationPreparationContext, CancellationToken.None);

			assertAutoApproved(preparedInvocation);
			const terminalData = preparedInvocation!.toolSpecificData as ITestRunInTerminalToolInvocationData;
			strictEqual(terminalData.requiresConfirmationForRetry, false);

			const shouldRetry = await confirmAutomaticUnsandboxRetry(autoApproveRunInTerminalTool, sessionResource, 'rm dangerous-file.txt', 'bash', undefined, terminalData.requiresConfirmationForRetry);

			strictEqual(shouldRetry, true);
		});

		test('should show retry elicitation when prepared invocation required confirmation', async () => {
			setAutoApprove({});

			const preparedInvocation = await executeToolTest({ command: 'rm dangerous-file.txt' });
			assertConfirmationRequired(preparedInvocation);
			const terminalData = preparedInvocation!.toolSpecificData as ITestRunInTerminalToolInvocationData;
			strictEqual(terminalData.requiresConfirmationForRetry, true);

			const shouldRetry = await confirmAutomaticUnsandboxRetry(runInTerminalTool, undefined, 'rm dangerous-file.txt', 'bash', undefined, terminalData.requiresConfirmationForRetry);

			strictEqual(shouldRetry, false);
		});

		test('should use retry confirmation title without sandbox link', () => {
			const title = getAutomaticUnsandboxRetryTitle(runInTerminalTool, 'bash', undefined);

			strictEqual(title.value, 'Run `bash` command outside the sandbox?');
		});

		test('should use retry confirmation title without sandbox link for blocked domains', () => {
			const title = getAutomaticUnsandboxRetryTitle(runInTerminalTool, 'bash', ['example.com']);

			strictEqual(title.value, 'Run `bash` command outside the sandbox to access `example.com`?');
		});

		test('should show retry elicitation when sandbox force-approved command would otherwise require confirmation', async () => {
			setAutoApprove({});
			sandboxEnabled = true;
			sandboxPrereqResult = {
				enabled: true,
				sandboxConfigPath: '/tmp/vscode-sandbox-settings.json',
				failedCheck: undefined,
			};

			const preparedInvocation = await executeToolTest({ command: 'rm dangerous-file.txt' });

			assertAutoApproved(preparedInvocation);
			const terminalData = preparedInvocation!.toolSpecificData as ITestRunInTerminalToolInvocationData;
			strictEqual(terminalData.commandLine.isSandboxWrapped, true);
			strictEqual(terminalData.requiresConfirmationForRetry, true);

			const shouldRetry = await confirmAutomaticUnsandboxRetry(runInTerminalTool, undefined, 'rm dangerous-file.txt', 'bash', undefined, terminalData.requiresConfirmationForRetry);

			strictEqual(shouldRetry, false);
		});
	});

	suite('default auto-approve rules', () => {
		const defaults = terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default as Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>;

		suiteSetup(() => {
			// Sanity check on entries to make sure that the defaults are actually pulled in
			ok(Object.keys(defaults).length > 50);
		});
		setup(() => {
			setAutoApprove(defaults);
		});

		const autoApprovedTestCases = [
			// Safe commands
			'echo abc',
			'echo "abc"',
			'echo \'abc\'',
			'ls -la',
			'dir',
			'pwd',
			'cat file.txt',
			'head -n 10 file.txt',
			'tail -f log.txt',
			'findstr pattern file.txt',
			'wc -l file.txt',
			'tr a-z A-Z',
			'cut -d: -f1',
			'cmp file1 file2',
			'which node',
			'basename /path/to/file',
			'dirname /path/to/file',
			'realpath .',
			'readlink symlink',
			'stat file.txt',
			'file document.pdf',
			'du -sh folder',
			'df -h',
			'sleep 5',
			'cd /home/user',
			'nl -ba path/to/file.txt',

			// Safe git sub-commands
			'git status',
			'git log --oneline',
			'git show HEAD',
			'git diff main',
			'git grep "TODO"',

			// PowerShell commands
			'Get-ChildItem',
			'Get-Date',
			'Get-Random',
			'Get-Location',
			'Set-Location C:\\Users\\test',
			'Write-Host "Hello"',
			'Write-Output "Test"',
			'Out-String',
			'Split-Path C:\\Users\\test',
			'Join-Path C:\\Users test',
			'Start-Sleep 2',

			// PowerShell safe verbs (regex patterns)
			'Select-Object Name',
			'Measure-Object Length',
			'Compare-Object $a $b',
			'Format-Table',
			'Sort-Object Name',

			// Commands with acceptable arguments
			'column data.txt',
			'date +%Y-%m-%d',
			'find . -name "*.txt"',
			'grep pattern file.txt',
			'rg pattern file.txt',
			'rg --json pattern .',
			'rg -i --color=never "TODO" src/',
			'sed "s/foo/bar/g"',
			'sed -n "1,10p" file.txt',
			'sed -n \'45,80p\' /foo/bar/Example.java',
			'sed -n \'45,80p\' extensions/markdown-language-features/src/test/copyFile.test.ts',
			'sort file.txt',
			'tree directory',

			// od
			'od somefile',
			'od -A x somefile',

			// xxd
			'xxd',
			'xxd somefile',
			'xxd -l100 somefile',
			'xxd -r somefile',
			'xxd -rp somefile',

			// docker readonly sub-commands
			'docker ps',
			'docker ps -a',
			'docker images',
			'docker info',
			'docker version',
			'docker inspect mycontainer',
			'docker logs mycontainer',
			'docker top mycontainer',
			'docker stats',
			'docker port mycontainer',
			'docker diff mycontainer',
			'docker search nginx',
			'docker events',
			'docker container ls',
			'docker container ps',
			'docker container inspect mycontainer',
			'docker image ls',
			'docker image history myimage',
			'docker image inspect myimage',
			'docker network ls',
			'docker network inspect mynetwork',
			'docker volume ls',
			'docker volume inspect myvolume',
			'docker context ls',
			'docker context inspect mycontext',
			'docker context show',
			'docker system df',
			'docker system info',
			'docker compose ps',
			'docker compose ls',
			'docker compose top',
			'docker compose logs',
			'docker compose images',
			'docker compose config',
			'docker compose version',
			'docker compose port',
			'docker compose events',
		];
		const confirmationRequiredTestCases = [
			// git log file output
			'git log --output=log.txt',

			// Dangerous file operations
			'rm README.md',
			'rmdir folder',
			'del file.txt',
			'Remove-Item file.txt',
			'ri file.txt',
			'rd folder',
			'erase file.txt',
			'dd if=/dev/zero of=file',

			// Process management
			'kill 1234',
			'ps aux',
			'top',
			'Stop-Process -Id 1234',
			'spps notepad',
			'taskkill /f /im notepad.exe',
			'taskkill.exe /f /im cmd.exe',

			// Web requests
			'curl https://example.com',
			'wget https://example.com/file',
			'Invoke-RestMethod https://api.example.com',
			'Invoke-WebRequest https://example.com',
			'irm https://example.com',
			'iwr https://example.com',

			// File permissions
			'chmod 755 file.sh',
			'chown user:group file.txt',
			'Set-ItemProperty file.txt IsReadOnly $true',
			'sp file.txt IsReadOnly $true',
			'Set-Acl file.txt $acl',

			// Command execution
			'jq \'.name\' file.json',
			'xargs rm',
			'eval "echo hello"',
			'Invoke-Expression "Get-Date"',
			'iex "Write-Host test"',

			// Commands with dangerous arguments
			'column -c 10000 file.txt',
			'date --set="2023-01-01"',
			'find . -delete',
			'find . -exec rm {} \\;',
			'find . -execdir rm {} \\;',
			'find . -fprint output.txt',
			'rg --pre cat pattern .',
			'rg --hostname-bin hostname pattern .',
			'sed --in-place "s/foo/bar/" file.txt',
			'sed -e "s/a/b/" file.txt',
			'sed -f script.sed file.txt',
			'sed --expression "s/a/b/" file.txt',
			'sed --file script.sed file.txt',
			'sed "s/foo/bar/e" file.txt',
			'sed "s/foo/bar/w output.txt" file.txt',
			'sed ";W output.txt" file.txt',
			'sort -o /etc/passwd file.txt',
			'sort -S 100G file.txt',
			'tree -o output.txt',

			// Transient environment variables
			'ls="test" curl https://api.example.com',
			'API_KEY=secret curl https://api.example.com',
			'HTTP_PROXY=proxy:8080 wget https://example.com',
			'VAR1=value1 VAR2=value2 echo test',
			'A=1 B=2 C=3 ./script.sh',

			// xxd with outfile or ambiguous args
			'xxd infile outfile',
			'xxd -l 100 somefile',

			// docker write/execute sub-commands
			'docker run nginx',
			'docker exec mycontainer bash',
			'docker rm mycontainer',
			'docker rmi myimage',
			'docker build .',
			'docker push myimage',
			'docker pull nginx',
			'docker compose up',
			'docker compose down',
		];

		suite.skip('auto approved', () => {
			for (const command of autoApprovedTestCases) {
				test(command.replaceAll('\n', '\\n'), async () => {
					assertAutoApproved(await executeToolTest({ command }));
				});
			}
		});
		suite('confirmation required', () => {
			for (const command of confirmationRequiredTestCases) {
				test(command.replaceAll('\n', '\\n'), async () => {
					assertConfirmationRequired(await executeToolTest({ command }));
				});
			}
		});
	});

	suite('sandbox bypass requests', () => {
		test('should mention denied domains when sandbox denies network access explicitly', async () => {
			sandboxEnabled = true;
			sandboxPrereqResult = {
				enabled: true,
				sandboxConfigPath: '/tmp/sandbox.json',
				failedCheck: undefined,
			};
			runInTerminalTool.setBackendOs(OperatingSystem.Linux);
			terminalSandboxService.wrapCommand = (command: string) => ({
				command: `unsandboxed:${command}`,
				isSandboxWrapped: false,
				requiresUnsandboxConfirmation: true,
				blockedDomains: ['evil.com'],
				deniedDomains: ['evil.com'],
			});

			const result = await executeToolTest({ command: 'curl https://evil.com' });

			assertConfirmationRequired(result, 'Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing) to access `evil.com`?');
			const confirmationMessage = result?.confirmationMessages?.message;
			ok(confirmationMessage && typeof confirmationMessage !== 'string');
			if (!confirmationMessage || typeof confirmationMessage === 'string') {
				throw new Error('Expected markdown confirmation message');
			}
			ok(confirmationMessage.value.includes('Reason for leaving the sandbox: This command accesses evil.com, which is blocked by chat.agent.deniedNetworkDomains.'));
		});

		test('should force confirmation for explicit unsandboxed execution requests', async () => {
			sandboxEnabled = true;
			sandboxPrereqResult = {
				enabled: true,
				sandboxConfigPath: '/tmp/sandbox.json',
				failedCheck: undefined,
			};
			runInTerminalTool.setBackendOs(OperatingSystem.Linux);

			const result = await executeToolTest({
				requestUnsandboxedExecution: true,
				requestUnsandboxedExecutionReason: 'Needs network access outside the sandbox',
			});

			assertConfirmationRequired(result, 'Run `bash` command outside the [sandbox](https://aka.ms/vscode-sandboxing)?');
			strictEqual(result?.confirmationMessages?.allowAutoConfirm, undefined);
			const terminalData = result?.toolSpecificData as IChatTerminalToolInvocationData;
			strictEqual(terminalData.requestUnsandboxedExecution, true);
			strictEqual(terminalData.requestUnsandboxedExecutionReason, 'Needs network access outside the sandbox');
			strictEqual(terminalData.commandLine.toolEdited, 'unsandboxed:echo hello');

			const confirmationMessage = result?.confirmationMessages?.message;
			ok(confirmationMessage && typeof confirmationMessage !== 'string');
			if (!confirmationMessage || typeof confirmationMessage === 'string') {
				throw new Error('Expected markdown confirmation message');
			}
			ok(confirmationMessage.value.includes('Reason for leaving the sandbox: Needs network access outside the sandbox'));

			strictEqual(result?.confirmationMessages?.disclaimer, undefined);
			const actions = result?.confirmationMessages?.terminalCustomActions;
			ok(actions, 'Expected custom actions to be defined');
			strictEqual(actions.length, 11);
			ok(!isSeparator(actions[0]));
			strictEqual(actions[0].label, 'Allow `echo …` in this Session');
			ok(!isSeparator(actions[4]));
			strictEqual(actions[4].label, 'Allow Exact Command Line in this Session');
			ok(!isSeparator(actions[10]));
			strictEqual(actions[10].label, 'Configure Auto Approve...');
		});
	});

	suite('prepareToolInvocation - auto approval behavior', () => {

		test('should auto-approve commands in allow list', async () => {
			setAutoApprove({
				echo: true
			});

			const result = await executeToolTest({ command: 'echo hello world' });
			assertAutoApproved(result);
		});

		test('should require confirmation for commands not in allow list', async () => {
			setAutoApprove({
				ls: true
			});

			const result = await executeToolTest({
				command: 'rm file.txt',
				explanation: 'Remove a file',
				goal: 'Remove a file'
			});
			assertConfirmationRequired(result, 'Run `bash` command?');
		});

		test('should require confirmation for commands in deny list even if in allow list', async () => {
			setAutoApprove({
				rm: false,
				echo: true
			});

			const result = await executeToolTest({
				command: 'rm dangerous-file.txt',
				explanation: 'Remove a dangerous file',
				goal: 'Remove a dangerous file'
			});
			assertConfirmationRequired(result, 'Run `bash` command?');
		});

		test('should handle background commands with confirmation', async () => {
			setAutoApprove({
				ls: true
			});

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				goal: 'Start watching for file changes',
				mode: 'async'
			});
			assertConfirmationRequired(result, 'Run `bash` command?');
		});

		test('should support legacy isBackground input as async mode', async () => {
			setAutoApprove({
				ls: true
			});

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				goal: 'Start watching for file changes',
				isBackground: true
			});
			assertConfirmationRequired(result, 'Run `bash` command?');
		});

		test('should auto-approve background commands in allow list', async () => {
			setAutoApprove({
				npm: true
			});

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				goal: 'Start watching for file changes',
				mode: 'async'
			});
			assertAutoApproved(result);
		});

		test('should include auto-approve info for background commands', async () => {
			setAutoApprove({
				npm: true
			});

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching for file changes',
				goal: 'Start watching for file changes',
				mode: 'async'
			});
			assertAutoApproved(result);

			// Verify that auto-approve information is included
			ok(result?.toolSpecificData, 'Expected toolSpecificData to be defined');
			const terminalData = result!.toolSpecificData as IChatTerminalToolInvocationData;
			ok(terminalData.autoApproveInfo, 'Expected autoApproveInfo to be defined for auto-approved background command');
			ok(terminalData.autoApproveInfo.value, 'Expected autoApproveInfo to have a value');
			ok(terminalData.autoApproveInfo.value.includes('npm'), 'Expected autoApproveInfo to mention the approved rule');
		});

		test('should handle regex patterns in allow list', async () => {
			setAutoApprove({
				'/^git (status|log)/': true
			});

			const result = await executeToolTest({ command: 'git status --porcelain' });
			assertAutoApproved(result);
		});

		test('should handle complex command chains with sub-commands', async () => {
			setAutoApprove({
				echo: true,
				ls: true
			});

			const result = await executeToolTest({ command: 'echo "hello" && ls -la' });
			assertAutoApproved(result);
		});

		test('should require confirmation when one sub-command is not approved', async () => {
			setAutoApprove({
				echo: true
			});

			const result = await executeToolTest({ command: 'echo "hello" && rm file.txt' });
			assertConfirmationRequired(result);
		});

		test('should handle empty command strings', async () => {
			setAutoApprove({
				echo: true
			});

			const result = await executeToolTest({
				command: '',
				explanation: 'Empty command',
				goal: 'Empty command'
			});
			assertAutoApproved(result);
		});

		test('should handle matchCommandLine: true patterns', async () => {
			setAutoApprove({
				'/dangerous/': { approve: false, matchCommandLine: true },
				'echo': { approve: true, matchCommandLine: true }
			});

			const result1 = await executeToolTest({ command: 'echo hello world' });
			assertAutoApproved(result1);

			const result2 = await executeToolTest({ command: 'echo this is a dangerous command' });
			assertConfirmationRequired(result2);
		});

		test('should only approve when neither sub-commands or command lines are denied', async () => {
			setAutoApprove({
				'foo': true,
				'/^foo$/': { approve: false, matchCommandLine: true },
			});

			const result1 = await executeToolTest({ command: 'foo' });
			assertConfirmationRequired(result1);

			const result2 = await executeToolTest({ command: 'foo bar' });
			assertAutoApproved(result2);
		});
	});

	suite('confirmation title with presentation overrides', () => {
		function injectMockPresenter(tool: TestRunInTerminalTool, languageDisplayName?: string) {
			// Inject a mock presenter at the start that always returns a result
			tool.commandLinePresenters.unshift({
				present: (options) => ({
					commandLine: options.commandLine.forDisplay,
					processOtherPresenters: false,
					languageDisplayName,
				}),
			});
		}

		test('should use withoutLanguage title when presenter returns no languageDisplayName', async () => {
			injectMockPresenter(runInTerminalTool);

			const result = await executeToolTest({
				command: 'rm file.txt',
				explanation: 'Remove a file',
				goal: 'Remove a file'
			});
			assertConfirmationRequired(result, 'Run command in `bash`?');
		});

		test('should use withoutLanguage background title when presenter returns no languageDisplayName', async () => {
			injectMockPresenter(runInTerminalTool);

			const result = await executeToolTest({
				command: 'npm run watch',
				explanation: 'Start watching',
				goal: 'Start watching',
				mode: 'async'
			});
			assertConfirmationRequired(result, 'Run command in `bash`?');
		});

		test('should use withLanguage title when presenter returns languageDisplayName', async () => {
			const result = await executeToolTest({
				command: 'node -e "console.log(1)"',
				explanation: 'Run node command',
				goal: 'Run node command'
			});
			assertConfirmationRequired(result, 'Run `Node.js` command in `bash`?');
		});

		test('should use withLanguage background title when presenter returns languageDisplayName', async () => {
			const result = await executeToolTest({
				command: 'node -e "console.log(1)"',
				explanation: 'Run node command',
				goal: 'Run node command',
				mode: 'async'
			});
			assertConfirmationRequired(result, 'Run `Node.js` command in `bash`?');
		});

		test('should use withoutLanguage inDirectory title when presenter returns no languageDisplayName with cd prefix', async () => {
			const workspaceFolder = URI.file(isWindows ? 'C:\\workspace\\project' : '/workspace/project');
			const workspace = new Workspace('test', [toWorkspaceFolder(workspaceFolder)]);
			workspaceContextService.setWorkspace(workspace);
			instantiationService.stub(IHistoryService, {
				getLastActiveWorkspaceRoot: () => workspaceFolder
			});

			const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));
			injectMockPresenter(toolWithWorkspace);

			const context: IToolInvocationPreparationContext = {
				parameters: {
					command: 'cd /tmp && rm file.txt',
					explanation: 'Remove a file in /tmp',
					goal: 'Remove a file in /tmp',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams
			} as IToolInvocationPreparationContext;
			const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
			assertConfirmationRequired(result, `Run command in \`bash\` within \`${isWindows ? '\\tmp' : '~/tmp'}\`?`);
		});

		test('should use withLanguage inDirectory title when presenter returns languageDisplayName with cd prefix', async () => {
			const workspaceFolder = URI.file(isWindows ? 'C:\\workspace\\project' : '/workspace/project');
			const workspace = new Workspace('test', [toWorkspaceFolder(workspaceFolder)]);
			workspaceContextService.setWorkspace(workspace);
			instantiationService.stub(IHistoryService, {
				getLastActiveWorkspaceRoot: () => workspaceFolder
			});

			const toolWithWorkspace = store.add(instantiationService.createInstance(TestRunInTerminalTool));

			const context: IToolInvocationPreparationContext = {
				parameters: {
					command: 'cd /tmp && node -e "console.log(1)"',
					explanation: 'Run node command in /tmp',
					goal: 'Run node command in /tmp',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams
			} as IToolInvocationPreparationContext;
			const result = await toolWithWorkspace.prepareToolInvocation(context, CancellationToken.None);
			assertConfirmationRequired(result, `Run \`Node.js\` command in \`bash\` within \`${isWindows ? '\\tmp' : '~/tmp'}\`?`);
		});
	});

	suite('prepareToolInvocation - custom actions for dropdown', () => {

		type ActionItemType = { subCommand: SingleOrMany<string>; scope: 'session' | 'workspace' | 'user' } | { commandLine: true; scope: 'session' | 'workspace' | 'user' } | '---' | 'configure' | 'sessionApproval';

		function assertDropdownActions(result: IPreparedToolInvocation | undefined, items: ActionItemType[]) {
			const actions = result?.confirmationMessages?.terminalCustomActions!;
			ok(actions, 'Expected custom actions to be defined');

			strictEqual(actions.length, items.length);

			for (const [i, item] of items.entries()) {
				const action = actions[i];
				if (item === '---') {
					ok(isSeparator(action));
				} else {
					ok(!isSeparator(action));
					if (item === 'configure') {
						strictEqual(action.label, 'Configure Auto Approve...');
						strictEqual(action.data.type, 'configure');
					} else if (item === 'sessionApproval') {
						strictEqual(action.label, 'Allow All Commands in this Session');
						strictEqual(action.data.type, 'sessionApproval');
					} else if (hasKey(item, { commandLine: true })) {
						const expectedLabel = item.scope === 'session' ? 'Allow Exact Command Line in this Session'
							: item.scope === 'workspace' ? 'Allow Exact Command Line in this Workspace'
								: 'Always Allow Exact Command Line';
						strictEqual(action.label, expectedLabel);
						strictEqual(action.data.type, 'newRule');
						ok(!Array.isArray(action.data.rule), 'Expected rule to be an object');
					} else {
						const subCommandLabel = Array.isArray(item.subCommand)
							? `Commands ${item.subCommand.map(e => `\`${e} \u2026\``).join(', ')}`
							: `\`${item.subCommand} \u2026\``;
						const expectedLabel = item.scope === 'session' ? `Allow ${subCommandLabel} in this Session`
							: item.scope === 'workspace' ? `Allow ${subCommandLabel} in this Workspace`
								: `Always Allow ${subCommandLabel}`;
						strictEqual(action.label, expectedLabel);
						strictEqual(action.data.type, 'newRule');
						ok(Array.isArray(action.data.rule), 'Expected rule to be an array');
					}
				}
			}
		}

		test('should generate custom actions for non-auto-approved commands', async () => {
			setAutoApprove({
				ls: true,
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project',
				goal: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: 'npm run build', scope: 'session' },
				{ subCommand: 'npm run build', scope: 'workspace' },
				{ subCommand: 'npm run build', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should generate custom actions for single word commands', async () => {
			const result = await executeToolTest({
				command: 'foo',
				explanation: 'Run foo command',
				goal: 'Run foo command'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo', scope: 'session' },
				{ subCommand: 'foo', scope: 'workspace' },
				{ subCommand: 'foo', scope: 'user' },
				'---',
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not generate custom actions for auto-approved commands', async () => {
			setAutoApprove({
				npm: true
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project',
				goal: 'Build the project'
			});

			assertAutoApproved(result);
		});

		test('should only generate configure action for explicitly denied commands', async () => {
			setAutoApprove({
				npm: { approve: false }
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project',
				goal: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle && in command line labels with proper mnemonic escaping', async () => {
			const result = await executeToolTest({
				command: 'npm install && npm run build',
				explanation: 'Install dependencies and build',
				goal: 'Install dependencies and build'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: ['npm install', 'npm run build'], scope: 'session' },
				{ subCommand: ['npm install', 'npm run build'], scope: 'workspace' },
				{ subCommand: ['npm install', 'npm run build'], scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not show approved commands in custom actions dropdown', async () => {
			setAutoApprove({
				head: true  // head is approved by default in real scenario
			});
			const result = await executeToolTest({
				command: 'foo | head -20',
				explanation: 'Run foo command and show first 20 lines',
				goal: 'Run foo command and show first 20 lines'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: 'foo', scope: 'session' },
				{ subCommand: 'foo', scope: 'workspace' },
				{ subCommand: 'foo', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not show any command-specific actions when all sub-commands are approved', async () => {
			setAutoApprove({
				foo: true,
				head: true
			});
			const result = await executeToolTest({
				command: 'foo | head -20',
				explanation: 'Run foo command and show first 20 lines',
				goal: 'Run foo command and show first 20 lines'
			});

			assertAutoApproved(result);
		});

		test('should handle mixed approved and unapproved commands correctly', async () => {
			setAutoApprove({
				head: true,
				tail: true
			});
			const result = await executeToolTest({
				command: 'foo | head -20 && bar | tail -10',
				explanation: 'Run multiple piped commands',
				goal: 'Run multiple piped commands'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			assertDropdownActions(result, [
				{ subCommand: ['foo', 'bar'], scope: 'session' },
				{ subCommand: ['foo', 'bar'], scope: 'workspace' },
				{ subCommand: ['foo', 'bar'], scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest subcommand for git commands', async () => {
			const result = await executeToolTest({
				command: 'git status',
				explanation: 'Check git status',
				goal: 'Check git status'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'git status', scope: 'session' },
				{ subCommand: 'git status', scope: 'workspace' },
				{ subCommand: 'git status', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest subcommand for npm commands', async () => {
			const result = await executeToolTest({
				command: 'npm test',
				explanation: 'Run npm tests',
				goal: 'Run npm tests'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm test', scope: 'session' },
				{ subCommand: 'npm test', scope: 'workspace' },
				{ subCommand: 'npm test', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest 3-part subcommand for npm run commands', async () => {
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Run build script',
				goal: 'Run build script'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm run build', scope: 'session' },
				{ subCommand: 'npm run build', scope: 'workspace' },
				{ subCommand: 'npm run build', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest 3-part subcommand for yarn run commands', async () => {
			const result = await executeToolTest({
				command: 'yarn run test',
				explanation: 'Run test script',
				goal: 'Run test script'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'yarn run test', scope: 'session' },
				{ subCommand: 'yarn run test', scope: 'workspace' },
				{ subCommand: 'yarn run test', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not suggest subcommand for commands with flags', async () => {
			const result = await executeToolTest({
				command: 'foo --foo --bar',
				explanation: 'Run foo with flags',
				goal: 'Run foo with flags'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo', scope: 'session' },
				{ subCommand: 'foo', scope: 'workspace' },
				{ subCommand: 'foo', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not suggest subcommand for npm run with flags', async () => {
			const result = await executeToolTest({
				command: 'npm run abc --some-flag',
				explanation: 'Run npm run abc with flags',
				goal: 'Run npm run abc with flags'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm run abc', scope: 'session' },
				{ subCommand: 'npm run abc', scope: 'workspace' },
				{ subCommand: 'npm run abc', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle mixed npm run and other commands', async () => {
			const result = await executeToolTest({
				command: 'npm run build && git status',
				explanation: 'Build and check status',
				goal: 'Build and check status'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: ['npm run build', 'git status'], scope: 'session' },
				{ subCommand: ['npm run build', 'git status'], scope: 'workspace' },
				{ subCommand: ['npm run build', 'git status'], scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest mixed subcommands and base commands', async () => {
			const result = await executeToolTest({
				command: 'git push && echo "done"',
				explanation: 'Push and print done',
				goal: 'Push and print done'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: ['git push', 'echo'], scope: 'session' },
				{ subCommand: ['git push', 'echo'], scope: 'workspace' },
				{ subCommand: ['git push', 'echo'], scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest subcommands for multiple git commands', async () => {
			const result = await executeToolTest({
				command: 'git status && git log --oneline',
				explanation: 'Check status and log',
				goal: 'Check status and log'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: ['git status', 'git log'], scope: 'session' },
				{ subCommand: ['git status', 'git log'], scope: 'workspace' },
				{ subCommand: ['git status', 'git log'], scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should suggest base command for non-subcommand tools', async () => {
			const result = await executeToolTest({
				command: 'foo bar',
				explanation: 'Download from example.com',
				goal: 'Download from example.com'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo', scope: 'session' },
				{ subCommand: 'foo', scope: 'workspace' },
				{ subCommand: 'foo', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle single word commands from subcommand-aware tools', async () => {
			const result = await executeToolTest({
				command: 'git',
				explanation: 'Run git command',
				goal: 'Run git command'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should deduplicate identical subcommand suggestions', async () => {
			const result = await executeToolTest({
				command: 'npm test && npm test --verbose',
				explanation: 'Run tests twice',
				goal: 'Run tests twice'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'npm test', scope: 'session' },
				{ subCommand: 'npm test', scope: 'workspace' },
				{ subCommand: 'npm test', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should handle flags differently than subcommands for suggestion logic', async () => {
			const result = await executeToolTest({
				command: 'foo --version',
				explanation: 'Check foo version',
				goal: 'Check foo version'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ subCommand: 'foo', scope: 'session' },
				{ subCommand: 'foo', scope: 'workspace' },
				{ subCommand: 'foo', scope: 'user' },
				'---',
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not suggest overly permissive subcommand rules', async () => {
			const result = await executeToolTest({
				command: 'bash -c "echo hello"',
				explanation: 'Run bash command',
				goal: 'Run bash command'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				{ commandLine: true, scope: 'session' },
				{ commandLine: true, scope: 'workspace' },
				{ commandLine: true, scope: 'user' },
				'---',
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should not show command line option when it\'s rejected', async () => {
			setAutoApprove({
				echo: true,
				'/\\(.+\\)/s': { approve: false, matchCommandLine: true }
			});

			const result = await executeToolTest({
				command: 'echo (abc)'
			});

			assertConfirmationRequired(result);
			assertDropdownActions(result, [
				'sessionApproval',
				'---',
				'configure',
			]);
		});

		test('should prevent auto approval when writing to a file outside the workspace', async () => {
			setConfig(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');
			setAutoApprove({});

			const workspaceFolder = URI.file(isWindows ? 'C:/workspace/project' : '/workspace/project');
			const workspace = new Workspace('test', [toWorkspaceFolder(workspaceFolder)]);
			workspaceContextService.setWorkspace(workspace);
			instantiationService.stub(IHistoryService, {
				getLastActiveWorkspaceRoot: () => workspaceFolder
			});

			const result = await executeToolTest({
				command: 'echo "abc" > ../file.txt'
			});

			assertConfirmationRequired(result);
			strictEqual(result?.confirmationMessages?.terminalCustomActions, undefined, 'Expected no custom actions when file write is blocked');
		});
	});

	suite('chat session disposal cleanup', () => {
		const createMockTerminal = (processId: number): ITerminalInstance => ({
			dispose: () => { /* Mock dispose */ },
			processId
		} as unknown as ITerminalInstance);

		test('should restore all terminals into the session terminal map and dispose them when archived', () => {
			const sessionId = 'test-session-restored-archive';
			const sessionResource = LocalChatSessionUri.forSession(sessionId);

			let terminal1Disposed = false;
			let terminal2Disposed = false;
			const terminal1DisposedEmitter = new Emitter<void>();
			const terminal2DisposedEmitter = new Emitter<void>();
			const mockTerminal1 = {
				dispose: () => {
					terminal1Disposed = true;
					terminal1DisposedEmitter.fire();
				},
				onDisposed: terminal1DisposedEmitter.event,
				processId: 55555,
			} as unknown as ITerminalInstance;
			const mockTerminal2 = {
				dispose: () => {
					terminal2Disposed = true;
					terminal2DisposedEmitter.fire();
				},
				onDisposed: terminal2DisposedEmitter.event,
				processId: 66666,
			} as unknown as ITerminalInstance;

			storageService.store('chat.terminalSessions', JSON.stringify({
				[mockTerminal1.processId!]: {
					sessionId,
					id: 'restored-1',
					shellIntegrationQuality: ShellIntegrationQuality.None,
					isBackground: true,
				},
				[mockTerminal2.processId!]: {
					sessionId,
					id: 'restored-2',
					shellIntegrationQuality: ShellIntegrationQuality.None,
					isBackground: false,
				}
			}), StorageScope.WORKSPACE, StorageTarget.USER);

			instantiationService.stub(ITerminalService, {
				onDidDisposeInstance: terminalServiceDisposeEmitter.event,
				instances: [mockTerminal1, mockTerminal2],
				setNextCommandId: async () => { }
			});

			const restoredRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
			const restoredSessionTerminals = restoredRunInTerminalTool.sessionTerminalInstances.get(sessionResource);
			strictEqual(restoredSessionTerminals?.size, 2, 'Both restored terminals should be tracked for the session');

			chatSessionArchivedEmitter.fire({
				resource: sessionResource,
				isArchived: () => true,
			} as unknown as IAgentSession);

			strictEqual(terminal1Disposed, true, 'Restored background terminal should have been disposed');
			strictEqual(terminal2Disposed, true, 'Restored foreground terminal should have been disposed');
			ok(!restoredRunInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Foreground terminal association should be removed after archive');
			ok(!restoredRunInTerminalTool.sessionTerminalInstances.has(sessionResource), 'All restored terminals for the session should be removed after archive');
		});

		test('should dispose all terminals associated with a single chat session when archived', () => {
			const sessionId = 'test-session-archive';
			const sessionResource = LocalChatSessionUri.forSession(sessionId);
			const mockTerminal1 = { dispose: () => { /* Mock dispose */ }, processId: 33333 } as unknown as ITerminalInstance;
			const mockTerminal2 = { dispose: () => { /* Mock dispose */ }, processId: 44444 } as unknown as ITerminalInstance;

			let terminal1Disposed = false;
			let terminal2Disposed = false;
			mockTerminal1.dispose = () => { terminal1Disposed = true; };
			mockTerminal2.dispose = () => { terminal2Disposed = true; };

			runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
				instance: mockTerminal2,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});
			runInTerminalTool.sessionTerminalInstances.set(sessionResource, new Set([mockTerminal1, mockTerminal2]));

			// Initialize lazy archive listener before firing the archive event.
			const ensureArchivedSessionListener = (runInTerminalTool as unknown as Record<string, () => void>)['_ensureArchivedSessionListener'];
			ensureArchivedSessionListener.call(runInTerminalTool);

			chatSessionArchivedEmitter.fire({
				resource: sessionResource,
				isArchived: () => true,
			} as unknown as IAgentSession);

			strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
			strictEqual(terminal2Disposed, true, 'Terminal 2 should have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should be removed after archive');
			ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), 'All tracked terminals for the session should be removed after archive');
		});

		test('should not access agent sessions model when initializing archive listener', () => {
			let modelAccessed = false;
			instantiationService.stub(IAgentSessionsService, {
				onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
				get model() {
					modelAccessed = true;
					throw new Error('model should not be accessed when wiring archive listener');
				},
			} as unknown as IAgentSessionsService);

			const noModelAccessRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
			const ensureArchivedSessionListener = (noModelAccessRunInTerminalTool as unknown as Record<string, () => void>)['_ensureArchivedSessionListener'];
			ensureArchivedSessionListener.call(noModelAccessRunInTerminalTool);

			strictEqual(modelAccessed, false, 'Agent sessions model should not be accessed when initializing archive listener');
		});

		test('should dispose all terminals associated with a single chat session', () => {
			const sessionId = 'test-session-multiple-terminals';
			const mockTerminal1 = createMockTerminal(11111);
			const mockTerminal2 = createMockTerminal(22222);

			let terminal1Disposed = false;
			let terminal2Disposed = false;
			mockTerminal1.dispose = () => { terminal1Disposed = true; };
			mockTerminal2.dispose = () => { terminal2Disposed = true; };

			const sessionResource = LocalChatSessionUri.forSession(sessionId);
			runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
				instance: mockTerminal2,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});
			runInTerminalTool.sessionTerminalInstances.set(sessionResource, new Set([mockTerminal1, mockTerminal2]));

			chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: 'cleared' });

			strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
			strictEqual(terminal2Disposed, true, 'Terminal 2 should have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should be removed after disposal');
			ok(!runInTerminalTool.sessionTerminalInstances.has(sessionResource), 'All tracked terminals for the session should be removed after disposal');
		});

		test('should dispose associated terminals when chat session is disposed', () => {
			const sessionId = 'test-session-123';
			const mockTerminal = createMockTerminal(12345);
			let terminalDisposed = false;
			mockTerminal.dispose = () => { terminalDisposed = true; };

			const sessionResource = LocalChatSessionUri.forSession(sessionId);
			runInTerminalTool.sessionTerminalAssociations.set(sessionResource, {
				instance: mockTerminal,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});

			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should exist before disposal');

			chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource], reason: 'cleared' });

			strictEqual(terminalDisposed, true, 'Terminal should have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource), 'Terminal association should be removed after disposal');
		});

		test('should not affect other sessions when one session is disposed', () => {
			const sessionId1 = 'test-session-1';
			const sessionId2 = 'test-session-2';
			const mockTerminal1 = createMockTerminal(12345);
			const mockTerminal2 = createMockTerminal(67890);

			let terminal1Disposed = false;
			let terminal2Disposed = false;
			mockTerminal1.dispose = () => { terminal1Disposed = true; };
			mockTerminal2.dispose = () => { terminal2Disposed = true; };

			const sessionResource1 = LocalChatSessionUri.forSession(sessionId1);
			const sessionResource2 = LocalChatSessionUri.forSession(sessionId2);
			runInTerminalTool.sessionTerminalAssociations.set(sessionResource1, {
				instance: mockTerminal1,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});
			runInTerminalTool.sessionTerminalAssociations.set(sessionResource2, {
				instance: mockTerminal2,
				shellIntegrationQuality: ShellIntegrationQuality.None
			});

			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), 'Session 1 terminal association should exist');
			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), 'Session 2 terminal association should exist');

			chatServiceDisposeEmitter.fire({ sessionResources: [sessionResource1], reason: 'cleared' });

			strictEqual(terminal1Disposed, true, 'Terminal 1 should have been disposed');
			strictEqual(terminal2Disposed, false, 'Terminal 2 should NOT have been disposed');
			ok(!runInTerminalTool.sessionTerminalAssociations.has(sessionResource1), 'Session 1 terminal association should be removed');
			ok(runInTerminalTool.sessionTerminalAssociations.has(sessionResource2), 'Session 2 terminal association should remain');
		});

		test('should handle disposal of non-existent session gracefully', () => {
			strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist initially');
			chatServiceDisposeEmitter.fire({ sessionResources: [LocalChatSessionUri.forSession('non-existent-session')], reason: 'cleared' });
			strictEqual(runInTerminalTool.sessionTerminalAssociations.size, 0, 'No associations should exist after handling non-existent session');
		});
	});

	test('should dedupe rapid repeated background input-needed notifications', () => {
		const termId = 'test-input-needed-term';
		const sessionResource = LocalChatSessionUri.forSession('test-input-needed-session');
		let output = 'Enter value:';

		const commandFinishedEmitter = new Emitter<{ exitCode: number | undefined }>();
		const terminalDisposedEmitter = new Emitter<void>();
		const inputNeededEmitter = new Emitter<void>();
		const inputDataEmitter = new Emitter<string>();

		const terminalInstance = {
			capabilities: {
				get: (cap: TerminalCapability) => cap === TerminalCapability.CommandDetection ? { onCommandFinished: commandFinishedEmitter.event } : undefined,
			},
			onDisposed: terminalDisposedEmitter.event,
			onDidInputData: inputDataEmitter.event,
		} as unknown as ITerminalInstance;

		const outputMonitor = {
			onDidDetectInputNeeded: inputNeededEmitter.event,
			continueMonitoringAsync: () => { },
			dispose: () => { },
		} as unknown as { onDidDetectInputNeeded: Event<void>; continueMonitoringAsync: () => void; dispose: () => void };

		(runInTerminalTool.constructor as unknown as { _activeExecutions: Map<string, { getOutput(): string }> })._activeExecutions.set(termId, {
			getOutput: () => output,
		});

		// eslint-disable-next-line @typescript-eslint/naming-convention
		(runInTerminalTool as unknown as { _registerCompletionNotification: (terminal: ITerminalInstance, termId: string, session: URI, commandName: string, outputMonitor: { onDidDetectInputNeeded: Event<void>; continueMonitoringAsync: () => void; dispose: () => void }) => void })
			._registerCompletionNotification(terminalInstance, termId, sessionResource, 'npm init', outputMonitor);

		inputNeededEmitter.fire();
		inputNeededEmitter.fire();
		strictEqual(capturedSteeringRequests.length, 1, 'Expected duplicate rapid input-needed events to be suppressed');

		output = 'Confirm (y/N):';
		inputNeededEmitter.fire();
		strictEqual(capturedSteeringRequests.length, 2, 'Expected a changed prompt to trigger a new notification');
	});

	suite('auto approve warning acceptance mechanism', () => {
		test('should require confirmation for auto-approvable commands when warning not accepted', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
			setAutoApprove({
				echo: true
			});

			clearAutoApproveWarningAcceptedState();

			assertConfirmationRequired(await executeToolTest({ command: 'echo hello world' }), 'Run `bash` command?');
		});

		test('should include autoApproveInfo when command would be auto-approved but warning not accepted', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
			setAutoApprove({
				echo: true
			});

			clearAutoApproveWarningAcceptedState();

			const result = await executeToolTest({ command: 'echo hello world' });
			assertConfirmationRequired(result, 'Run `bash` command?');

			// autoApproveInfo should be set so the confirmation widget knows to auto-approve
			// after the user accepts the warning modal
			const terminalData = result!.toolSpecificData as IChatTerminalToolInvocationData;
			ok(terminalData.autoApproveInfo, 'autoApproveInfo should be set for commands that would be auto-approved');
		});

		test('should auto-approve commands when both auto-approve enabled and warning accepted', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
			setAutoApprove({
				echo: true
			});

			assertAutoApproved(await executeToolTest({ command: 'echo hello world' }));
		});

		test('should require confirmation when auto-approve disabled regardless of warning acceptance', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
			setAutoApprove({
				echo: true
			});

			const result = await executeToolTest({ command: 'echo hello world' });
			assertConfirmationRequired(result, 'Run `bash` command?');
		});
	});

	suite('unique rules deduplication', () => {
		test('should properly deduplicate rules with same sourceText in auto-approve info', async () => {
			setAutoApprove({
				echo: true
			});

			const result = await executeToolTest({ command: 'echo hello && echo world' });
			assertAutoApproved(result);

			const autoApproveInfo = (result!.toolSpecificData as IChatTerminalToolInvocationData).autoApproveInfo!;
			ok(autoApproveInfo);
			ok(autoApproveInfo.value.includes('Auto approved by rule '), 'should contain singular "rule", not plural');
			strictEqual(count(autoApproveInfo.value, 'echo'), 1);
		});
	});

	suite('session auto approval', () => {
		test('should auto approve all commands when session has auto approval enabled', async () => {
			const sessionId = 'test-session-123';
			const sessionResource = LocalChatSessionUri.forSession(sessionId);
			const terminalChatService = instantiationService.get(ITerminalChatService);

			const context: IToolInvocationPreparationContext = {
				parameters: {
					command: 'rm dangerous-file.txt',
					explanation: 'Remove a file',
					goal: 'Remove a file',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams,
				chatSessionResource: sessionResource
			} as IToolInvocationPreparationContext;

			let result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
			assertConfirmationRequired(result);

			terminalChatService.setChatSessionAutoApproval(sessionResource, true);

			result = await runInTerminalTool.prepareToolInvocation(context, CancellationToken.None);
			assertAutoApproved(result);

			const terminalData = result!.toolSpecificData as IChatTerminalToolInvocationData;
			ok(terminalData.autoApproveInfo, 'Expected autoApproveInfo to be defined');
			ok(terminalData.autoApproveInfo.value.includes('Auto approved for this session'), 'Expected session approval message');
		});

		test('should bypass terminal auto-approve feature in Autopilot mode', async () => {
			setAutoApprove({
				curl: false
			});

			const sessionResource = LocalChatSessionUri.forSession('autopilot-session');
			instantiationService.stub(IChatWidgetService, {
				getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.Autopilot } } })) as unknown as IChatWidgetService['getWidgetBySessionResource'],
				lastFocusedWidget: undefined,
			});

			const autopilotRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
			const result = await autopilotRunInTerminalTool.prepareToolInvocation({
				parameters: {
					command: 'curl https://example.com',
					explanation: 'Fetch a URL',
					goal: 'Download content',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams,
				chatSessionResource: sessionResource,
			} as IToolInvocationPreparationContext, CancellationToken.None);

			assertAutoApproved(result);
			const terminalData = result!.toolSpecificData as IChatTerminalToolInvocationData;
			strictEqual(terminalData.autoApproveInfo, undefined, 'Expected no terminal auto-approve info in Autopilot mode');
		});

		test('should bypass terminal auto-approve feature in Bypass Approvals mode', async () => {
			setAutoApprove({
				curl: false
			});

			const sessionResource = LocalChatSessionUri.forSession('bypass-session');
			instantiationService.stub(IChatWidgetService, {
				getWidgetBySessionResource: (() => ({ input: { currentModeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } } })) as unknown as IChatWidgetService['getWidgetBySessionResource'],
				lastFocusedWidget: undefined,
			});

			const bypassRunInTerminalTool = store.add(instantiationService.createInstance(TestRunInTerminalTool));
			const result = await bypassRunInTerminalTool.prepareToolInvocation({
				parameters: {
					command: 'curl https://example.com',
					explanation: 'Fetch a URL',
					goal: 'Download content',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams,
				chatSessionResource: sessionResource,
			} as IToolInvocationPreparationContext, CancellationToken.None);

			assertAutoApproved(result);
			const terminalData = result!.toolSpecificData as IChatTerminalToolInvocationData;
			strictEqual(terminalData.autoApproveInfo, undefined, 'Expected no terminal auto-approve info in Bypass Approvals mode');
		});
	});

	suite('TerminalProfileFetcher', () => {
		suite('getCopilotProfile', () => {
			(isWindows ? test : test.skip)('should return custom profile when configured', async () => {
				runInTerminalTool.setBackendOs(OperatingSystem.Windows);
				const customProfile = Object.freeze({ path: 'C:\\Windows\\System32\\powershell.exe', args: ['-NoProfile'] });
				setConfig(TerminalChatAgentToolsSettingId.TerminalProfileWindows, customProfile);

				const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
				strictEqual(result, customProfile);
			});

			(isLinux ? test : test.skip)('should fall back to default shell when no custom profile is configured', async () => {
				runInTerminalTool.setBackendOs(OperatingSystem.Linux);
				setConfig(TerminalChatAgentToolsSettingId.TerminalProfileLinux, null);

				const result = await runInTerminalTool.profileFetcher.getCopilotProfile();
				strictEqual(typeof result, 'object');
				strictEqual((result as ITerminalProfile).path, 'bash');
			});
		});
	});

	suite('denial info in disclaimers', () => {
		function getDisclaimerValue(disclaimer: string | IMarkdownString | undefined): string | undefined {
			if (!disclaimer) {
				return undefined;
			}
			return typeof disclaimer === 'string' ? disclaimer : disclaimer.value;
		}

		test('should include denial reason in disclaimer when command is denied by rule', async () => {
			setAutoApprove({
				npm: { approve: false }
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project',
				goal: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
			ok(disclaimerValue, 'Expected disclaimer to be defined');
			ok(disclaimerValue.includes('denied'), 'Expected disclaimer to mention denial');
			ok(disclaimerValue.includes('npm'), 'Expected disclaimer to mention the denied rule');
		});

		test('should include link to settings in denial disclaimer', async () => {
			setAutoApprove({
				rm: { approve: false }
			});
			const result = await executeToolTest({
				command: 'rm -rf temp',
				explanation: 'Remove temp folder',
				goal: 'Remove temp folder'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			ok(result?.confirmationMessages?.disclaimer, 'Expected disclaimer to be defined');
			// The disclaimer should have trusted commands enabled for settings links
			const disclaimer = result.confirmationMessages.disclaimer;
			ok(typeof disclaimer !== 'string' && disclaimer.isTrusted, 'Expected disclaimer to be trusted for command links');
		});

		test('should include denial reason for multiple denied sub-commands', async () => {
			setAutoApprove({
				rm: { approve: false },
				sudo: { approve: false }
			});
			const result = await executeToolTest({
				command: 'sudo rm -rf /',
				explanation: 'Dangerous command',
				goal: 'Dangerous command'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
			ok(disclaimerValue, 'Expected disclaimer to be defined');
			ok(disclaimerValue.includes('denied'), 'Expected disclaimer to mention denial');
		});

		test('should not include denial info when auto-approve is disabled', async () => {
			setConfig(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);
			setAutoApprove({
				npm: { approve: false }
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project',
				goal: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			// When auto-approve is disabled, there should be no denial-related disclaimer
			const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
			if (disclaimerValue) {
				ok(!disclaimerValue.includes('denied'), 'Should not mention denial when auto-approve is disabled');
			}
		});

		test('should not include denial info for commands that are simply not approved', async () => {
			// Command is not in auto-approve list, but not explicitly denied
			setAutoApprove({
				echo: true
			});
			const result = await executeToolTest({
				command: 'npm run build',
				explanation: 'Build the project',
				goal: 'Build the project'
			});

			assertConfirmationRequired(result, 'Run `bash` command?');
			// There should be no denial disclaimer since npm is not explicitly denied
			const disclaimerValue = getDisclaimerValue(result?.confirmationMessages?.disclaimer);
			if (disclaimerValue) {
				ok(!disclaimerValue.includes('denied'), 'Should not mention denial for non-denied commands');
			}
		});
	});

	suite('ConfirmTerminalCommandTool', () => {
		test('should require confirmation when sandbox is enabled but sandbox rewriting is disabled', async () => {
			sandboxEnabled = true;

			const { ConfirmTerminalCommandTool } = await import('../../browser/tools/runInTerminalConfirmationTool.js');
			const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));

			const context: IToolInvocationPreparationContext = {
				parameters: {
					command: 'ping google.com',
					explanation: 'Ping google.com',
					goal: 'Ping google.com',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams
			} as IToolInvocationPreparationContext;

			const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
			assertConfirmationRequired(result);
		});

		test('should require confirmation when sandbox is disabled', async () => {
			sandboxEnabled = false;
			setAutoApprove({});

			const { ConfirmTerminalCommandTool } = await import('../../browser/tools/runInTerminalConfirmationTool.js');
			const confirmTool = store.add(instantiationService.createInstance(ConfirmTerminalCommandTool));

			const context: IToolInvocationPreparationContext = {
				parameters: {
					command: 'echo hello',
					explanation: 'Print hello',
					goal: 'Print hello',
					mode: 'sync',
					timeout: 30000,
				} as IRunInTerminalInputParams
			} as IToolInvocationPreparationContext;

			const result = await confirmTool.prepareToolInvocation(context, CancellationToken.None);
			assertConfirmationRequired(result);
		});
	});
});

suite('ChatAgentToolsContribution - tool registration refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let registeredToolData: Map<string, IToolData>;
	let sandboxEnabled: boolean;

	setup(() => {
		configurationService = new TestConfigurationService();
		registeredToolData = new Map();
		sandboxEnabled = false;

		const logService = new NullLogService();
		const fileService = store.add(new FileService(logService));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		const terminalServiceDisposeEmitter = store.add(new Emitter<ITerminalInstance>());
		const chatServiceDisposeEmitter = store.add(new Emitter<{ sessionResources: URI[]; reason: 'cleared' }>());
		const chatSessionArchivedEmitter = store.add(new Emitter<IAgentSession>());

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
			fileService: () => fileService,
		}, store);

		instantiationService.stub(IChatService, {
			onDidDisposeSession: chatServiceDisposeEmitter.event,
			getSession: () => undefined,
		});
		instantiationService.stub(IAgentSessionsService, {
			onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
			model: {
				onDidChangeSessionArchivedState: chatSessionArchivedEmitter.event,
			} as IAgentSessionsService['model']
		});
		const terminalInstancesChangedEmitter = store.add(new Emitter<void>());
		instantiationService.stub(ITerminalService, {
			onDidDisposeInstance: terminalServiceDisposeEmitter.event,
			onDidChangeInstances: terminalInstancesChangedEmitter.event,
			setNextCommandId: async () => { }
		});
		instantiationService.stub(ITerminalChatService, store.add(instantiationService.createInstance(TerminalChatService)));
		instantiationService.stub(IHistoryService, {
			getLastActiveWorkspaceRoot: () => undefined
		});

		const terminalSandboxService: ITerminalSandboxService = {
			_serviceBrand: undefined,
			isEnabled: async () => sandboxEnabled,
			wrapCommand: (command: string) => ({
				command: `sandbox:${command}`,
				isSandboxWrapped: true,
			}),
			getSandboxConfigPath: async () => sandboxEnabled ? '/tmp/sandbox.json' : undefined,
			checkForSandboxingPrereqs: async () => ({ enabled: sandboxEnabled, sandboxConfigPath: sandboxEnabled ? '/tmp/sandbox.json' : undefined, failedCheck: undefined }),
			getTempDir: () => undefined,
			setNeedsForceUpdateConfigFile: () => { },
			getOS: async () => OperatingSystem.Linux,
			getResolvedNetworkDomains: () => ({ allowedDomains: [], deniedDomains: [] }),
			getMissingSandboxDependencies: async () => [],
			installMissingSandboxDependencies: async () => ({ exitCode: 0 }),
		};
		instantiationService.stub(ITerminalSandboxService, terminalSandboxService);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		instantiationService.stub(ITerminalProfileResolverService, {
			getDefaultProfile: async () => ({ path: 'bash' } as ITerminalProfile)
		});

		const contextKeyService = instantiationService.get(IContextKeyService);
		const registeredToolImpls = new Map<string, IToolImpl>();
		const mockToolsService: Partial<ILanguageModelToolsService> = {
			_serviceBrand: undefined,
			onDidChangeTools: Event.None,
			registerToolData(toolData: IToolData) {
				registeredToolData.set(toolData.id, toolData);
				return toDisposable(() => registeredToolData.delete(toolData.id));
			},
			registerToolImplementation(id: string, tool: IToolImpl) {
				registeredToolImpls.set(id, tool);
				return toDisposable(() => registeredToolImpls.delete(id));
			},
			registerTool(toolData: IToolData, tool: IToolImpl) {
				registeredToolData.set(toolData.id, toolData);
				registeredToolImpls.set(toolData.id, tool);
				return toDisposable(() => {
					registeredToolData.delete(toolData.id);
					registeredToolImpls.delete(toolData.id);
					if (isDisposable(tool)) {
						tool.dispose();
					}
				});
			},
			getTools() {
				return registeredToolData.values();
			},
			executeToolSet: new ToolSet('execute', 'execute', Codicon.play, ToolDataSource.Internal, undefined, undefined, contextKeyService),
			readToolSet: new ToolSet('read', 'read', Codicon.book, ToolDataSource.Internal, undefined, undefined, contextKeyService),
		};
		instantiationService.stub(ILanguageModelToolsService, mockToolsService as ILanguageModelToolsService);
	});

	async function flushAsync(): Promise<void> {
		// Multiple microtask cycles to let async _registerRunInTerminalTool complete
		for (let i = 0; i < 10; i++) {
			await new Promise<void>(resolve => setTimeout(resolve, 0));
		}
	}

	async function createContribution(): Promise<ChatAgentToolsContribution> {
		const contribution = store.add(instantiationService.createInstance(ChatAgentToolsContribution));
		await flushAsync();
		return contribution;
	}

	test('should register run_in_terminal tool on construction', async () => {
		await createContribution();
		ok(registeredToolData.has(TerminalToolId.RunInTerminal), 'Expected run_in_terminal tool to be registered');
	});

	test('should refresh run_in_terminal tool data when sandbox setting changes', async () => {
		await createContribution();

		const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
		ok(toolDataBefore, 'Expected run_in_terminal tool to be registered');
		const propertiesBefore = toolDataBefore.inputSchema?.properties as Record<string, object> | undefined;
		ok(!propertiesBefore?.['requestUnsandboxedExecution'], 'Expected no requestUnsandboxedExecution before enabling sandbox');

		// Enable sandbox and fire config change
		sandboxEnabled = true;
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AgentSandboxEnabled, TerminalChatAgentToolsSandboxEnabledValue.On);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === TerminalChatAgentToolsSettingId.AgentSandboxEnabled,
			affectedKeys: new Set([TerminalChatAgentToolsSettingId.AgentSandboxEnabled]),
			source: ConfigurationTarget.USER,
			change: null!,
		});

		// Wait for async registration
		await flushAsync();

		const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
		ok(toolDataAfter, 'Expected run_in_terminal tool to still be registered');
		const propertiesAfter = toolDataAfter.inputSchema?.properties as Record<string, object> | undefined;
		ok(propertiesAfter?.['requestUnsandboxedExecution'], 'Expected requestUnsandboxedExecution after enabling sandbox');
	});

	test('should refresh run_in_terminal tool data when sandbox network setting changes', async () => {
		sandboxEnabled = true;
		await createContribution();

		const toolDataBefore = registeredToolData.get(TerminalToolId.RunInTerminal);
		ok(toolDataBefore, 'Expected run_in_terminal tool to be registered');

		// Fire network config change
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === AgentNetworkDomainSettingId.AllowedNetworkDomains,
			affectedKeys: new Set([AgentNetworkDomainSettingId.AllowedNetworkDomains]),
			source: ConfigurationTarget.USER,
			change: null!,
		});

		// Wait for async registration
		await flushAsync();

		const toolDataAfter = registeredToolData.get(TerminalToolId.RunInTerminal);
		ok(toolDataAfter, 'Expected run_in_terminal tool to still be registered after network setting change');
	});
});
