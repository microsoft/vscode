/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as assert from 'assert';
import { getTaskDefinition, getTaskForTool } from '../../browser/task/taskHelpers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('getTaskForTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let configService: IConfigurationService;
	let taskService: ITaskService;
	setup(
		() => {
			const instantiationService = store.add(new TestInstantiationService());
			const mockTasksJson = [
				createTask('npm', undefined, undefined, 'run build'),
				createTask('npm', 'compile', undefined, 'run compile'),
				createTask('shell', 'deploy', undefined, 'sh deploy.sh')
			];
			const tasks = [createTask('npm', 'build')];
			taskService = instantiationService.stub(ITaskService, new MockTaskService(tasks));
			configService = instantiationService.stub(IConfigurationService, new MockConfigurationService(mockTasksJson));
		}
	);
	test('should match by id type: label', async () => {
		const id = 'npm: build';
		const def = { taskLabel: 'build', taskType: 'npm' };
		const result = await getTaskForTool(id, def, '/workspace', configService, taskService);
		assert.ok(result);
		assert.equal(result.type, 'npm');
		assert.equal(result._label, 'build');
	});

	test('should match by id type: index when label missing', async () => {
		const id = 'npm: 0';
		const def = { taskLabel: 'npm: 0', taskType: 'npm' };
		const result = await getTaskForTool(id, def, '/workspace', configService, taskService);
		assert.ok(result);
		assert.equal(result.type, 'npm');
		assert.equal(result._label, 'npm: build');
	});

	test('should return undefined for non-matching id', async () => {
		const id = 'npm: 3';
		const def = { taskLabel: undefined, taskType: 'npm' };
		const result = await getTaskForTool(id, def, '/workspace', configService, taskService);
		assert.equal(result, undefined);
	});

	test('should match by label if id matches configTask.label', async () => {
		const id = 'build';
		const def = { taskLabel: 'build', taskType: 'npm' };
		const result = await getTaskForTool(id, def, '/workspace', configService, taskService);
		assert.ok(result);
		assert.equal(result._label, 'build');
	});
});

class MockConfigurationService implements Pick<IConfigurationService, 'getValue'> {
	constructor(private _tasks: any[]) { }

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: any): T;
	getValue<T>(section: string, overrides: any): T;
	getValue<T>(sectionOrOverrides?: string | any, overrides?: any): T {
		if (typeof sectionOrOverrides === 'string' && sectionOrOverrides === 'tasks') {
			return { tasks: this._tasks } as T;
		}
		return undefined as T;
	}
}

class MockTaskService implements Pick<ITaskService, 'getWorkspaceTasks' | 'tryResolveTask'> {
	constructor(private _workspaceTasks: any) { }
	async getWorkspaceTasks() {
		return this._workspaceTasks;
	}
	async tryResolveTask(task: any) {
		return { ...task, resolved: true };
	}
	setTasks(tasks: any[]) {
		this._workspaceTasks = tasks;
	}
}

function createTask(type: string, label?: string, script?: string, command?: string) {
	return { type, label, script, command };
}

suite('getTaskDefinition', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('should return task definition with label and type', () => {
		const result = getTaskDefinition('npm: build');
		assert.ok(result);
		assert.equal(result.taskLabel, 'build');
		assert.equal(result.taskType, 'npm');
	});
	test('should return task definition with label and type for indexed task', () => {
		const result = getTaskDefinition('npm: 0');
		assert.ok(result);
		assert.equal(result.taskLabel, 'npm: 0');
		assert.equal(result.taskType, 'npm');
	});
	test('should return task definition with label when no type is provided', () => {
		// Sometimes the model only passes in a task name, if a user requests directly by name
		const result = getTaskDefinition('build');
		assert.ok(result);
		assert.equal(result.taskLabel, 'build');
		assert.equal(result.taskType, '');
	});
});
