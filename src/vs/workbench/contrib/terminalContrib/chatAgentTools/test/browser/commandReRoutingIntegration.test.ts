/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../chat/common/languageModelToolsService.js';
import { getRecommendedToolsOverRunInTerminal } from '../../browser/alternativeRecommendation.js';
import { CommandRoutingRegistry } from '../../browser/commandRoutingRegistry.js';

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

suite('Command Re-routing Integration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let mockToolsService: MockLanguageModelToolsService;

	setup(() => {
		mockToolsService = new MockLanguageModelToolsService();
		CommandRoutingRegistry.clearRoutes();

		// Register the built-in routes that would be registered at startup
		CommandRoutingRegistry.registerRoute({
			commands: [/^cat\s+(.+)$/, /^type\s+(.+)$/],
			toolId: 'vscode_readFile_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const filePath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: { path: filePath } };
			},
			priority: 100
		});

		CommandRoutingRegistry.registerRoute({
			commands: [/^mkdir\s+(.+)$/, /^md\s+(.+)$/],
			toolId: 'vscode_createDirectory_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const dirPath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: { path: dirPath } };
			},
			priority: 100
		});

		// Add the tools that would be available
		mockToolsService.addTool({
			id: 'vscode_readFile_internal',
			displayName: 'Read File',
			modelDescription: 'Reads file contents',
			source: ToolDataSource.Internal,
			tags: ['file', 'read', 'cat']
		});

		mockToolsService.addTool({
			id: 'vscode_createDirectory_internal',
			displayName: 'Create Directory',
			modelDescription: 'Creates directories',
			source: ToolDataSource.Internal,
			tags: ['file', 'directory', 'mkdir']
		});
	});

	teardown(() => {
		CommandRoutingRegistry.clearRoutes();
	});

	test('integration: cat command should be recommended to ReadFile tool', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal(
			'cat /path/to/file.txt',
			mockToolsService as ILanguageModelToolsService
		);

		ok(recommendation);
		ok(recommendation.includes('cat /path/to/file.txt'));
		ok(recommendation.includes('Read File'));
		ok(recommendation.includes('better handled'));
	});

	test('integration: mkdir command should be recommended to CreateDirectory tool', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal(
			'mkdir /path/to/newdir',
			mockToolsService as ILanguageModelToolsService
		);

		ok(recommendation);
		ok(recommendation.includes('mkdir /path/to/newdir'));
		ok(recommendation.includes('Create Directory'));
		ok(recommendation.includes('better handled'));
	});

	test('integration: cat with quoted path should work', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal(
			'cat "/path/to/file with spaces.txt"',
			mockToolsService as ILanguageModelToolsService
		);

		ok(recommendation);
		ok(recommendation.includes('cat "/path/to/file with spaces.txt"'));
		ok(recommendation.includes('Read File'));
	});

	test('integration: type command (Windows) should be recommended to ReadFile tool', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal(
			'type config.txt',
			mockToolsService as ILanguageModelToolsService
		);

		ok(recommendation);
		ok(recommendation.includes('type config.txt'));
		ok(recommendation.includes('Read File'));
	});

	test('integration: md command (Windows) should be recommended to CreateDirectory tool', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal(
			'md C:\\newdir',
			mockToolsService as ILanguageModelToolsService
		);

		ok(recommendation);
		ok(recommendation.includes('md C:\\newdir'));
		ok(recommendation.includes('Create Directory'));
	});

	test('integration: fallback to python environment recommendations works', () => {
		// Add python tool
		mockToolsService.addTool({
			id: 'python-env-tool',
			displayName: 'Python Environment',
			modelDescription: 'Python environment tool',
			source: ToolDataSource.Internal,
			tags: ['python environment']
		});

		const recommendation = getRecommendedToolsOverRunInTerminal(
			'pip install numpy',
			mockToolsService as ILanguageModelToolsService
		);

		ok(recommendation);
		ok(recommendation.includes('pip install numpy'));
		ok(recommendation.includes('python-env-tool'));
	});

	test('integration: unknown commands return undefined', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal(
			'some-unknown-command arg1 arg2',
			mockToolsService as ILanguageModelToolsService
		);

		strictEqual(recommendation, undefined);
	});

	test('integration: commands without matching tools return undefined', () => {
		// Clear all tools
		mockToolsService = new MockLanguageModelToolsService();

		const recommendation = getRecommendedToolsOverRunInTerminal(
			'cat file.txt',
			mockToolsService as ILanguageModelToolsService
		);

		strictEqual(recommendation, undefined);
	});
});