/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { EOL } from 'os';
import * as path from 'path';
import type { NotebookDocument } from 'vscode';
import { Intent } from '../../src/extension/common/constants';
import { IDiffService } from '../../src/platform/diff/common/diffService';
import { DiffServiceImpl } from '../../src/platform/diff/node/diffServiceImpl';
import { IAlternativeNotebookContentService } from '../../src/platform/notebook/common/alternativeContent';
import { AlternativeNotebookContentEditGenerator, IAlternativeNotebookContentEditGenerator } from '../../src/platform/notebook/common/alternativeContentEditGenerator';
import { AlternativeNotebookFormat } from '../../src/platform/notebook/common/alternativeContentFormat';
import { MockAlternativeNotebookContentService } from '../../src/platform/notebook/common/mockAlternativeContentService';
import { INotebookService, VariablesResult } from '../../src/platform/notebook/common/notebookService';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { IFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { SimulationAlternativeNotebookContentService, SimulationNotebookService } from '../../src/platform/test/node/simulationWorkspaceServices';
import { ExtHostNotebookDocumentData } from '../../src/util/common/test/shims/notebookDocument';
import { DisposableStore } from '../../src/util/vs/base/common/lifecycle';
import { ResourceMap } from '../../src/util/vs/base/common/map';
import { Schemas } from '../../src/util/vs/base/common/network';
import { URI } from '../../src/util/vs/base/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { ssuite, stest } from '../base/stest';
import { getDiagnostics } from './diagnosticProviders';
import { DiagnosticsProvider, ITestDiagnostic } from './diagnosticProviders/diagnosticsProvider';
import { canExecutePythonCodeWithoutErrors, isValidPythonFile } from './diagnosticProviders/python';
import { simulateInlineChat } from './inlineChatSimulator';
import { fromFixture, getFixturesDir } from './stestUtil';
import { DiagnosticProviderId, IOutcome, IScenario } from './types';

export function fromNotebookFixture(pathOrDirnameWithinFixturesDir: string, activeCell?: number /** when provided, code in other cells will be emptied */) {
	const filePath: string = path.join(getFixturesDir(), pathOrDirnameWithinFixturesDir);
	const baseDirname: string = path.dirname(filePath);
	const fileName = path.relative(baseDirname, filePath);
	const fileContents = fs.readFileSync(filePath).toString();

	try {
		const notebook = JSON.parse(fileContents);
		const cells = notebook.cells as any[];
		notebook.cells = cells.map((cell, index) => {
			if (index !== activeCell) {
				return {
					...cell,
					source: ['']
				};
			} else {
				return cell;
			}
		});

		return { kind: 'relativeFile' as const, fileName, fileContents: JSON.stringify(notebook, undefined, 2) };
	} catch {
		return { kind: 'relativeFile' as const, fileName, fileContents };
	}
}

ssuite({ title: 'notebook', subtitle: 'edit', location: 'inline' }, () => {

	stest({ description: 'variables', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/variables.ipynb')],
			queries: [
				{
					file: 'variables.ipynb',
					activeCell: 0,
					selection: [2, 0, 2, 0],
					query: 'print seconds in a week',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(/print\(seconds_in_a_week/.test(outcome.fileContents));
					}
				}
			]
		});
	});

	stest({ description: 'dataframe', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/dataframe.ipynb')],
			queries: [
				{
					file: 'dataframe.ipynb',
					activeCell: 2,
					selection: [0, 0, 0, 0],
					query: 'add a new column called adjusted to the dataframe and set it to the value of the activity column minus 2',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('my_dataframe[\'adjusted\']') || outcome.fileContents.includes('my_dataframe[\"adjusted\"]'));
						assert.ok(!outcome.fileContents.includes('import'));
					}
				}
			]
		});
	});

	stest({ description: 'data cleansing', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/datacleansing.ipynb')],
			queries: [
				{
					file: 'datacleansing.ipynb',
					activeCell: 2,
					selection: [0, 0, 0, 0],
					query: 'check for missing values',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(!outcome.fileContents.includes('import'));
						assert.ok(outcome.fileContents.includes('mydf'));
						assert.ok(outcome.fileContents.includes('isnull') || outcome.fileContents.includes('dropna'));
					}
				}
			]
		});
	});

	stest({ description: 'plot', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/plot.ipynb')],
			queries: [
				{
					file: 'plot.ipynb',
					activeCell: 1,
					selection: [0, 0, 0, 0],
					query: 'plot the data frame',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(!outcome.fileContents.includes('import'));
						assert.ok(outcome.fileContents.includes('df.plot') || outcome.fileContents.includes('px.bar'));
					}
				}
			]
		});
	});

	stest({ description: '/fix notebook exection ImportError', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 0,
					selection: [0, 0, 0, 0],
					query: '/fix ModuleNotFoundError: No module named \'pandas\'',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(!outcome.fileContents.includes('!pip'));
						assert.ok(outcome.fileContents.includes('%pip install'));
						assert.ok(outcome.fileContents.indexOf('pip') === outcome.fileContents.lastIndexOf('pip'));
					}
				}
			]
		});
	});

	stest({ description: 'edit notebook code should not duplicate the content', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/edit.ipynb')],
			queries: [
				{
					file: 'edit.ipynb',
					activeCell: 0,
					selection: [6, 0, 8, 0],
					query: 'make the plot larger',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(
							outcome.fileContents.includes('plt.figure')
							|| outcome.fileContents.includes('plt.gcf')
						);
						// check if 'plt.figure' only shows up once
						const matches = outcome.fileContents.match(/(plt\.figure)|(plt\.gcf)/g);
						assert.strictEqual(matches?.length, 1);
					}
				}
			]
		});
	});

	stest({ description: 'set index', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/edit.ipynb')],
			queries: [
				{
					file: 'edit.ipynb',
					activeCell: 1,
					selection: [13, 0, 13, 0],
					query: 'Set the \'origin\' colum as the index of the dataframe',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('.set_index'));
						assert.strictEqual(outcome.fileContents.match(/set\_index/g)?.length, 1);
						assert.strictEqual(outcome.fileContents.match(/DataFrame/g)?.length, 1);
					}
				}
			]
		});
	});

	stest({ description: 'group by', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/edit.ipynb')],
			queries: [
				{
					file: 'edit.ipynb',
					activeCell: 2,
					selection: [6, 0, 6, 0],
					query: 'Group the entire dataframe by regiment and company',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('regiment.groupby'));
						assert.strictEqual(outcome.fileContents.match(/groupby/g)?.length, 1);
						assert.strictEqual(outcome.fileContents.match(/DataFrame/g)?.length, 1);
					}
				}
			]
		});
	});

	// import matplotlib.pyplot as plt

	// months = range(1, 13)
	// nyc_temp_2000 = [20.0, 30.5, 80.1, 80.3, 56.5, 99.6]
	// plt.plot(months, nyc_temp_2000)
	// stest({ description: '/fix Matplotlib: x and y must have same first dimension', language: 'python' }, (testingServiceCollection) => {
	// 	return runScenario(accessor, {
	// 		files: [fromFixture('notebook/errors.ipynb')],
	// 		queries: [
	// 			{
	// 				file: 'errors.ipynb',
	// 				activeCell: 6,
	// 				selection: [4, 0, 4, 0],
	// 				query: '/fix ValueError: x and y must have same first dimension, but have shapes (12,) and (6,)',
	// 				expectedIntent: 'edit',
	// 				validate: async (outcome, workspace, accessor) => {
	// 					assert.strictEqual(outcome.type, 'inlineEdit');
	// 					assert.strictEqual(outcome.appliedEdits.length, 1);
	// 					const edit = outcome.appliedEdits[0];
	// 					assert.ok(edit.newText.includes('global'));
	// 				}
	// 			}
	// 		]
	// 	});
	// });




	// NameError: name 'df' is not defined -> should suggest rerun cell
});

ssuite({ title: 'notebook', subtitle: 'generate', location: 'inline' }, () => {

	stest({ description: 'edit markdown cell should support code example', language: 'markdown' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/md.ipynb')],
			queries: [
				{
					file: 'md.ipynb',
					activeCell: 0,
					selection: [0, 0, 0, 0],
					query: 'describe fibonacci algorithm in markdown, along with code example',
					expectedIntent: 'generate',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('```'));
						const matches = outcome.fileContents.match(/\`\`\`/g);
						assert.ok(matches && matches.length > 0 && matches.length % 2 === 0);
					}
				}
			]
		});
	});

	stest({ description: 'Which was the most-ordered item', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/sales.ipynb')],
			queries: [
				{
					file: 'sales.ipynb',
					activeCell: 13,
					selection: [0, 0, 0, 0],
					query: 'Which was the most-ordered item? ', // How many items were orderd in total?
					expectedIntent: 'generate',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
					}
				}
			]
		});
	});

	stest({ description: 'How many items were orderd in total?', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/sales.ipynb')],
			queries: [
				{
					file: 'sales.ipynb',
					activeCell: 13,
					selection: [0, 0, 0, 0],
					query: 'WHow many items were orderd in total?',
					expectedIntent: 'generate',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
					}
				}
			]
		});
	});

	stest({ description: 'create a model to predict the likelihood of a flight being delayed', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/model.ipynb')],
			queries: [
				{
					file: 'model.ipynb',
					activeCell: 1,
					selection: [0, 0, 0, 0],
					query: 'create a model to predict the likelihood of a flight being delayed based on the day of the week and the arrival airport. Use Logistic regression and calculate the accuracy of the model.', //
					expectedIntent: 'generate',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
					}
				}
			]
		});
	});
});

ssuite({ title: 'notebook', subtitle: 'generate runtime', location: 'inline' }, () => {
	stest({ description: 'generate code uses obselete variable', language: 'python' }, (testingServiceCollection) => {
		const file = fromFixture('notebook/variablesruntime.ipynb');
		const testScenario: IScenario = {
			files: [file],
			queries: [
				{
					file: 'variablesruntime.ipynb',
					activeCell: 1,
					selection: [2, 0, 2, 0],
					query: 'Detect and remove outliers for delay columns',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.strictEqual(outcome.fileContents.indexOf('[delay_columns]') >= 0 || outcome.fileContents.indexOf('delay_columns =') >= 0 || outcome.fileContents.indexOf('delay_columns:') >= 0, true);
					}
				}
			],
			extraWorkspaceSetup: async (workspace) => {
				const notebook = workspace.getNotebookDocuments()[0];
				if (notebook) {
					const variables: VariablesResult[] = [
						{
							variable: {
								name: 'delay_columns',
								value: `['DepDelay', 'ArrDelay']`,
								type: 'list'
							},
							hasNamedChildren: false,
							indexedChildrenCount: 2
						}
					];
					testingServiceCollection.define(INotebookService, new SyncDescriptor(
						SimulationNotebookService,
						[
							workspace,
							new ResourceMap<VariablesResult[]>([
								[
									notebook.uri,
									variables
								]
							])
						]
					));
					testingServiceCollection.define(IAlternativeNotebookContentService, new SyncDescriptor(
						SimulationAlternativeNotebookContentService,
						[]
					));
					testingServiceCollection.define(IAlternativeNotebookContentEditGenerator, new SyncDescriptor(
						AlternativeNotebookContentEditGenerator
					));
					testingServiceCollection.define(IDiffService, new SyncDescriptor(
						DiffServiceImpl
					));
				}
			}
		};
		return simulateInlineChat(testingServiceCollection, testScenario);
	});
});

ssuite({ title: 'notebook', subtitle: 'fix runtime', location: 'inline' }, () => {
	stest({ description: '/fix notebook execution ImportError, insert at top', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 0,
					selection: [0, 0, 0, 0],
					query: '/fix ModuleNotFoundError: No module named \'pandas\'',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						// assert(outcome.appliedEdits.length > 0, 'at least 1 edit generated');
						assert.ok(outcome.fileContents.indexOf('import pandas') >= 0);
						// assert.ok(await isValidPythonFile(accessor, outcome.fileContents));
					}
				}
			]
		});
	});

	stest({ description: '/fix ValueError: The truth value of an array with more than one element is ambiguous', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 1,
					selection: [4, 0, 4, 0],
					query: '/fix ValueError: The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						if (!outcome.fileContents.includes('A | B') && !outcome.fileContents.includes('np.logical_or(A, B)')) {
							assert.ok(outcome.fileContents.includes('A.any()'));
							assert.ok(outcome.fileContents.includes('B.any()'));
						}
					}
				}
			]
		});
	});

	stest({ description: '/fix Tensorflow InvalidArgumentError', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 2,
					selection: [1, 0, 1, 0],
					query: '/fix InvalidArgumentError: {{function_node __wrapped__Reshape_device_/job:localhost/replica:0/task:0/device:CPU:0}} Input to reshape is a tensor with 3 values, but the requested shape has 2 [Op:Reshape]',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('reshape'));
					}
				}
			]
		});
	});

	stest({ description: '/fix Tensorflow model has not yet been built', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromNotebookFixture('notebook/errors.ipynb', 3)],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 3,
					selection: [4, 0, 4, 0],
					query: '/fix ValueError: This model has not yet been built. Build the model first by calling `build()` or by calling the model on a batch of data.',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						// assert.ok(outcome.fileContents.includes('.build'));
					}
				}
			]
		});
	});

	stest({ description: '/fix numpy, unsupported operand types', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromNotebookFixture('notebook/errors.ipynb', 4)],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 4,
					selection: [3, 0, 3, 0],
					query: '/fix TypeError: unsupported operand type(s) for +: \'int\' and \'NoneType\'',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(
							!outcome.fileContents.includes('None') ||
							outcome.fileContents.includes(' != None') ||
							outcome.fileContents.includes(' == None') || (
								(outcome.fileContents.includes('np.array([1, np.nan, 3, 4])') && outcome.fileContents.includes('nansum(vals1)'))
							));
					}
				}
			]
		});
	});

	stest({ description: '/fix UnboundLocalError, local variable referenced before assignment', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 5,
					selection: [3, 0, 3, 0],
					query: '/fix UnboundLocalError: local variable \'a_var\' referenced before assignment',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
					}
				}
			]
		});
	});

	stest({ description: '/fix name conflict with builtin function', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 6,
					selection: [0, 0, 4, 16],
					query: '/fix TypeError: \'int\' object is not callable',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(!outcome.fileContents.includes('max = 0'));
					}
				}
			]
		});
	});

	stest({ description: '/fix AttributeError: can\'t set attribute', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 7,
					selection: [9, 0, 9, 0],
					query: '/fix AttributeError: can\'t set attribute',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('@x.setter'));
					}
				}
			]
		});
	});

	stest({ description: '/fix TypeError: Index does not support mutable operations', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 8,
					selection: [3, 0, 3, 0],
					query: '/fix TypeError: Index does not support mutable operations',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('ind.set_value') || outcome.fileContents.includes('list(ind)') || outcome.fileContents.includes('ind.tolist()') || outcome.fileContents.includes('ind.delete('));
					}
				}
			]
		});
	});

	stest({ description: '/fix TypeError: str object is not an iterator', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 9,
					selection: [1, 0, 1, 0],
					query: '/fix TypeError: str object is not an iterator',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('iter('));
					}
				}
			]
		});
	});

	stest({ description: '/fix TypeError: can only concatenate str (not "int") to str', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromNotebookFixture('notebook/errors.ipynb', 10)],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 10,
					selection: [0, 0, 0, 0],
					query: '/fix TypeError: can only concatenate str (not "int") to str',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('float(') || outcome.fileContents.includes('int(') || outcome.fileContents.includes('str('));
					}
				}
			]
		});
	});

	stest({ description: '/fix Missing import, name \'array\' is not defined', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 11,
					selection: [0, 0, 0, 0],
					query: '/fix NameError: name \'array\' is not defined',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('np.array') || outcome.fileContents.includes('from numpy import'));
						// assert.ok(await isValidPythonFile(accessor, outcome.fileContents));
					}
				}
			]
		});
	});

	stest({ description: '/fix can only concatenate list (not "str") to list', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/errors.ipynb')],
			queries: [
				{
					file: 'errors.ipynb',
					activeCell: 12,
					selection: [1, 0, 1, 0],
					query: '/fix TypeError: can only concatenate list (not "str") to list',
					expectedIntent: 'edit',
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'inlineEdit');
						assert.ok(outcome.fileContents.includes('[\'bar\']') || outcome.fileContents.includes('foo.append'));
						assert.ok(await isValidPythonFile(accessor, outcome.fileContents));
					}
				}
			]
		});
	});
});

ssuite({ title: 'notebook', subtitle: 'fix', location: 'inline' }, () => {
	stest({ description: 'cannot instantiate abstract class', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing0.ipynb')],
			queries: [
				{
					file: 'fixing0.ipynb',
					selection: [9, 4, 9, 4],
					activeCell: 0,
					query: `/fix Cannot instantiate abstract class "Base"\n  "Base.foo" is abstract`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'all Annotated types should include at least two type arguments', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing1.ipynb')],
			queries: [
				{
					file: 'fixing1.ipynb',
					selection: [4, 3, 4, 3],
					activeCell: 0,
					query: `/fix Expected one type argument and one or more annotations for "Annotated"`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'should not generate an error for variables declared in outer scopes', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing2.ipynb')],
			queries: [
				{
					file: 'fixing2.ipynb',
					selection: [24, 8, 24, 8],
					activeCell: 0,
					query: `/fix "d" is not defined`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'async cannot be used in a non-async function', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing3.ipynb')],
			queries: [
				{
					file: 'fixing3.ipynb',
					selection: [17, 4, 17, 4],
					activeCell: 0,
					query: `/fix Use of "async" not allowed outside of async function`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'await cannot be used in a non-async function', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing4.ipynb')],
			queries: [
				{
					file: 'fixing4.ipynb',
					selection: [14, 0, 14, 0],
					activeCell: 0,
					query: `/fix "await" allowed only within async function`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'bad token', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing5.ipynb')],
			queries: [
				{
					file: 'fixing5.ipynb',
					selection: [4, 7, 4, 7],
					activeCell: 0,
					query: `/fix Invalid character in identifier`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'Bar does not define a do_something2 method', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing6.ipynb')],
			queries: [
				{
					file: 'fixing6.ipynb',
					selection: [28, 0, 28, 0],
					activeCell: 0,
					query: [
						`/fix Cannot access member "do_something2" for type "Bar"`,
						`  Member "do_something2" is unknown`
					].join('\n'),
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 35 of /fix dataset version 10
	// In the AML run, copilot did not understand the error and did not fix it
	stest({ description: '(AML-10-35) can not access member', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing7.ipynb')],
			queries: [
				{
					file: 'fixing7.ipynb',
					selection: [2, 23, 2, 23],
					activeCell: 0,
					query: [
						`/fix Cannot access member "includes" for type "set[Unknown]"`,
						`  Member "includes" is unknown`
					].join('\n'),
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 36 of /fix dataset version 10
	// In the AML run, copilot did not understand the error and did not fix it
	stest({ description: '(AML-10-36) can not be assigned 2', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing8.ipynb')],
			queries: [
				{
					file: 'fixing8.ipynb',
					selection: [4, 19, 4, 19],
					activeCell: 0,
					query: `/fix Expression of type "list[None]" cannot be assigned to declared type "List[int] | None"`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 4 of /fix dataset version 10
	// In the AML run, copilot did not understand the error and did not fix it
	stest({ description: '(AML-10-4) parameter already assigned', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing9.ipynb')],
			queries: [
				{
					file: 'fixing9.ipynb',
					selection: [7, 33, 7, 33],
					activeCell: 0,
					query: `/fix Parameter "input_shape" is already assigned`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 48 of /fix dataset version 10
	// In the AML run, copilot did not understand the error and did not fix it
	stest({ description: '(AML-10-48) can not be assigned 3', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing10.ipynb')],
			queries: [
				{
					file: 'fixing10.ipynb',
					selection: [9, 14, 9, 14],
					activeCell: 0,
					query: [
						`/fix Argument of type "dict[str, int]" cannot be assigned to parameter "platforms" of type "list[str] | str" in function "setup"`,
						`  Type "dict[str, int]" cannot be assigned to type "list[str] | str"`,
						`    "dict[str, int]" is incompatible with "list[str]"`,
						`    "dict[str, int]" is incompatible with "str"`,
					].join('\n'),
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 58 of /fix dataset version 10
	// The AML run has removed a big part of the code and replaced with non-minimal edits, this initial issue was not resolved
	stest({ description: '(AML-10-58) not defined', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing11.ipynb')],
			queries: [
				{
					file: 'fixing11.ipynb',
					selection: [7, 20, 7, 20],
					activeCell: 0,
					query: `/fix "T_Or" is not defined`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 29 of /fix dataset version 10
	stest({ description: '(AML-10-29) instance of bool has no to_string member', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing12.ipynb')],
			queries: [
				{
					file: 'fixing12.ipynb',
					selection: [1, 19, 1, 19],
					activeCell: 0,
					query: `/fix`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	// Inspired by case 110 of /fix dataset version 8
	stest({ description: '(AML-8-110) not defined', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing13.ipynb')],
			queries: [
				{
					file: 'fixing13.ipynb',
					selection: [7, 20, 7, 20],
					activeCell: 0,
					query: `/fix Instance methods should take a "self" parameter`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});


	// Inspired by case 73 of /fix dataset version 8
	stest({ description: '(AML-8-73) no value for argument in function call', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing14.ipynb')],
			queries: [
				{
					file: 'fixing14.ipynb',
					selection: [12, 16, 12, 16],
					activeCell: 0,
					query: `/fix Argument missing for parameter "error_message"`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'undefined variable', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing15.ipynb')],
			queries: [
				{
					file: 'fixing15.ipynb',
					selection: [0, 0, 0, 4],
					activeCell: 0,
					query: `/fix "Play" is not defined`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'general type issue', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing16.ipynb')],
			queries: [
				{
					file: 'fixing16.ipynb',
					selection: [29, 22, 29, 25],
					activeCell: 0,
					query: [
						`/fix Argument of type "Msg[Foo]" cannot be assigned to parameter "msg" of type "Msg[FooBar]" in function "handle"`,
						`  "Msg[Foo]" is incompatible with "Msg[FooBar]"`,
						`    Type parameter "T@Msg" is invariant, but "Foo" is not the same as "FooBar"`
					].join('\n'),
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'optional member access', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing17.ipynb')],
			queries: [
				{
					file: 'fixing17.ipynb',
					selection: [12, 23, 12, 28],
					activeCell: 0,
					query: `/fix "upper" is not a known member of "None"`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});

	stest({ description: 'unbound variable', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fixing/fixing18.ipynb')],
			queries: [
				{
					file: 'fixing18.ipynb',
					selection: [4, 11, 4, 12],
					activeCell: 0,
					query: `/fix "a" is possibly unbound`,
					expectedIntent: Intent.Fix,
					diagnostics: 'pyright',
					validate: async (outcome, workspace, accessor) => assertNoCellDiagnosticsAsync(accessor, outcome, workspace, 'pyright')
				}
			]
		});
	});
});

const shouldEvaluate = 1 >> 1;

ssuite.optional((opes) => !shouldEvaluate, { title: 'notebook', subtitle: 'mbpp', location: 'inline' }, () => {
	const mbppFile = fromFixture('notebook/filtered-mbpp.json');
	const mbppTests = JSON.parse(mbppFile.fileContents).tests;
	const testScenarios: { task_id: number; text: string; test_list: string[] }[] = mbppTests.map((test: any) => ({
		task_id: test.task_id,
		text: test.prompt,
		test_list: test.test_list.map((line: string) => `${line}\n`)
	}));

	for (const test of testScenarios) {
		const prompt = test.text;
		const test_list = test.test_list;
		const task_id = test.task_id;

		stest({ description: 'mbpp ' + task_id + ' ' + prompt, language: 'python' }, async (testingServiceCollection) => {
			const templateFile = fromFixture('notebook/mbpp.ipynb');

			const notebook = JSON.parse(templateFile.fileContents);
			const cells = notebook.cells as any[];
			const cell = cells[1];
			cell.source = test_list;

			const notebookFile = { kind: 'relativeFile' as const, fileName: templateFile.fileName, fileContents: JSON.stringify(notebook, undefined, 2) };

			return simulateInlineChat(testingServiceCollection, {
				files: [notebookFile],
				queries: [
					{
						file: notebookFile.fileName,
						activeCell: 0,
						selection: [0, 0, 0, 0],
						query: `${prompt} Your code should pass the tests in the next cell.`,
						expectedIntent: 'edit',
						validate: async (outcome, _workspace, accessor) => {
							assert.strictEqual(outcome.type, 'inlineEdit');

							if (shouldEvaluate) {
								const testTimeoutPromise = new Promise<void>((_, reject) => {
									setTimeout(() => reject(new Error('Test execution timed out')), 60000);
								});

								await Promise.race([testTimeoutPromise, assertPythonCodeIsValid(accessor, outcome.fileContents, 'Generated Code is not valid', 'Generated not did not execute without errors')]);

								const codeWithTests = `${outcome.fileContents}${EOL}${EOL}${EOL}# Tests${EOL}${EOL}${test_list.join('')}`;
								await Promise.race([testTimeoutPromise, assertPythonCodeIsValid(accessor, codeWithTests, 'Generated Code with Tests is not valid', 'Generated did not pass the tests')]);
							}
						}
					}
				]
			});
		});
	}
});

function generateMBPPNotebookFixture(pathOrDirnameWithinFixturesDir: string, tests: string[]) {
	const filePath = path.join(getFixturesDir(), pathOrDirnameWithinFixturesDir);
	const baseDirname = path.dirname(filePath);
	const fileName = path.relative(baseDirname, filePath);
	const uri = URI.parse(filePath);
	const fileContents = fs.readFileSync(filePath).toString();

	try {
		const notebook = JSON.parse(fileContents);
		const cells = notebook.cells as any[];
		const cell = cells[1];
		cell.source = tests;

		return { kind: 'relativeFile' as const, uri, fileName, fileContents: JSON.stringify(notebook, undefined, 2) };
	} catch {
		return { kind: 'relativeFile' as const, uri, fileName, fileContents };
	}
}


ssuite.optional((opes) => !shouldEvaluate || true, { title: 'notebook', subtitle: 'notebookEditsMbpp', location: 'panel' }, () => {
	const mbppFile = fromFixture('notebook/filtered-mbpp.json');
	const mbppTests = JSON.parse(mbppFile.fileContents).tests;
	const testScenarios: { task_id: number; text: string; test_list: string[] }[] = mbppTests.map((test: any) => ({
		task_id: test.task_id,
		text: test.prompt,
		test_list: test.test_list.map((line: string) => `${line}\n`)
	}));

	for (const test of testScenarios) {
		const prompt = test.text;
		const test_list = test.test_list;
		const task_id = test.task_id;

		stest({ description: 'mbpp ' + task_id + ' ' + prompt, language: 'python' }, async (testingServiceCollection) => {
			const notebookFile = generateMBPPNotebookFixture('notebook/mbpp.ipynb', test_list);
			const disposables = new DisposableStore();

			const nbJson = JSON.parse(notebookFile.fileContents);
			const cells = nbJson.cells as any[];
			const cell = cells[1];
			cell.source = test_list;

			let notebook: NotebookDocument;
			const currentFile: IFile = {
				kind: 'qualifiedFile',
				uri: notebookFile.uri,
				fileContents: JSON.stringify(nbJson, undefined, 2)
			};

			return simulateInlineChat(testingServiceCollection, {
				files: [currentFile],
				async extraWorkspaceSetup(workspace) {
					const extHostNotebook = ExtHostNotebookDocumentData.createJupyterNotebook(notebookFile.uri, notebookFile.fileContents, workspace);
					notebook = extHostNotebook.document;
					// TODO@DonJayamanne
				},
				async onBeforeStart(accessor) {
					(accessor.get<IAlternativeNotebookContentService>(IAlternativeNotebookContentService) as MockAlternativeNotebookContentService).format = AlternativeNotebookFormat.json;
				},
				queries: [
					{
						file: currentFile.uri,
						activeCell: 0,
						selection: [1, 0, 1, 0],
						query: `${prompt} Your code should pass the tests in the next cell.`,
						expectedIntent: 'edit',
						validate: async (_outcome, _workspace, accessor) => {
							if (shouldEvaluate) {
								const testTimeoutPromise = new Promise<void>((_, reject) => {
									setTimeout(() => reject(new Error('Test execution timed out')), 60000);
								});

								await Promise.race([testTimeoutPromise, assertPythonCodeIsValid(accessor, notebook.cellAt(0).document.getText(), 'Generated Code is not valid', 'Generated not did not execute without errors')]);

								const codeWithTests = `${notebook.cellAt(0).document.getText()}${EOL}${EOL}${EOL}# Tests${EOL}${EOL}${notebook.cellAt(1).document.getText()}`;
								await Promise.race([testTimeoutPromise, assertPythonCodeIsValid(accessor, codeWithTests, 'Generated Code with Tests is not valid', 'Generated code did not pass the tests')]);
							}
						}
					}
				]
			}).finally(() => disposables.dispose());
		});
	}
});

async function assertPythonCodeIsValid(accessor: ITestingServicesAccessor, pythonCode: string, validationMessage: string, executionMessage: string): Promise<void> {
	const cellIsValid = await isValidPythonFile(accessor, pythonCode);
	assert.ok(cellIsValid, `${validationMessage}:${EOL}${pythonCode}`);

	const cellExecutesWithoutErrors = await canExecutePythonCodeWithoutErrors(accessor, pythonCode);
	assert.ok(cellExecutesWithoutErrors, `${executionMessage}:${EOL}${pythonCode}`);
}

async function getNotebookCellDiagnostics(accessor: ITestingServicesAccessor, workspace: SimulationWorkspace, method: DiagnosticProviderId | DiagnosticsProvider): Promise<ITestDiagnostic[]> {
	const files = workspace.documents.filter(doc => doc.document.uri.scheme === Schemas.vscodeNotebookCell).map(doc => ({ fileName: workspace.getFilePath(doc.document.uri), fileContents: doc.document.getText() }));
	if (typeof method === 'string') {
		return await getDiagnostics(accessor, files, method);
	} else {
		return await method.getDiagnostics(accessor, files);
	}
}

async function assertNoCellDiagnosticsAsync(accessor: ITestingServicesAccessor, outcome: IOutcome, workspace: SimulationWorkspace, method: DiagnosticProviderId | DiagnosticsProvider) {
	assert.strictEqual(outcome.type, 'inlineEdit');
	const diagnostics = await getNotebookCellDiagnostics(accessor, workspace, method);
	if (diagnostics.length > 0) {
		for (const diagnostic of diagnostics) {
			if (diagnostic.message.indexOf('indent') !== -1) {
				outcome.annotations.push({ label: 'indentation', message: diagnostic.message, severity: 'warning' });
			}
		}
	}
	assert.deepStrictEqual(diagnostics.length, 0, JSON.stringify(diagnostics, undefined, 2));
}
