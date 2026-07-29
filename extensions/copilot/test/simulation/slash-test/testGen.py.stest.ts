/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as path from 'path';
import { Intent } from '../../../src/extension/common/constants';
import { IQualifiedFile, IRelativeFile } from '../../../src/platform/test/node/simulationWorkspace';
import { toPosixPath } from '../../../src/util/vs/base/common/extpath';
import { Schemas } from '../../../src/util/vs/base/common/network';
import { isWindows } from '../../../src/util/vs/base/common/platform';
import { URI } from '../../../src/util/vs/base/common/uri';
import { ssuite, stest } from '../../base/stest';
import { simulateInlineChat } from '../inlineChatSimulator';
import { assertSomeStrings, assertWorkspaceEdit, fromFixture } from '../stestUtil';
import { getFileContent } from '../outcomeValidators';

ssuite({ title: '/tests', location: 'inline', language: 'python', }, () => {

	stest('py with pyproject.toml', (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [
				fromFixture('tests/py-pyproject-toml/', 'src/mmath/add.py'),
			],
			queries: [{
				file: 'src/mmath/add.py',
				selection: [0, 4],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);
					assert.strictEqual(outcome.files.length, 1, 'Expected one file to be created');
					assertSomeStrings(
						getFileContent(outcome.files[0]),
						[
							'import unittest',
							'from mmath.add import add',
						],
						2
					);
				}
			}],
		});
	});

	stest({ description: 'select existing test file using *_test.py format', language: 'python', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py_end_test'))
			],
			files: [
				fromFixture('tests/py_end_test/', 'src/ex.py'),
				fromFixture('tests/py_end_test/', 'tests/ex_test.py'),
			],
			queries: [{
				file: 'src/ex.py',
				selection: [3, 7],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					// Here the existing ex_test.py file should be found and edited for the newest test written
					assertWorkspaceEdit(outcome);
					assert.strictEqual(outcome.files.length, 1, 'Expected one file to be created');
					// make sure type is IRelativeFile
					assert.ok(outcome.files[0].hasOwnProperty('fileName'));
					const relFile = <IRelativeFile>outcome.files[0];
					assert.strictEqual(relFile.fileName, 'ex_test.py');
					assert.ok(getFileContent(outcome.files[0]).includes('decimal_to_fraction'));
				}
			}],
		});
	});

	stest({ description: 'test with docstring', language: 'python', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py_start_test'))
			],
			files: [
				fromFixture('tests/py_start_test/', 'src/ex.py'),
				fromFixture('tests/py_start_test/', 'tests/test_ex.py'),
			],
			queries: [{
				file: 'src/ex.py',
				selection: [3, 7],
				query: '/tests include a docstring',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					// Here the outcome should include a docstring as requested in the query
					assertWorkspaceEdit(outcome);
					assert.strictEqual((getFileContent(outcome.files[0]).match(/"""/g) || []).length, 2, 'Expected 2 instances of """ in the test file for the doc string');
				}
			}],
		});
	});

	stest({ description: 'parameterized tests', language: 'python', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py_start_test'))
			],
			files: [
				fromFixture('tests/py_start_test/', 'src/ex.py'),
				fromFixture('tests/py_start_test/', 'tests/test_ex.py'),
			],
			queries: [{
				file: 'src/ex.py',
				selection: [3, 7],
				query: '/tests make them parameterized tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					// Here the outcome should include parameterized tests as requested in the query
					assertWorkspaceEdit(outcome);
					assert.ok(getFileContent(outcome.files[0]).includes('import pytest'), 'Expected pytest import to be included');
					assert.ok(getFileContent(outcome.files[0]).includes('@pytest.mark.parametrize'), 'Expected parameterized test decorator to be included');
				}
			}],
		});
	});

	stest({ description: 'select test folder if exists for new test files', language: 'python', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py_start_test'))
			],
			files: [
				fromFixture('tests/py_start_test/', 'src/ex.py'),
				fromFixture('tests/py_start_test/', 'src/measure.py'),
				fromFixture('tests/py_start_test/', 'tests/test_ex.py'),
			],
			queries: [{
				file: 'src/measure.py',
				selection: [1, 3],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					// Here the general expectation is that the test file should be created in the existing test folder
					// since the workspace has ex.py and test_ex.py defined; new tests should follow existing location / naming conventions
					assertWorkspaceEdit(outcome);
					assert.strictEqual(outcome.files.length, 1, 'Expected one file to be created');
					assert.ok(outcome.files[0].hasOwnProperty('uri'));
					const relFile = <IQualifiedFile>outcome.files[0];
					assert.ok(relFile.uri.fsPath.endsWith('/tests/'), 'Expected test file to be in the existing test folder');
					assert.ok(relFile.uri.fsPath.endsWith('/tests/measure_test.py'), 'Expected test file to be named in the same style as existing test files');

					assert.ok(getFileContent(outcome.files[0]).includes('from src.measure import cm_to_inches'), 'Expected correct import to be generated');
					assert.ok(getFileContent(outcome.files[0]).includes('cm_to_inches'), 'Expected function to be tested to be included in the test file');


				}
			}],
		});
	});

	stest({ description: 'focal file at repo root', language: 'python', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py_start_test'))
			],
			files: [
				fromFixture('tests/py_repo_root/', '__init__.py'),
				fromFixture('tests/py_repo_root/', 'temp.py'),
			],
			queries: [{
				file: 'temp.py',
				selection: [1, 24],
				query: '/tests make them parameterized tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					// Here the expectation is that the test file should be created in the root of the repo, next to the focal file
					// since the focal file is at the root (even though __init__.py exists), relative imports are not possible
					assertWorkspaceEdit(outcome);
					assert.ok(outcome.files[0].hasOwnProperty('uri'), 'Expected test file to be a newly created file as no testing files exist');
					const relFile = <IQualifiedFile>outcome.files[0];
					assert.ok(relFile.uri.fsPath.includes('test') && relFile.uri.fsPath.includes('.py') && relFile.uri.fsPath.includes('temp'), 'Expected test file to include "test", ".py" and the name of the focal file');
					assert.ok(getFileContent(outcome.files[0]).includes('from . import ') === false, 'Expected no "from . import" statement');
					assert.ok(getFileContent(outcome.files[0]).includes('import .') === false, 'Expected no "import ." statement');
					assert.ok(getFileContent(outcome.files[0]).includes('convert_temperature'), 'Expected to call the function from the focal file');
					assert.ok(getFileContent(outcome.files[0]).includes('import'), 'Expected import to be generated as this is a new file');
				}
			}],
		});
	});

	stest({ description: 'update import statement', language: 'python', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py_start_test'))
			],
			files: [
				fromFixture('tests/py_start_test/', 'src/ex.py'),
				fromFixture('tests/py_start_test/', 'tests/test_ex.py'),
			],
			queries: [{
				file: 'src/ex.py',
				selection: [3, 7],
				query: '/tests include a docstring',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);
					// check that the import statement is updated when a new function is being added as a reference in the test file
					assert.ok(outcome.files[0].hasOwnProperty('fileName'), 'Expect new file created, which makes it a IRelativeFile with a fileName');
					assert.ok((getFileContent(outcome.files[0]).includes('from src.ex import fraction_to_decimal, decimal_to_fraction')) || (getFileContent(outcome.files[0]).includes('from .ex import fraction_to_decimal, decimal_to_fraction')), 'Expected import statement to be updated with newest function.');
				}
			}],
		});
	});

	stest({ description: 'python add to existing', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py-pyproject-toml'))
			],
			files: [
				fromFixture('tests/py-pyproject-toml/', 'src/mmath/add.py'),
				fromFixture('tests/py-pyproject-toml/', 'src/mmath/sub.py'),
				fromFixture('tests/py-pyproject-toml/', 'src/mmath/__init__.py'),
				fromFixture('tests/py-pyproject-toml/', 'tests/test_sub.py'),
			],
			queries: [{
				file: 'src/mmath/sub.py',
				selection: [4, 7],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);
					if (outcome.type === 'workspaceEdit') {
						const workspaceEdits = outcome.edits.entries();
						assert.strictEqual(workspaceEdits.length, 1, 'Expected exactly one file to be edited');
						const workspaceEditUri: URI = workspaceEdits[0][0];
						// check that the file 'tests/test_sub.py' was the one edited
						const posixPath = isWindows ? toPosixPath(workspaceEditUri.path) : workspaceEditUri.path;
						assert.ok(posixPath.endsWith('tests/test_sub.py'), 'Expected the URI of the first edit to end with "tests/test_sub.py"');
					}
				}
			}],
		});
	});

	stest({ description: 'python correct import', language: 'python' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			workspaceFolders: [
				URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/py-extra-nested'))
			],
			files: [
				fromFixture('tests/py-extra-nested/', 'focus_module/data_controllers/grocery.py'),
				fromFixture('tests/py-extra-nested/', 'tests/integration/test_other.py'),
				fromFixture('tests/py-extra-nested/', 'focus_module/data_controllers/__init__.py'),
			],
			queries: [{
				file: 'focus_module/data_controllers/grocery.py',
				selection: [6, 8],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);
					if (outcome.type === 'workspaceEdit') {
						const workspaceEdits = outcome.edits.entries();
						assert.strictEqual(workspaceEdits.length, 1, 'Expected exactly one file to be edited');
						const workspaceEditUri: URI = workspaceEdits[0][0];

						assert.ok(workspaceEditUri.fsPath.endsWith('test_grocery.py'), 'Expected the URI of the first edit to end with "tests/test_grocery.py"');
						// the optimal import statement would be 'from .grocery import create_grocery_item' or 'from . import grocery'
						assert.ok(getFileContent(outcome.files[0]).includes('from .grocery') ||
							getFileContent(outcome.files[0]).includes('from . import grocery'));
					}
				}
			}],
		});

	});
});

ssuite({ title: '/tests', subtitle: 'real world', location: 'inline', language: 'python', }, () => {

	stest('creates new test file with test method and includes method name and test method name', (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [
				fromFixture('tests/py-newtest-4658/', 'ex.py'),
			],
			queries: [{
				file: 'ex.py',
				selection: [0, 18],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);

					assert.strictEqual(outcome.files.length, 1);

					const [first] = outcome.files;
					assert.strictEqual((<IQualifiedFile>first).uri.scheme, Schemas.untitled);
					assert.ok((<IQualifiedFile>first).uri.path.endsWith('test_ex.py'));

					assertSomeStrings(getFileContent(first),
						[
							' check_skipped_condition',
							'test_check_skipped_condition'
						],
						2
					);
				}
			}]
		});
	});
});
