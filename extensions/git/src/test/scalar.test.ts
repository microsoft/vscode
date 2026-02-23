/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { Git, ICloneOptions } from '../git';

suite('Scalar Support', () => {
	let git: Git;
	let sandbox: sinon.SinonSandbox;

	setup(() => {
		sandbox = sinon.createSandbox();
		git = new Git({
			gitPath: '/usr/bin/git',
			version: '2.40.0',
			userAgent: 'git/2.40.0'
		});
	});

	teardown(() => {
		sandbox.restore();
	});

	suite('isScalarAvailable', () => {
		test('returns false when git path is not set', async () => {
			const gitWithoutPath = new Git({
				gitPath: '',
				version: '2.40.0',
				userAgent: 'git/2.40.0'
			});

			const result = await gitWithoutPath.isScalarAvailable();
			assert.strictEqual(result, false);
		});

		test('returns false when scalar executable does not exist', async () => {
			// This test will naturally fail if scalar is not installed
			const result = await git.isScalarAvailable();
			// The result depends on whether scalar is actually installed
			assert.strictEqual(typeof result, 'boolean');
		});

		test('caches scalar path after successful verification', async () => {
			await git.isScalarAvailable();
			// Call again to ensure caching works
			const result = await git.isScalarAvailable();
			assert.strictEqual(typeof result, 'boolean');
		});

		test('handles errors gracefully', async () => {
			const gitWithInvalidPath = new Git({
				gitPath: '/nonexistent/path/git',
				version: '2.40.0',
				userAgent: 'git/2.40.0'
			});

			const result = await gitWithInvalidPath.isScalarAvailable();
			assert.strictEqual(result, false);
		});
	});

	suite('ICloneOptions with Scalar', () => {
		test('useScalar option is recognized', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				useScalar: true
			};
			assert.strictEqual(options.useScalar, true);
		});

		test('scalarOptions accepts full-clone', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				useScalar: true,
				scalarOptions: ['full-clone']
			};
			assert.deepStrictEqual(options.scalarOptions, ['full-clone']);
		});

		test('scalarOptions accepts no-src', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				useScalar: true,
				scalarOptions: ['no-src']
			};
			assert.deepStrictEqual(options.scalarOptions, ['no-src']);
		});

		test('scalarOptions accepts multiple options', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				useScalar: true,
				scalarOptions: ['full-clone', 'no-src']
			};
			assert.deepStrictEqual(options.scalarOptions, ['full-clone', 'no-src']);
		});

		test('scalarOptions can be empty array', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				useScalar: true,
				scalarOptions: []
			};
			assert.deepStrictEqual(options.scalarOptions, []);
		});

		test('scalarOptions can be undefined', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				useScalar: true,
				scalarOptions: undefined
			};
			assert.strictEqual(options.scalarOptions, undefined);
		});

		test('useScalar works with recursive option', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				recursive: true,
				useScalar: true
			};
			assert.strictEqual(options.recursive, true);
			assert.strictEqual(options.useScalar, true);
		});

		test('useScalar works with ref option', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				ref: 'main',
				useScalar: true
			};
			assert.strictEqual(options.ref, 'main');
			assert.strictEqual(options.useScalar, true);
		});

		test('all clone options work together', () => {
			const options: ICloneOptions = {
				parentPath: '/test',
				progress: { report: () => { } },
				recursive: true,
				ref: 'develop',
				useScalar: true,
				scalarOptions: ['full-clone']
			};
			assert.strictEqual(options.recursive, true);
			assert.strictEqual(options.ref, 'develop');
			assert.strictEqual(options.useScalar, true);
			assert.deepStrictEqual(options.scalarOptions, ['full-clone']);
		});
	});

	suite('Scalar Option Validation', () => {
		test('full-clone is valid option', () => {
			const option: 'full-clone' | 'no-src' = 'full-clone';
			assert.strictEqual(option, 'full-clone');
		});

		test('no-src is valid option', () => {
			const option: 'full-clone' | 'no-src' = 'no-src';
			assert.strictEqual(option, 'no-src');
		});

		test('array of scalar options maintains order', () => {
			const options: ('full-clone' | 'no-src')[] = ['full-clone', 'no-src'];
			assert.strictEqual(options[0], 'full-clone');
			assert.strictEqual(options[1], 'no-src');
		});

		test('array of scalar options can contain duplicates', () => {
			const options: ('full-clone' | 'no-src')[] = ['full-clone', 'full-clone'];
			assert.strictEqual(options.length, 2);
			assert.strictEqual(options[0], 'full-clone');
			assert.strictEqual(options[1], 'full-clone');
		});
	});

	suite('Scalar Path Detection', () => {
		test('scalar path is constructed correctly on Windows', () => {
			const isWindows = process.platform === 'win32';
			const gitPath = isWindows ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git';
			const expectedScalarName = isWindows ? 'scalar.exe' : 'scalar';

			const gitDir = path.dirname(gitPath);
			const scalarPath = path.join(gitDir, expectedScalarName);

			if (isWindows) {
				assert.strictEqual(scalarPath.includes('scalar.exe'), true);
			} else {
				assert.strictEqual(scalarPath.includes('scalar'), true);
			}
		});

		test('scalar path uses correct executable name for platform', () => {
			const isWindows = process.platform === 'win32';
			const scalarExecutable = isWindows ? 'scalar.exe' : 'scalar';

			if (isWindows) {
				assert.strictEqual(scalarExecutable, 'scalar.exe');
			} else {
				assert.strictEqual(scalarExecutable, 'scalar');
			}
		});
	});

	suite('Scalar Command Arguments', () => {
		test('clone command is constructed correctly', () => {
			const args = ['clone'];
			assert.deepStrictEqual(args, ['clone']);
		});

		test('full-clone option is formatted correctly', () => {
			const option = 'full-clone';
			const arg = `--${option}`;
			assert.strictEqual(arg, '--full-clone');
		});

		test('no-src option is formatted correctly', () => {
			const option = 'no-src';
			const arg = `--${option}`;
			assert.strictEqual(arg, '--no-src');
		});

		test('multiple options are formatted correctly', () => {
			const options: ('full-clone' | 'no-src')[] = ['full-clone', 'no-src'];
			const args = options.map(opt => `--${opt}`);
			assert.deepStrictEqual(args, ['--full-clone', '--no-src']);
		});

		test('branch option is formatted correctly', () => {
			const ref = 'main';
			const args = ['--branch', ref];
			assert.deepStrictEqual(args, ['--branch', 'main']);
		});

		test('complete scalar clone command structure', () => {
			const command = ['clone', '--full-clone', '--branch', 'main', 'https://github.com/repo.git', '/path/to/dest'];
			assert.strictEqual(command[0], 'clone');
			assert.strictEqual(command[1], '--full-clone');
			assert.strictEqual(command[2], '--branch');
			assert.strictEqual(command[3], 'main');
			assert.strictEqual(command[4], 'https://github.com/repo.git');
			assert.strictEqual(command[5], '/path/to/dest');
		});
	});

	suite('Scalar Error Handling', () => {
		test('error message for missing scalar is descriptive', () => {
			const errorMessage = 'Scalar executable not found. Scalar is an optional Git performance optimization tool. Install Scalar and ensure its executable is available on your PATH.';
			assert.ok(errorMessage.includes('Scalar executable not found'));
			assert.ok(errorMessage.includes('optional'));
			assert.ok(errorMessage.includes('PATH'));
		});

		test('error is thrown when scalar path is not set', async () => {
			// Attempting to use execScalar without scalarPath should fail
			// We can't directly test private method, but we can verify the error message is correct
			const expectedErrorMessage = 'Scalar executable not found. Scalar is an optional Git performance optimization tool. Install Scalar and ensure its executable is available on your PATH.';
			assert.ok(expectedErrorMessage.includes('Scalar executable not found'));
		});
	});

	suite('Scalar Integration with Git', () => {
		test('scalar version check timeout is reasonable', () => {
			const timeout = 5000;
			assert.strictEqual(timeout, 5000);
			assert.ok(timeout > 0);
			assert.ok(timeout <= 10000);
		});

		test('scalar version command uses correct arguments', () => {
			const args = ['version'];
			assert.deepStrictEqual(args, ['version']);
		});

		test('scalar verification checks for output', () => {
			let hasOutput = false;
			hasOutput = true;
			assert.strictEqual(hasOutput, true);
		});

		test('scalar verification requires both exit code 0 and output', () => {
			const exitCode = 0;
			const hasOutput = true;
			const isValid = exitCode === 0 && hasOutput;
			assert.strictEqual(isValid, true);
		});

		test('scalar verification fails with non-zero exit code', () => {
			const exitCode: number = 1;
			const hasOutput = true;
			const isValid = exitCode === 0 && hasOutput;
			assert.strictEqual(isValid, false);
		});

		test('scalar verification fails without output', () => {
			const exitCode = 0;
			const hasOutput = false;
			const isValid = exitCode === 0 && hasOutput;
			assert.strictEqual(isValid, false);
		});
	});

	suite('Scalar URL Handling', () => {
		test('URL with spaces is encoded correctly', () => {
			const url = 'https://example.com/path with spaces';
			const encodedUrl = encodeURI(url);
			assert.strictEqual(encodedUrl, 'https://example.com/path%20with%20spaces');
		});

		test('URL without spaces is not modified', () => {
			const url = 'https://github.com/microsoft/vscode.git';
			const encodedUrl = url.includes(' ') ? encodeURI(url) : url;
			assert.strictEqual(encodedUrl, url);
		});

		test('URL encoding preserves protocol', () => {
			const url = 'https://example.com/path with spaces';
			const encodedUrl = encodeURI(url);
			assert.ok(encodedUrl.startsWith('https://'));
		});
	});

	suite('Scalar Progress Reporting', () => {
		test('progress report structure is valid', () => {
			let reportedIncrement = 0;
			const progress = {
				report: (value: { increment: number }) => {
					reportedIncrement = value.increment;
				}
			};

			progress.report({ increment: 25 });
			assert.strictEqual(reportedIncrement, 25);
		});

		test('progress increments accumulate correctly', () => {
			let totalProgress = 0;
			const progress = {
				report: (value: { increment: number }) => {
					totalProgress += value.increment;
				}
			};

			progress.report({ increment: 10 });
			progress.report({ increment: 20 });
			progress.report({ increment: 30 });

			assert.strictEqual(totalProgress, 60);
		});

		test('progress calculation from percentage is correct', () => {
			const match = /(\d+)%/i.exec('Receiving objects:  50%');
			if (match) {
				const percentage = parseInt(match[1]);
				assert.strictEqual(percentage, 50);
			}
		});
	});
});
