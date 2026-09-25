/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IToolInvocation, IToolInvocationPreparationContext } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITaskService, Task } from '../../../../tasks/common/taskService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { CreateAndRunTaskTool } from '../../browser/tools/task/createAndRunTaskTool.js';

suite('CreateAndRunTaskTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const workspaceFolder = URI.file('/workspace');
	const parameters = {
		workspaceFolder: workspaceFolder.fsPath,
		task: {
			label: 'build',
			type: 'shell',
			command: 'npm',
			args: ['run', 'build'],
		}
	};

	function createTool(options: { tasks?: Task[]; activeTasks?: Task[]; workspaceFolder?: URI } = {}) {
		const fileOperations: string[] = [];
		let runCount = 0;
		const tasksService = {
			tasks: async () => options.tasks ?? [],
			getActiveTasks: async () => options.activeTasks ?? [],
			run: async () => { runCount++; },
		} as unknown as ITaskService;
		const fileService = {
			exists: async (resource: URI) => {
				fileOperations.push(`exists:${resource.toString()}`);
				return false;
			},
			createFile: async (resource: URI) => {
				fileOperations.push(`createFile:${resource.toString()}`);
			},
		} as unknown as IFileService;
		const folder = options.workspaceFolder ?? workspaceFolder;
		const tool = new CreateAndRunTaskTool(
			tasksService,
			{} as ITelemetryService,
			{ instances: [] } as unknown as ITerminalService,
			fileService,
			{} as IConfigurationService,
			{} as IInstantiationService,
			{ getWorkspace: () => ({ folders: [{ uri: folder }] }) } as IWorkspaceContextService,
			{ extUri } as unknown as IUriIdentityService,
		);
		return { tool, fileOperations, getRunCount: () => runCount };
	}

	function invocation(overrides: Partial<IToolInvocation> = {}): IToolInvocation {
		return {
			callId: 'call',
			toolId: 'create_and_run_task',
			parameters,
			context: { sessionResource: URI.parse('vscode-chat-session://test') },
			...overrides,
		};
	}

	function preparationContext(overrides: Partial<IToolInvocationPreparationContext> = {}): IToolInvocationPreparationContext {
		return {
			parameters,
			toolCallId: 'call',
			chatSessionResource: URI.parse('vscode-chat-session://test'),
			...overrides,
		};
	}

	test('rejects an existing task without writing or running', async () => {
		const existingTask = { _label: parameters.task.label } as Task;
		const { tool, fileOperations, getRunCount } = createTool({ tasks: [existingTask] });

		const result = await tool.invoke(invocation(), async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.content[0],
			fileOperations,
			runCount: getRunCount(),
		}, {
			message: { kind: 'text', value: 'Task \'build\' already exists. Use the run task tool to run it.' },
			fileOperations: [],
			runCount: 0,
		});
	});

	test('rejects an active task without writing or running', async () => {
		const activeTask = { _label: parameters.task.label } as Task;
		const { tool, fileOperations, getRunCount } = createTool({ activeTasks: [activeTask] });

		const result = await tool.invoke(invocation(), async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.content[0],
			fileOperations,
			runCount: getRunCount(),
		}, {
			message: { kind: 'text', value: 'Task \'build\' is already running.' },
			fileOperations: [],
			runCount: 0,
		});
	});

	test('rejects a workspace folder outside the invocation working directory', async () => {
		const { tool, fileOperations, getRunCount } = createTool();
		const outsideParameters = { ...parameters, workspaceFolder: '/outside' };

		const result = await tool.invoke(invocation({
			parameters: outsideParameters,
			context: {
				sessionResource: URI.parse('vscode-chat-session://test'),
				workingDirectory: workspaceFolder,
			},
		}), async () => 0, { report: () => { } }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.content[0],
			fileOperations,
			runCount: getRunCount(),
		}, {
			message: { kind: 'text', value: 'Cannot create a task outside the current workspace folder: /outside' },
			fileOperations: [],
			runCount: 0,
		});
	});

	test('preserves the scheme and authority of a remote working directory', async () => {
		const remoteWorkspace = URI.parse('vscode-remote://ssh-remote+host/workspace');
		const { tool, fileOperations } = createTool({ workspaceFolder: remoteWorkspace });
		const remoteParameters = { ...parameters, workspaceFolder: '/workspace' };

		await tool.invoke(invocation({
			parameters: remoteParameters,
			context: {
				sessionResource: URI.parse('vscode-chat-session://test'),
				workingDirectory: remoteWorkspace,
			},
		}), async () => 0, { report: () => { } }, CancellationToken.Cancelled);

		assert.deepStrictEqual(fileOperations, [
			'exists:vscode-remote://ssh-remote%2Bhost/workspace/.vscode/tasks.json',
			'createFile:vscode-remote://ssh-remote%2Bhost/workspace/.vscode/tasks.json',
		]);
	});

	test('requires confirmation and escapes model-controlled markdown', async () => {
		const { tool } = createTool();
		const maliciousParameters = {
			...parameters,
			task: {
				...parameters.task,
				label: '[build](command:workbench.action.closeWindow)',
				command: 'echo ```',
			}
		};

		const prepared = await tool.prepareToolInvocation(preparationContext({ parameters: maliciousParameters }), CancellationToken.None);

		assert.deepStrictEqual({
			allowAutoConfirm: prepared?.confirmationMessages?.allowAutoConfirm,
			message: typeof prepared?.confirmationMessages?.message === 'string' ? prepared.confirmationMessages.message : prepared?.confirmationMessages?.message?.value,
		}, {
			allowAutoConfirm: false,
			message: `Task&nbsp;'\\[build\\]\\(command:workbench.action.closeWindow\\)'&nbsp;will&nbsp;be&nbsp;created&nbsp;in&nbsp;'${workspaceFolder.fsPath}'&nbsp;and&nbsp;run&nbsp;with&nbsp;this&nbsp;command:\n\`\`\`shell\necho \`\`\` run build\n\`\`\`\n`,
		});
	});
});
