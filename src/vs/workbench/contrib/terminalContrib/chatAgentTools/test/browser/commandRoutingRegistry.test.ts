/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../chat/common/languageModelToolsService.js';
import { CommandRoutingRegistry, getToolRecommendationForCommand, ICommandRoute } from '../../browser/commandRoutingRegistry.js';

class MockLanguageModelToolsService implements Partial<ILanguageModelToolsService> {
	private tools = new Map<string, IToolData>();

	addTool(tool: IToolData) {
		this.tools.set(tool.id, tool);
	}

	getTools() {
		return this.tools.values();
	}

	getTool(id: string) {
		return this.tools.get(id);
	}
}

suite('CommandRoutingRegistry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let mockToolsService: MockLanguageModelToolsService;

	setup(() => {
		mockToolsService = new MockLanguageModelToolsService();
		CommandRoutingRegistry.clearRoutes();
	});

	teardown(() => {
		CommandRoutingRegistry.clearRoutes();
	});

	test('should register and find routes', () => {
		const testRoute: ICommandRoute = {
			commands: [/^test\s+(.+)$/],
			toolId: 'test-tool',
			extractParameters: (commandLine, match) => ({ arg: match[1] }),
			priority: 1
		};

		CommandRoutingRegistry.registerRoute(testRoute);

		mockToolsService.addTool({
			id: 'test-tool',
			displayName: 'Test Tool',
			modelDescription: 'A test tool',
			source: ToolDataSource.Internal
		});

		const result = CommandRoutingRegistry.findRoute('test hello', mockToolsService as ILanguageModelToolsService);
		ok(result);
		strictEqual(result.toolId, 'test-tool');
		strictEqual(result.parameters.arg, 'hello');
	});

	test('should handle cat commands', () => {
		// Built-in routes are registered automatically, but let's re-register to be sure
		CommandRoutingRegistry.registerRoute({
			commands: [/^cat\s+(.+)$/],
			toolId: 'vscode_readFile_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const filePath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: URI.file(filePath).toJSON() };
			},
			priority: 100
		});

		mockToolsService.addTool({
			id: 'vscode_readFile_internal',
			displayName: 'Read File',
			modelDescription: 'Reads file contents',
			source: ToolDataSource.Internal,
			tags: ['file', 'read']
		});

		const result = CommandRoutingRegistry.findRoute('cat /path/to/file.txt', mockToolsService as ILanguageModelToolsService);
		ok(result);
		strictEqual(result.toolId, 'vscode_readFile_internal');
		ok(result.parameters.uri);
		strictEqual(result.parameters.uri.path, '/path/to/file.txt');
	});

	test('should handle quoted file paths', () => {
		CommandRoutingRegistry.registerRoute({
			commands: [/^cat\s+(.+)$/],
			toolId: 'vscode_readFile_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const filePath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: URI.file(filePath).toJSON() };
			},
			priority: 100
		});

		mockToolsService.addTool({
			id: 'vscode_readFile_internal',
			displayName: 'Read File',
			modelDescription: 'Reads file contents',
			source: ToolDataSource.Internal
		});

		const result = CommandRoutingRegistry.findRoute('cat "/path/to/file with spaces.txt"', mockToolsService as ILanguageModelToolsService);
		ok(result);
		strictEqual(result.toolId, 'vscode_readFile_internal');
		strictEqual(result.parameters.uri.path, '/path/to/file with spaces.txt');
	});

	test('should handle mkdir commands', () => {
		CommandRoutingRegistry.registerRoute({
			commands: [/^mkdir\s+(.+)$/],
			toolId: 'vscode_createDirectory_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const dirPath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: URI.file(dirPath).toJSON() };
			},
			priority: 100
		});

		mockToolsService.addTool({
			id: 'vscode_createDirectory_internal',
			displayName: 'Create Directory',
			modelDescription: 'Creates directories',
			source: ToolDataSource.Internal,
			tags: ['file', 'directory']
		});

		const result = CommandRoutingRegistry.findRoute('mkdir /path/to/newdir', mockToolsService as ILanguageModelToolsService);
		ok(result);
		strictEqual(result.toolId, 'vscode_createDirectory_internal');
		strictEqual(result.parameters.uri.path, '/path/to/newdir');
	});

	test('should respect priority order', () => {
		const lowPriorityRoute: ICommandRoute = {
			commands: [/^test\s+(.+)$/],
			toolId: 'low-priority-tool',
			extractParameters: (commandLine, match) => ({ arg: match[1] }),
			priority: 1
		};

		const highPriorityRoute: ICommandRoute = {
			commands: [/^test\s+(.+)$/],
			toolId: 'high-priority-tool',
			extractParameters: (commandLine, match) => ({ arg: match[1] }),
			priority: 10
		};

		CommandRoutingRegistry.registerRoute(lowPriorityRoute);
		CommandRoutingRegistry.registerRoute(highPriorityRoute);

		mockToolsService.addTool({
			id: 'low-priority-tool',
			displayName: 'Low Priority Tool',
			modelDescription: 'A low priority tool',
			source: ToolDataSource.Internal
		});

		mockToolsService.addTool({
			id: 'high-priority-tool',
			displayName: 'High Priority Tool',
			modelDescription: 'A high priority tool',
			source: ToolDataSource.Internal
		});

		const result = CommandRoutingRegistry.findRoute('test hello', mockToolsService as ILanguageModelToolsService);
		ok(result);
		strictEqual(result.toolId, 'high-priority-tool');
	});

	test('should return undefined when tool is not available', () => {
		CommandRoutingRegistry.registerRoute({
			commands: [/^test\s+(.+)$/],
			toolId: 'unavailable-tool',
			extractParameters: (commandLine, match) => ({ arg: match[1] }),
			priority: 1
		});

		// Don't add the tool to the mock service

		const result = CommandRoutingRegistry.findRoute('test hello', mockToolsService as ILanguageModelToolsService);
		strictEqual(result, undefined);
	});

	test('should return undefined when no routes match', () => {
		mockToolsService.addTool({
			id: 'test-tool',
			displayName: 'Test Tool',
			modelDescription: 'A test tool',
			source: ToolDataSource.Internal
		});

		const result = CommandRoutingRegistry.findRoute('unknown command', mockToolsService as ILanguageModelToolsService);
		strictEqual(result, undefined);
	});

	test('should generate tool recommendations', () => {
		CommandRoutingRegistry.registerRoute({
			commands: [/^cat\s+(.+)$/],
			toolId: 'vscode_readFile_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const filePath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: URI.file(filePath).toJSON() };
			},
			priority: 100
		});

		mockToolsService.addTool({
			id: 'vscode_readFile_internal',
			displayName: 'Read File',
			modelDescription: 'Reads file contents',
			source: ToolDataSource.Internal
		});

		const recommendation = getToolRecommendationForCommand('cat file.txt', mockToolsService as ILanguageModelToolsService);
		ok(recommendation);
		ok(recommendation.includes('cat file.txt'));
		ok(recommendation.includes('Read File'));
	});

	test('should return undefined recommendation when no route found', () => {
		const recommendation = getToolRecommendationForCommand('unknown command', mockToolsService as ILanguageModelToolsService);
		strictEqual(recommendation, undefined);
	});
});