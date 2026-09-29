/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test, type TestContext } from 'node:test';
import { create } from 'tar';
import { ensureNpmPackage, materializeNpmPackageVersion, type EnsureNpmPackageOptions } from '../npmPackage.ts';

const packageName = '@github/copilot-darwin-arm64';
const version = '1.0.73';

function createFixture(t: TestContext, fromLockfile: boolean) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-npm-package-test-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const packageRoot = path.join(root, 'package');
	fs.mkdirSync(packageRoot);
	fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version }));
	const tarball = path.join(root, 'package.tgz');
	create({ file: tarball, cwd: root, gzip: true, sync: true }, ['package']);
	const integrity = 'sha512-' + createHash('sha512').update(fs.readFileSync(tarball)).digest('base64');
	const nodeModulesRoot = path.join(root, 'node_modules');
	const targetDir = path.join(nodeModulesRoot, ...packageName.split('/'));

	return {
		tarball,
		targetDir,
		materialize: (options: EnsureNpmPackageOptions, expectedIntegrity = integrity) => {
			if (fromLockfile) {
				fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
					packages: { [`node_modules/${packageName}`]: { version, integrity: expectedIntegrity } }
				}));
				ensureNpmPackage(packageName, nodeModulesRoot, options);
			} else {
				materializeNpmPackageVersion(packageName, version, targetDir, expectedIntegrity, options);
			}
		}
	};
}

suite('npmPackage', () => {
	for (const fromLockfile of [true, false]) {
		suite(fromLockfile ? 'ensureNpmPackage' : 'materializeNpmPackageVersion', () => {
			test('retries transient pack failures and verifies the recovered tarball', t => {
				const fixture = createFixture(t, fromLockfile);
				const calls: { packageName: string; version: string; stagedFiles: string[] }[] = [];
				let stagingDir = '';

				fixture.materialize({
					retryDelay: 0,
					packPackage: (name, requestedVersion, tempDir) => {
						stagingDir = tempDir;
						calls.push({ packageName: name, version: requestedVersion, stagedFiles: fs.readdirSync(tempDir) });
						if (calls.length < 3) {
							fs.writeFileSync(path.join(tempDir, 'partial.tgz'), 'incomplete');
							fs.mkdirSync(path.join(tempDir, 'partial'));
							fs.writeFileSync(path.join(tempDir, 'partial', 'package.json'), 'incomplete');
							throw Object.assign(new Error('npm pack failed'), { status: 1, stderr: Buffer.from('npm error code ECONNRESET') });
						}
						return fixture.tarball;
					}
				});

				assert.deepStrictEqual({
					calls,
					packageJson: JSON.parse(fs.readFileSync(path.join(fixture.targetDir, 'package.json'), 'utf8')),
					stagingExists: fs.existsSync(stagingDir),
				}, {
					calls: Array.from({ length: 3 }, () => ({ packageName, version, stagedFiles: [] })),
					packageJson: { version },
					stagingExists: false,
				});
			});

			test('preserves private staging permissions when retrying', { skip: process.platform === 'win32' }, t => {
				const fixture = createFixture(t, fromLockfile);
				const permissions: number[] = [];

				fixture.materialize({
					retryDelay: 0,
					packPackage: (_name, _version, tempDir) => {
						permissions.push(fs.statSync(tempDir).mode & 0o777);
						if (permissions.length === 1) {
							throw Object.assign(new Error('npm pack failed'), { code: 'ECONNRESET' });
						}
						return fixture.tarball;
					}
				});

				assert.deepStrictEqual(permissions, [0o700, 0o700]);
			});

			for (const { code, npmLogPrefix } of [
				{ code: 'EAI_AGAIN', npmLogPrefix: 'npm error' },
				{ code: 'ETIMEDOUT', npmLogPrefix: 'npm ERR!' },
				{ code: 'E408', npmLogPrefix: 'npm error' },
				{ code: 'E429', npmLogPrefix: 'npm error' },
				{ code: 'E503', npmLogPrefix: 'npm \u001b[31merror\u001b[39m' },
			]) {
				test(`bounds retries for ${code} and preserves the final npm failure`, t => {
					const fixture = createFixture(t, fromLockfile);
					let attempts = 0;
					let stagingDir = '';
					let packError: Error | undefined;

					assert.throws(() => fixture.materialize({
						retryDelay: 0,
						packPackage: (_name, _version, tempDir) => {
							stagingDir = tempDir;
							packError = Object.assign(new Error(`pack failure ${++attempts}`), {
								status: 17,
								stdout: Buffer.from('npm output'),
								stderr: Buffer.from(`${npmLogPrefix} code ${code}\nrequest failed`),
							});
							throw packError;
						}
					}), (error: Error) => {
						const helper = fromLockfile ? 'ensureNpmPackage' : 'materializeNpmPackageVersion';
						const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
						assert.deepStrictEqual({
							message: error.message,
							cause: error.cause instanceof Error ? error.cause.cause : undefined,
						}, {
							message: `[${helper}] Failed to materialize ${packageName}@${version}: ${npm} pack ${packageName}@${version} --pack-destination ${stagingDir} --loglevel=error failed (attempt 3/3):\npack failure 3\nexit status: 17\nstdout:\nnpm output\nstderr:\n${npmLogPrefix} code ${code}\nrequest failed`,
							cause: packError,
						});
						return true;
					});

					assert.deepStrictEqual({
						attempts,
						stagingExists: fs.existsSync(stagingDir),
						targetExists: fs.existsSync(fixture.targetDir),
					}, { attempts: 3, stagingExists: false, targetExists: false });
				});
			}

			for (const code of ['E401', 'E403', 'E404', 'ETARGET', 'EINTEGRITY', 'EACCES', 'ENOENT', 'ENOTFOUND']) {
				test(`does not retry ${code}`, t => {
					const fixture = createFixture(t, fromLockfile);
					let attempts = 0;
					const packError = Object.assign(new Error('npm pack failed in /tmp/E503'), {
						status: 1,
						stdout: Buffer.from('ECONNRESET'),
						stderr: `npm error code ${code}`,
					});

					assert.throws(() => fixture.materialize({
						retryDelay: 0,
						packPackage: () => {
							attempts++;
							throw packError;
						}
					}), (error: Error) => {
						assert.match(error.message, /failed \(attempt 1\/3\)/);
						assert.ok(error.message.includes(packError.stderr));
						assert.strictEqual(error.cause instanceof Error ? error.cause.cause : undefined, packError);
						return true;
					});
					assert.strictEqual(attempts, 1);
				});
			}

			test('does not infer retryability from command arguments or stdout', t => {
				const fixture = createFixture(t, fromLockfile);
				let attempts = 0;

				assert.throws(() => fixture.materialize({
					retryDelay: 0,
					packPackage: () => {
						attempts++;
						throw Object.assign(new Error('Command failed: npm pack econnreset@1.0.0'), {
							status: 1,
							stdout: Buffer.from('ETIMEDOUT'),
						});
					}
				}), /failed \(attempt 1\/3\)/);
				assert.strictEqual(attempts, 1);
			});

			test('does not retry a permanent process error despite transient npm output', t => {
				const fixture = createFixture(t, fromLockfile);
				let attempts = 0;

				assert.throws(() => fixture.materialize({
					retryDelay: 0,
					packPackage: () => {
						attempts++;
						throw Object.assign(new Error('npm output exceeded maxBuffer'), {
							code: 'ENOBUFS',
							stderr: Buffer.from('npm error code ECONNRESET'),
						});
					}
				}), /failed \(attempt 1\/3\)/);
				assert.strictEqual(attempts, 1);
			});

			test('preserves a terminating signal without retrying', t => {
				const fixture = createFixture(t, fromLockfile);
				let attempts = 0;

				assert.throws(() => fixture.materialize({
					retryDelay: 0,
					packPackage: () => {
						attempts++;
						throw Object.assign(new Error('npm pack terminated'), {
							status: null,
							signal: 'SIGTERM',
							stderr: Buffer.from('npm error code ECONNRESET'),
						});
					}
				}), /signal: SIGTERM/);
				assert.strictEqual(attempts, 1);
			});

			test('preserves errors without child process metadata', t => {
				const fixture = createFixture(t, fromLockfile);
				let attempts = 0;

				assert.throws(() => fixture.materialize({
					retryDelay: 0,
					packPackage: () => {
						attempts++;
						throw new Error('pack failed without child process metadata');
					}
				}), /failed \(attempt 1\/3\):\npack failed without child process metadata/);
				assert.strictEqual(attempts, 1);
			});

			test('does not retry an integrity failure after a recovered pack', t => {
				const fixture = createFixture(t, fromLockfile);
				let attempts = 0;
				let stagingDir = '';

				assert.throws(() => fixture.materialize({
					retryDelay: 0,
					packPackage: (_name, _version, tempDir) => {
						stagingDir = tempDir;
						if (++attempts === 1) {
							throw Object.assign(new Error('npm pack failed'), { code: 'ECONNRESET' });
						}
						return fixture.tarball;
					}
				}, 'sha512-invalid'), /integrity mismatch/);

				assert.deepStrictEqual({
					attempts,
					stagingExists: fs.existsSync(stagingDir),
					targetExists: fs.existsSync(fixture.targetDir),
				}, { attempts: 2, stagingExists: false, targetExists: false });
			});

			test('does not retry extraction failures and cleans up the target', t => {
				const fixture = createFixture(t, fromLockfile);
				const contents = Buffer.from('not a tarball');
				fs.writeFileSync(fixture.tarball, contents);
				const integrity = 'sha512-' + createHash('sha512').update(contents).digest('base64');
				let attempts = 0;
				let stagingDir = '';

				assert.throws(() => fixture.materialize({
					retryDelay: 0,
					packPackage: (_name, _version, tempDir) => {
						attempts++;
						stagingDir = tempDir;
						return fixture.tarball;
					}
				}, integrity), /Unrecognized archive format/);

				assert.deepStrictEqual({
					attempts,
					stagingExists: fs.existsSync(stagingDir),
					targetExists: fs.existsSync(fixture.targetDir),
				}, { attempts: 1, stagingExists: false, targetExists: false });
			});
		});
	}
});
