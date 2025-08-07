/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
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

suite('alternativeRecommendation with command routing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let mockToolsService: MockLanguageModelToolsService;

	setup(() => {
		mockToolsService = new MockLanguageModelToolsService();
		CommandRoutingRegistry.clearRoutes();
		
		// Reset the session state
		(getRecommendedToolsOverRunInTerminal as any).previouslyRecommededInSession = false;
	});

	teardown(() => {
		CommandRoutingRegistry.clearRoutes();
	});

	test('should prioritize command routing over tag-based recommendations', () => {
		// Register built-in file reading route
		CommandRoutingRegistry.registerRoute({
			commands: [/^cat\s+(.+)$/],
			toolId: 'vscode_readFile_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const filePath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: { path: filePath } };
			},
			priority: 100
		});

		// Add the read file tool
		mockToolsService.addTool({
			id: 'vscode_readFile_internal',
			displayName: 'Read File',
			modelDescription: 'Reads file contents',
			source: ToolDataSource.Internal,
			tags: ['file', 'read']
		});

		// Also add a tool that would match tag-based system
		mockToolsService.addTool({
			id: 'some-other-tool',
			displayName: 'Other Tool',
			modelDescription: 'Some other tool',
			source: ToolDataSource.Internal,
			tags: ['cat'] // This would potentially match if we had a cat-based tag system
		});

		const recommendation = getRecommendedToolsOverRunInTerminal('cat file.txt', mockToolsService as ILanguageModelToolsService);
		
		ok(recommendation);
		ok(recommendation.includes('Read File'));
		ok(recommendation.includes('cat file.txt'));
	});

	test('should fall back to tag-based system for python commands', () => {
		// Add a python environment tool
		mockToolsService.addTool({
			id: 'python-tool',
			displayName: 'Python Tool',
			modelDescription: 'Python environment tool',
			source: ToolDataSource.Internal,
			tags: ['python environment']
		});

		const recommendation = getRecommendedToolsOverRunInTerminal('pip install numpy', mockToolsService as ILanguageModelToolsService);
		
		ok(recommendation);
		ok(recommendation.includes('pip install numpy'));
		ok(recommendation.includes('python-tool'));
	});

	test('should handle mkdir commands through routing', () => {
		CommandRoutingRegistry.registerRoute({
			commands: [/^mkdir\s+(.+)$/],
			toolId: 'vscode_createDirectory_internal',
			extractParameters: (commandLine: string, match: RegExpMatchArray) => {
				const dirPath = match[1].trim().replace(/^["']|["']$/g, '');
				return { uri: { path: dirPath } };
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

		const recommendation = getRecommendedToolsOverRunInTerminal('mkdir newdir', mockToolsService as ILanguageModelToolsService);
		
		ok(recommendation);
		ok(recommendation.includes('Create Directory'));
		ok(recommendation.includes('mkdir newdir'));
	});

	test('should return undefined when no tools are available', () => {
		const recommendation = getRecommendedToolsOverRunInTerminal('cat file.txt', mockToolsService as ILanguageModelToolsService);
		strictEqual(recommendation, undefined);
	});

	test('should return undefined when command has no matching routes or tags', () => {
		mockToolsService.addTool({
			id: 'unrelated-tool',
			displayName: 'Unrelated Tool',
			modelDescription: 'An unrelated tool',
			source: ToolDataSource.Internal,
			tags: ['unrelated']
		});

		const recommendation = getRecommendedToolsOverRunInTerminal('some unknown command', mockToolsService as ILanguageModelToolsService);
		strictEqual(recommendation, undefined);
	});
});