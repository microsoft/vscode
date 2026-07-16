/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assert } from 'console';
import * as fs from 'fs';
import * as path from 'path';
import { CopilotToolMode } from '../../../src/extension/tools/common/toolsRegistry';
import { IToolsService } from '../../../src/extension/tools/common/toolsService';
import { IConversationOptions } from '../../../src/platform/chat/common/conversationOptions';
import { isInExtensionHost } from '../../../src/platform/test/node/isInExtensionHost';
import { ITestingServicesAccessor, TestingServiceCollection } from '../../../src/platform/test/node/services';
import { SimulationWorkspace } from '../../../src/platform/test/node/simulationWorkspace';
import { SpyChatResponseStream } from '../../../src/util/common/test/mockChatResponseStream';
import { SimulationWorkspaceExtHost } from '../../base/extHostContext/simulationWorkspaceExtHost';
import { ssuite, stest } from '../../base/stest';
import { discoverToolsCalls } from '../../e2e/scenarioLoader';
import { fetchConversationOptions } from '../../e2e/scenarioTest';


type ArgsPreprocessor = (accessor: ITestingServicesAccessor, args: any, workspaceFoldersFilePaths?: string[]) => Promise<any> | any;


const toolArgsPreprocessors: Record<string, ArgsPreprocessor> = {
	'get_errors': (_accessor: ITestingServicesAccessor, args: any, workspaceFoldersFilePaths?: string[]) => {
		const filePaths = (args.filePaths ?? []).map((filePath: string) => {
			if (path.isAbsolute(filePath)) {
				return filePath;
			}
			// Use the first workspace folder as base path if available
			return workspaceFoldersFilePaths && workspaceFoldersFilePaths.length > 0
				? path.resolve(workspaceFoldersFilePaths[0], filePath)
				: filePath;
		});

		return {
			...args,
			filePaths
		};
	},
	'read_file': (_accessor: ITestingServicesAccessor, args: any, workspaceFoldersFilePaths?: string[]) => {
		assert(args.filePath, 'read_file tool requires a file path to read');
		const filePath = args.filePath;

		// Convert to absolute path if it's relative and we have workspace folders
		const resolvedFilePath = path.isAbsolute(filePath) || !workspaceFoldersFilePaths || workspaceFoldersFilePaths.length === 0
			? filePath
			: path.resolve(workspaceFoldersFilePaths[0], filePath);

		return {
			...args,
			filePath: resolvedFilePath
		};
	},
	// Add more tool-specific preprocessors here as needed
	// 'another_tool': (args: any, runtime: ISimulationTestRuntime) => { ... }
};


ssuite({ title: 'tooltest', subtitle: 'toolcall', location: 'panel' }, (inputPath) => {
	// This test suite simulates the execution of tools in a controlled environment
	if (!inputPath) {
		return;
	}

	const toolCallsFolder = inputPath;
	const scenarios = discoverToolsCalls(toolCallsFolder);
	for (const scenario of scenarios) {
		let outputFilePath: string | undefined;
		if (scenario.json.outputPath) {
			outputFilePath = path.resolve(toolCallsFolder, scenario.json.outputPath);
		}

		stest({ description: scenario.name }, async (testingServiceCollection: TestingServiceCollection) => {
			try {
				const input = scenario.json.toolArgs;

				testingServiceCollection.define(IConversationOptions, fetchConversationOptions());
				const simulationWorkspace = isInExtensionHost ? new SimulationWorkspaceExtHost() : new SimulationWorkspace();
				simulationWorkspace.setupServices(testingServiceCollection);


				const accessor = testingServiceCollection.createTestingAccessor();
				simulationWorkspace.resetFromDeserializedWorkspaceState(scenario.getState?.());

				let workspaceFoldersFilePaths: string[] | undefined;
				if (scenario.stateFilePath) {
					const stateJson = await fs.promises.readFile(scenario.stateFilePath, 'utf-8');
					const state = JSON.parse(stateJson);
					const stateFileDir = path.dirname(scenario.stateFilePath);
					if (state.workspaceFoldersFilePaths) {
						workspaceFoldersFilePaths = state.workspaceFoldersFilePaths.map((folder: string) => {
							if (path.isAbsolute(folder)) {
								return folder;
							}
							return path.resolve(stateFileDir, folder);
						});
					}
				}

				const result = await invokeTool(accessor, input.tool, input.args || {}, workspaceFoldersFilePaths);

				const output = {
					toolName: input.tool,
					args: input.args || {},
					result
				};

				if (outputFilePath) {
					await writeOutputFile(outputFilePath, output);
				} else {
					console.log('Tool output:', JSON.stringify(output, null, 2));
				}
			} catch (error) {
				const errorOutput = {
					error: {
						message: error.message,
						stack: error.stack
					}
				};

				if (outputFilePath) {
					await writeOutputFile(outputFilePath, errorOutput);
				}
				throw error;
			}
		});
	}


	async function writeOutputFile(filePath: string, content: any): Promise<void> {
		try {
			await fs.promises.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
		} catch (error) {
			throw new Error(`Failed to write output file: ${error.message}`);
		}
	}

	async function invokeTool(
		accessor: ITestingServicesAccessor,
		toolName: string,
		args: any,
		workspaceFoldersFilePaths?: string[]
	) {
		const token = {
			isCancellationRequested: false,
			onCancellationRequested: () => ({ dispose: () => { } })
		};



		const toolsService = accessor.get(IToolsService);
		const tool = toolsService.getCopilotTool(toolName);

		if (!tool) {
			throw new Error(`Tool not found: ${toolName}`);
		}

		let processedArgs = args;
		if (toolArgsPreprocessors[toolName]) {
			processedArgs = await toolArgsPreprocessors[toolName](accessor, args, workspaceFoldersFilePaths);
		}

		if (tool.resolveInput) {
			const context = { stream: new SpyChatResponseStream() } as any;
			processedArgs = await tool.resolveInput(processedArgs, context, CopilotToolMode.FullContext);
		}

		return await toolsService.invokeTool(
			toolName,
			{
				input: processedArgs || {},
				toolInvocationToken: undefined
			},
			token
		);
	}
});
