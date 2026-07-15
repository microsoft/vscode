/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ClientToolSetsContribution } from '../../../browser/tools/clientToolSetsContribution.js';
import { LanguageModelToolsService } from '../../../browser/tools/languageModelToolsService.js';
import { createToolSetFileContents, deleteToolSetFromFileContents, getEnabledSelectionReferences } from '../../../browser/tools/toolSetsContribution.js';
import { IAICustomizationWorkspaceService } from '../../../common/aiCustomizationWorkspaceService.js';
import { IToolData, ToolDataSource, ToolAndToolSetEnablementMap } from '../../../common/tools/languageModelToolsService.js';

suite('ToolSetsContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createToolsService(): LanguageModelToolsService {
		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService())),
		}, store);
		return store.add(instaService.createInstance(LanguageModelToolsService));
	}

	test('ClientToolSetsContribution omits VS Code API from Agent Host tools', () => {
		const toolsService = createToolsService();
		const toolSearch: IToolData = {
			id: 'toolSearch',
			modelDescription: 'Search for tools',
			displayName: 'Tool Search',
			toolReferenceName: 'toolSearch',
			source: ToolDataSource.Internal,
		};
		const vscodeAPI: IToolData = {
			id: 'vscodeAPI',
			modelDescription: 'Search VS Code API documentation',
			displayName: 'VS Code API',
			toolReferenceName: 'vscodeAPI',
			source: ToolDataSource.Internal,
		};
		store.add(toolsService.registerToolData(toolSearch));
		store.add(toolsService.registerToolData(vscodeAPI));

		const workspaceService = new class extends mock<IAICustomizationWorkspaceService>() {
			override readonly isSessionsWindow = true;
		}();
		store.add(new ClientToolSetsContribution(toolsService, workspaceService));

		assert.deepStrictEqual(
			Array.from(toolsService.getToolSet('vscode-general')?.getTools() ?? [], tool => tool.toolReferenceName),
			['toolSearch']
		);
	});

	test('getEnabledSelectionReferences keeps enabled tool set references and drops covered tools', () => {
		const toolsService = createToolsService();

		const coveredTool: IToolData = {
			id: 'covered',
			modelDescription: 'covered',
			displayName: 'covered',
			toolReferenceName: 'covered',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};
		const standaloneTool: IToolData = {
			id: 'standalone',
			modelDescription: 'standalone',
			displayName: 'standalone',
			toolReferenceName: 'standalone',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};

		store.add(toolsService.registerToolData(coveredTool));
		store.add(toolsService.registerToolData(standaloneTool));

		const userToolSet = store.add(toolsService.createToolSet(
			{ type: 'user', file: URI.file('/tmp/tools.toolsets.jsonc'), label: 'tools.toolsets.jsonc' },
			'user/toolset',
			'myToolSet'
		));
		store.add(userToolSet.addTool(coveredTool));

		const selection = ToolAndToolSetEnablementMap.fromEntries([
			[userToolSet, true],
			[coveredTool, true],
			[standaloneTool, true],
		]);

		assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
			toolsService.getFullReferenceName(userToolSet),
			toolsService.getFullReferenceName(standaloneTool),
		]);
	});

	test('getEnabledSelectionReferences does not emit a tool set when a member tool is unchecked', () => {
		const toolsService = createToolsService();

		const enabledTool: IToolData = {
			id: 'enabled',
			modelDescription: 'enabled',
			displayName: 'enabled',
			toolReferenceName: 'enabled',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};
		const disabledTool: IToolData = {
			id: 'disabled',
			modelDescription: 'disabled',
			displayName: 'disabled',
			toolReferenceName: 'disabled',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};

		store.add(toolsService.registerToolData(enabledTool));
		store.add(toolsService.registerToolData(disabledTool));

		const userToolSet = store.add(toolsService.createToolSet(
			{ type: 'user', file: URI.file('/tmp/tools.toolsets.jsonc'), label: 'tools.toolsets.jsonc' },
			'user/toolset',
			'myToolSet'
		));
		store.add(userToolSet.addTool(enabledTool));
		store.add(userToolSet.addTool(disabledTool));

		const selection = ToolAndToolSetEnablementMap.fromEntries([
			[userToolSet, true],
			[enabledTool, true],
			[disabledTool, false],
		]);

		// The tool set is partially deselected, so it must not be serialized. Only the
		// enabled member tool is emitted.
		assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
			toolsService.getFullReferenceName(enabledTool),
		]);
	});

	test('getEnabledSelectionReferences uses qualified names for individually selected tools', () => {
		const toolsService = createToolsService();

		const memoryTool: IToolData = {
			id: 'memory',
			modelDescription: 'memory',
			displayName: 'memory',
			toolReferenceName: 'memory',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};

		store.add(toolsService.registerToolData(memoryTool));

		const vscodeToolSet = store.add(toolsService.createToolSet(
			ToolDataSource.Internal,
			'vscode',
			'vscode'
		));
		store.add(vscodeToolSet.addTool(memoryTool));

		const selection = ToolAndToolSetEnablementMap.fromEntries([
			[vscodeToolSet, false],
			[memoryTool, true],
		]);

		assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
			toolsService.getFullReferenceName(memoryTool, vscodeToolSet),
		]);
	});

	test('getEnabledSelectionReferences includes sub-tools that are only referenceable via their tool set', () => {
		const toolsService = createToolsService();

		const subTool: IToolData = {
			id: 'subTool',
			modelDescription: 'subTool',
			displayName: 'subTool',
			toolReferenceName: 'subTool',
			canBeReferencedInPrompt: false,
			source: ToolDataSource.Internal,
		};

		store.add(toolsService.registerToolData(subTool));

		const vscodeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, 'vscode', 'vscode'));
		store.add(vscodeToolSet.addTool(subTool));

		const selection = ToolAndToolSetEnablementMap.fromEntries([
			[vscodeToolSet, false],
			[subTool, true],
		]);

		assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
			toolsService.getFullReferenceName(subTool, vscodeToolSet),
		]);
	});

	test('getEnabledSelectionReferences supports mixed qualified names and wildcard tool sets', () => {
		const toolsService = createToolsService();

		const memoryTool: IToolData = {
			id: 'memory',
			modelDescription: 'memory',
			displayName: 'memory',
			toolReferenceName: 'memory',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};

		const runInTerminalTool: IToolData = {
			id: 'runInTerminal',
			modelDescription: 'runInTerminal',
			displayName: 'runInTerminal',
			toolReferenceName: 'runInTerminal',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};

		const readFileTool: IToolData = {
			id: 'readFile',
			modelDescription: 'readFile',
			displayName: 'readFile',
			toolReferenceName: 'readFile',
			canBeReferencedInPrompt: true,
			source: ToolDataSource.Internal,
		};

		const githubIssuesTool: IToolData = {
			id: 'githubIssues',
			modelDescription: 'issues',
			displayName: 'issues',
			toolReferenceName: 'issues',
			canBeReferencedInPrompt: true,
			source: { type: 'mcp', label: 'GitHub', collectionId: 'github', definitionId: 'github', instructions: '', serverLabel: 'GitHub' },
		};

		store.add(toolsService.registerToolData(memoryTool));
		store.add(toolsService.registerToolData(runInTerminalTool));
		store.add(toolsService.registerToolData(readFileTool));
		store.add(toolsService.registerToolData(githubIssuesTool));

		const vscodeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, 'vscode', 'vscode'));
		const executeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, 'execute', 'execute'));
		const readToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, 'read', 'read'));
		const githubToolSet = store.add(toolsService.createToolSet(
			{ type: 'mcp', label: 'GitHub', collectionId: 'github', definitionId: 'github', instructions: '', serverLabel: 'GitHub' },
			'github',
			'github'
		));

		store.add(vscodeToolSet.addTool(memoryTool));
		store.add(executeToolSet.addTool(runInTerminalTool));
		store.add(readToolSet.addTool(readFileTool));
		store.add(githubToolSet.addTool(githubIssuesTool));

		const selection = ToolAndToolSetEnablementMap.fromEntries([
			[vscodeToolSet, false],
			[executeToolSet, false],
			[readToolSet, false],
			[githubToolSet, true],
			[memoryTool, true],
			[runInTerminalTool, true],
			[readFileTool, true],
		]);

		assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
			toolsService.getFullReferenceName(githubToolSet),
			toolsService.getFullReferenceName(memoryTool, vscodeToolSet),
			toolsService.getFullReferenceName(runInTerminalTool, executeToolSet),
			toolsService.getFullReferenceName(readFileTool, readToolSet),
		]);
	});

	test('createToolSetFileContents emits prefilled jsonc structure', () => {
		assert.strictEqual(
			createToolSetFileContents('myToolSet', ['read', 'search', 'github/issues']),
			[
				'{',
				'\t"myToolSet": {',
				'\t\t"tools": [',
				'\t\t\t"read",',
				'\t\t\t"search",',
				'\t\t\t"github/issues"',
				'\t\t],',
				'\t\t"description": "",',
				'\t\t"icon": "tools"',
				'\t}',
				'}',
			].join('\n')
		);
	});

	test('deleteToolSetFromFileContents removes matching tool set', () => {
		const updated = deleteToolSetFromFileContents('{\n\t"CurrentTools": {\n\t\t"tools": ["vscode/memory"]\n\t},\n\t"Other": {\n\t\t"tools": ["read/readFile"]\n\t}\n}', 'CurrentTools');
		assert.deepStrictEqual(updated, { contents: '{\n\t"Other": {\n\t\t"tools": [\n\t\t\t"read/readFile"\n\t\t]\n\t}\n}', isEmpty: false });
	});

	test('deleteToolSetFromFileContents reports an empty file when the last tool set is removed', () => {
		const updated = deleteToolSetFromFileContents('{\n\t"CurrentTools": {\n\t\t"tools": ["vscode/memory"]\n\t}\n}', 'CurrentTools');
		assert.deepStrictEqual(updated, { contents: '{}', isEmpty: true });
	});

	test('deleteToolSetFromFileContents returns undefined when tool set missing', () => {
		assert.strictEqual(deleteToolSetFromFileContents('{"Other": {"tools": ["read/readFile"]}}', 'CurrentTools'), undefined);
	});
});
