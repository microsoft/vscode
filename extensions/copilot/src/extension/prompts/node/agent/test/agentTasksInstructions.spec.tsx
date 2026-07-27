/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, UserMessage } from '@vscode/prompt-tsx';
import { expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { IIgnoreService, NullIgnoreService } from '../../../../../platform/ignore/common/ignoreService';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { ITasksService } from '../../../../../platform/tasks/common/tasksService';
import { TestTasksService } from '../../../../../platform/tasks/common/testTasksService';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { renderPromptElement } from '../../base/promptRenderer';
import { AgentTasksInstructions } from '../agentPrompt';

interface TaskPromptProps extends BasePromptElementProps {
	readonly availableTools: readonly vscode.LanguageModelToolInformation[];
}

class TaskPrompt extends PromptElement<TaskPromptProps> {
	render() {
		return (
			<UserMessage>
				<AgentTasksInstructions availableTools={this.props.availableTools} />
			</UserMessage>
		);
	}
}

class StaticTasksService extends TestTasksService {
	constructor(private readonly taskGroups: [URI, vscode.TaskDefinition[]][]) {
		super();
	}

	override getTasks(...args: any[]): [] {
		const workspaceFolder = args[0] as URI | undefined;

		if (workspaceFolder) {
			const tasksForFolder = this.taskGroups.find(([folder]) => folder.toString() === workspaceFolder.toString())?.[1] ?? [];
			return tasksForFolder as unknown as [];
		}

		return this.taskGroups as unknown as [];
	}
}

class TestIgnoreService extends NullIgnoreService {
	constructor(private readonly ignoredResources: Set<string>) {
		super();
	}

	override async isCopilotIgnored(file: URI): Promise<boolean> {
		return this.ignoredResources.has(file.toString());
	}
}

suite('AgentTasksInstructions', () => {
	const workspaceFolder = URI.file('/workspace');
	const tasksFile = URI.joinPath(workspaceFolder, '.vscode', 'tasks.json');
	const taskDefinition: vscode.TaskDefinition = {
		type: 'shell',
		label: 'Build',
		command: 'npm',
		args: ['run', 'build']
	};

	const renderTaskPrompt = async (shouldIgnoreTasksFile: boolean) => {
		const services = createExtensionUnitTestingServices();
		services.define(ITasksService, new SyncDescriptor(StaticTasksService, [[[workspaceFolder, [taskDefinition]]]]));
		services.define(IIgnoreService, new SyncDescriptor(TestIgnoreService, [new Set(shouldIgnoreTasksFile ? [tasksFile.toString()] : [])]));
		const accessor = services.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);
		const endpoint = instantiationService.createInstance(MockEndpoint, undefined);
		const taskTool: vscode.LanguageModelToolInformation = {
			name: ToolName.CoreRunTask,
			description: 'Run a workspace task',
			source: undefined,
			inputSchema: { type: 'object', properties: {} },
			tags: []
		};

		const { messages } = await renderPromptElement(instantiationService, endpoint, TaskPrompt, {
			priority: 1,
			availableTools: [taskTool]
		});
		const output = messages.map(m => messageToMarkdown(m)).join('\n\n');
		accessor.dispose();
		return { messages, output };
	};

	test('renders task metadata when not ignored', async () => {
		const { output } = await renderTaskPrompt(false);
		expect(output).toContain('Build');
		expect(output).toContain('"command": "npm"');
	});

	test('skips task metadata when tasks.json is ignored', async () => {
		const { output } = await renderTaskPrompt(true);
		expect(output).not.toContain('Build');
		expect(output).not.toContain('"command": "npm"');
	});
});
