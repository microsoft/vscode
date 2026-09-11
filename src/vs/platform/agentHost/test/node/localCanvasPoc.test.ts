/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, realpath, rm, symlink } from 'fs/promises';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar } from '../../common/agentHostTelemetry.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { createLocalCanvasPocHostEnvironment, LocalCanvasPoc, LocalCanvasPocRootEnvVar } from '../../node/copilot/localCanvasPoc.js';

suite('Local canvas PoC opt-in', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let root: string;
	let environment: NodeJS.ProcessEnv;

	setup(async () => {
		root = join(process.cwd(), '.build', `canvas-poc-test-${generateUuid()}`);
		for (const path of ['home/.config', 'copilot-home/extensions', 'workspace']) {
			await mkdir(join(root, path), { recursive: true });
		}
		root = await realpath(root);
		environment = { [LocalCanvasPocRootEnvVar]: root, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeMainProcess };
	});

	teardown(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test('requires a non-built desktop launch and a complete absolute fixture root', async () => {
		const supported = LocalCanvasPoc.read(false, environment);
		assert.ok(supported);
		const missing = join(root, 'missing');
		const outcomes = [
			LocalCanvasPoc.read(true, environment),
			LocalCanvasPoc.read(false, {}),
			LocalCanvasPoc.read(false, { ...environment, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeCLI }),
			LocalCanvasPoc.read(false, { ...environment, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.Unknown }),
			LocalCanvasPoc.read(false, { ...environment, [LocalCanvasPocRootEnvVar]: 'relative-root' }),
			LocalCanvasPoc.read(false, { ...environment, [LocalCanvasPocRootEnvVar]: missing }),
		];
		await rm(join(root, 'home', '.config'), { recursive: true });
		outcomes.push(LocalCanvasPoc.read(false, environment));
		assert.deepStrictEqual({ root: supported.root, outcomes }, { root, outcomes: Array(7).fill(undefined) });
	});

	test('only admits the dedicated workspace, not siblings, descendants, remote or multi-root chats', () => {
		const poc = LocalCanvasPoc.read(false, environment);
		assert.ok(poc);
		assert.deepStrictEqual([
			poc.allows(URI.file(join(root, 'workspace'))),
			poc.allows(URI.file(root)),
			poc.allows(URI.file(join(root, 'workspace-other'))),
			poc.allows(URI.file(join(root, 'workspace', 'child'))),
			poc.allows(URI.file(join(root, 'workspace')), [URI.file(join(root, 'other'))]),
			poc.allows(URI.parse('vscode-remote://host/workspace')),
			poc.allows(undefined),
		], [true, false, false, false, false, false, false]);
	});

	test('active dev launches fail closed when their prepared root becomes invalid', async () => {
		const active = { ...environment, VSCODE_DEV: '1' };
		const poc = LocalCanvasPoc.forCurrentHost(active);
		assert.ok(poc);
		poc.assertWorkingDirectories([poc.workspace]);
		assert.throws(() => poc.assertWorkingDirectories([URI.file(root)]), /dedicated workspace/);
		assert.throws(() => poc.assertWorkingDirectories(undefined), /dedicated workspace/);
		await rm(join(root, 'workspace'), { recursive: true });
		assert.throws(() => LocalCanvasPoc.forCurrentHost(active), /root is invalid/);
		assert.throws(() => createLocalCanvasPocHostEnvironment(false, active), /root is invalid/);
		assert.deepStrictEqual([
			LocalCanvasPoc.forCurrentHost({}),
			LocalCanvasPoc.forCurrentHost(environment),
			LocalCanvasPoc.forCurrentHost({ ...active, [AgentHostLaunchKindEnvVar]: AgentHostLaunchKind.VSCodeCLI }),
		], [undefined, undefined, undefined]);
	});

	test('workspace failures name the expected and actual roots, including missing and multiple roots', () => {
		const poc = LocalCanvasPoc.read(false, environment);
		assert.ok(poc);
		const other = URI.file(join(root, 'other'));
		for (const directories of [undefined, [], [other], [poc.workspace, other]]) {
			assert.throws(() => poc.assertWorkingDirectories(directories), {
				message: `The local canvas demo can only materialize or execute sessions in its dedicated workspace.\nExpected workspace: ${poc.workspace.fsPath}\nCurrent workspace: ${directories?.length ? directories.map(directory => directory.fsPath).join(', ') : 'No folder selected'}\nOpen a new session in the demo workspace to continue.`,
			});
		}
	});

	test('does not accept linked fixture homes or a workspace replaced with a symlink', async () => {
		const poc = LocalCanvasPoc.read(false, environment);
		assert.ok(poc);
		await rm(join(root, 'workspace'), { recursive: true });
		await symlink(join(root, 'home'), join(root, 'workspace'), 'junction');
		assert.deepStrictEqual({
			read: LocalCanvasPoc.read(false, environment),
			allows: poc.allows(URI.file(join(root, 'workspace'))),
		}, { read: undefined, allows: false });
	});

	test('isolates child discovery directories and leaves normal child environment unchanged', () => {
		const input = { HOME: '/ambient/home', USERPROFILE: '/ambient/profile', COPILOT_HOME: '/ambient/copilot', XDG_CONFIG_HOME: '/ambient/config', TEST_SENTINEL: 'preserved', [LocalCanvasPocRootEnvVar]: root };
		const normal = createCopilotCliEnvironment(input);
		const isolated = { ...normal };
		const poc = LocalCanvasPoc.read(false, environment);
		assert.ok(poc);
		poc.applyEnvironment(isolated);
		assert.deepStrictEqual({
			clientOptions: poc.clientOptions,
			normal: { home: normal.HOME, profile: normal.USERPROFILE, copilot: normal.COPILOT_HOME, config: normal.XDG_CONFIG_HOME, optInForwarded: normal[LocalCanvasPocRootEnvVar] },
			isolated: { home: isolated.HOME, profile: isolated.USERPROFILE, copilot: isolated.COPILOT_HOME, config: isolated.XDG_CONFIG_HOME, gh: isolated.GH_CONFIG_DIR, sentinel: isolated.TEST_SENTINEL, keychain: isolated.COPILOT_DISABLE_KEYTAR },
		}, {
			clientOptions: { workingDirectory: join(root, 'workspace'), baseDirectory: join(root, 'copilot-home') },
			normal: { home: input.HOME, profile: input.USERPROFILE, copilot: input.COPILOT_HOME, config: input.XDG_CONFIG_HOME, optInForwarded: undefined },
			isolated: { home: join(root, 'home'), profile: join(root, 'home'), copilot: join(root, 'copilot-home'), config: join(root, 'home', '.config'), gh: join(root, 'home', '.config', 'gh'), sentinel: 'preserved', keychain: '1' },
		});
	});

	test('isolates the agent-host fork without modifying UI/main HOME or normal launches', () => {
		const mainEnvironment = { ...environment, HOME: '/ui/home', USERPROFILE: '/ui/profile', XDG_CONFIG_HOME: '/ui/config', COPILOT_HOME: '/ui/copilot', PATH: '/ui/bin' };
		const original = { ...mainEnvironment };
		const fork = createLocalCanvasPocHostEnvironment(false, mainEnvironment);
		const noOptIn = { HOME: '/ui/home', PATH: '/ui/bin' };
		assert.deepStrictEqual({
			mainEnvironment,
			fork: { home: fork.HOME, profile: fork.USERPROFILE, config: fork.XDG_CONFIG_HOME, copilot: fork.COPILOT_HOME, path: fork.PATH },
			built: createLocalCanvasPocHostEnvironment(true, mainEnvironment),
			normal: createLocalCanvasPocHostEnvironment(false, noOptIn),
		}, {
			mainEnvironment: original,
			fork: { home: join(root, 'home'), profile: join(root, 'home'), config: join(root, 'home', '.config'), copilot: join(root, 'copilot-home'), path: '/ui/bin' },
			built: original,
			normal: noOptIn,
		});
	});
});
