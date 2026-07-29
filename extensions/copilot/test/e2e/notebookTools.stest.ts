/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { ContributedToolName, ToolName } from '../../src/extension/tools/common/toolNames';
import { getCellId } from '../../src/platform/notebook/common/helpers';
import { deserializeWorkbenchState } from '../../src/platform/test/node/promptContextModel';
import { ssuite, stest } from '../base/stest';
import { generateToolTestRunner } from './toolSimTest';
import { shouldSkipAgentTests } from './tools.stest';

ssuite.optional(shouldSkipAgentTests, {
	title: 'notebooks', subtitle: 'toolCalling', location: 'panel', configurations: []
}, (inputPath) => {
	const scenarioFolder = inputPath ?? path.join(__dirname, '..', 'test/scenarios/test-notebook-tools');
	const getState = () => deserializeWorkbenchState(scenarioFolder, path.join(scenarioFolder, 'Chipotle1.state.json'));

	stest('Run cell tool',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: 'Run the first code cell.',
			expectedToolCalls: { anyOf: [ToolName.RunNotebookCell, ToolName.GetNotebookSummary] },
			getState,
			tools: {
				[ContributedToolName.GetNotebookSummary]: true,
				[ContributedToolName.RunNotebookCell]: true
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.RunNotebookCell]: async (toolCalls) => {
					const state = getState();
					const activeDoc = state.activeTextEditor!.document!;
					const solutionNotebook = state.notebookDocuments.find(doc => doc.uri.path === activeDoc.uri.path)!;
					const codeCellIds = solutionNotebook?.getCells().filter(c => c.kind === 2).map(c => getCellId(c));
					toolCalls.forEach((toolCall) => {
						const cellId = (toolCall.input as { cellId: string }).cellId;
						assert.ok(codeCellIds.includes(cellId), `Cell ${cellId} should be found in the notebook`);
					});
				},
				[ToolName.GetNotebookSummary]: async () => {
					// Ok to call this
				},
				[ToolName.EditNotebook]: async () => {
					throw new Error('EditNotebook should not be called');
				}
			}
		})
	);

	stest('New Notebook Tool with EditFile and EditNotebook',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: `Create a new Jupyter Notebook using ${ContributedToolName.CreateNewJupyterNotebook} with 1 cell to that adds number 1 and 2.`,
			expectedToolCalls: { anyOf: [ToolName.CreateNewJupyterNotebook, ToolName.EditFile, ToolName.EditNotebook] },
			getState,
			tools: {
				[ContributedToolName.EditFile]: true,
				[ContributedToolName.EditNotebook]: true,
				[ContributedToolName.CreateNewJupyterNotebook]: true
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.EditNotebook]: async () => {
					//
				},
				[ToolName.CreateNewJupyterNotebook]: async () => {
					//
				},
				[ToolName.EditFile]: async () => {
					//
				}
			}
		})
	);

	stest('New Notebook Tool without EditFile and without EditNotebook',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: `Create a new Jupyter Notebook using ${ContributedToolName.CreateNewJupyterNotebook} with 1 cell to that adds number 1 and 2.`,
			expectedToolCalls: { anyOf: [ToolName.CreateNewJupyterNotebook] },
			getState,
			tools: {
				[ContributedToolName.CreateNewJupyterNotebook]: true
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.EditNotebook]: async () => {
					throw new Error('EditNotebook should not be called');
				},
				[ToolName.CreateNewJupyterNotebook]: async () => {
					//
				},
				[ToolName.EditFile]: async () => {
					throw new Error('EditFile should not be called');
				}
			}
		})
	);

	stest('New Notebook Tool without EditFile and with EditNotebook',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: `Create a new Jupyter Notebook using ${ContributedToolName.CreateNewJupyterNotebook} with 1 cell to that adds number 1 and 2.`,
			expectedToolCalls: { anyOf: [ToolName.CreateNewJupyterNotebook] },
			getState,
			tools: {
				[ContributedToolName.EditNotebook]: true,
				[ContributedToolName.CreateNewJupyterNotebook]: true
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.EditNotebook]: async () => {
					throw new Error('EditNotebook should not be called');
				},
				[ToolName.CreateNewJupyterNotebook]: async () => {
					//
				},
				[ToolName.EditFile]: async () => {
					throw new Error('EditFile should not be called');
				}
			}
		})
	);

	stest('Run cell tool should avoid running markdown cells',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: 'Run the first three cells.',
			expectedToolCalls: { anyOf: [ToolName.RunNotebookCell, ToolName.GetNotebookSummary] },
			getState,
			tools: {
				[ContributedToolName.GetNotebookSummary]: true,
				[ContributedToolName.RunNotebookCell]: true
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.RunNotebookCell]: async (toolCalls) => {
					const state = getState();
					const activeDoc = state.activeTextEditor!.document!;
					const solutionNotebook = state.notebookDocuments.find(doc => doc.uri.path === activeDoc.uri.path)!;
					const first3CodeCells = solutionNotebook?.getCells().filter(c => c.kind === 2).map(c => getCellId(c)).slice(0, 3);
					toolCalls.forEach((toolCall) => {
						const cellId = (toolCall.input as { cellId: string }).cellId;
						assert.ok(first3CodeCells.includes(cellId), `Cell ${cellId} was not one of the first three code cells`);
					});
				},
				[ToolName.GetNotebookSummary]: async () => {
					// Ok to call this
				},
				[ToolName.EditNotebook]: async () => {
					throw new Error('EditNotebook should not be called');
				}
			}
		})
	);

	stest('Run cell at a specific index',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: 'Run the third cell.',
			expectedToolCalls: { anyOf: [ToolName.RunNotebookCell, ToolName.GetNotebookSummary] },
			getState,
			tools: {
				[ContributedToolName.GetNotebookSummary]: true,
				[ContributedToolName.RunNotebookCell]: true
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.RunNotebookCell]: async (toolCalls) => {
					const state = getState();
					const activeDoc = state.activeTextEditor!.document!;
					const solutionNotebook = state.notebookDocuments.find(doc => doc.uri.path === activeDoc.uri.path)!;
					const thirdCell = solutionNotebook?.getCells()[2];
					assert.equal(thirdCell?.kind, 2, 'Invalid test: The third cell should be a code cell');
					toolCalls.forEach((toolCall) => {
						const cellId = (toolCall.input as { cellId: string }).cellId;
						assert.ok(thirdCell && getCellId(thirdCell) === cellId, `Cell ${cellId} should be the third code cell`);
					});
				},
				[ToolName.GetNotebookSummary]: async () => {
					// Ok to call this
				},
				[ToolName.EditNotebook]: async () => {
					throw new Error('EditNotebook should not be called');
				}
			}
		})
	);

	stest('Edit cell tool',
		generateToolTestRunner({
			scenarioFolderPath: scenarioFolder,
			question: 'Change the header in the first markdown cell to "Hello Chipotle"',
			expectedToolCalls: ToolName.EditNotebook,
			getState,
			tools: {
				[ContributedToolName.GetNotebookSummary]: true, // Include this tool and verify that this isn't invoked (in the past this used to get invoked as part of editing).
			}
		}, {
			allowParallelToolCalls: true,
			toolCallValidators: {
				[ToolName.RunNotebookCell]: async (toolCalls) => {
					const state = getState();
					const activeDoc = state.activeTextEditor!.document!;
					const solutionNotebook = state.notebookDocuments.find(doc => doc.uri.path === activeDoc.uri.path)!;
					toolCalls.forEach((toolCall) => {
						const cellId = (toolCall.input as { cellId: string }).cellId;
						const firstMarkdownCell = solutionNotebook?.getCells().find(c => c.kind === 1)!;
						assert.equal(getCellId(firstMarkdownCell), cellId);

						const newCode = (toolCall.input as { newCode: string[] }).newCode;
						assert.notDeepEqual(newCode.indexOf('# Hello Chipotle'), -1, 'The first markdown cell should be changed to "Hello Chipotle"');
					});
				},
				[ToolName.GetNotebookSummary]: async () => {
					// Ok to call this
				},
			},
		})
	);
});
