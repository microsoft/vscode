/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getTerminalSandboxRuntimeConfigurationForCommands } from '../../common/terminalSandboxRuntimeConfigurationPerOperation.js';
import { ITerminalSandboxCommand } from '../../common/terminalSandboxService.js';

const GNUPG_GRANT = {
	network: { allowAllUnixSockets: true },
	filesystem: {
		allowRead: ['~/.gnupg'],
		allowWrite: ['~/.gnupg'],
	},
};

function git(args: readonly string[], environmentAssignments: readonly string[] = []): ITerminalSandboxCommand {
	return { keyword: 'git', args, environmentAssignments };
}

function grantFor(command: ITerminalSandboxCommand): Record<string, unknown> {
	return getTerminalSandboxRuntimeConfigurationForCommands(OperatingSystem.Linux, [command]);
}

function hasGnuPGGrant(command: ITerminalSandboxCommand): boolean {
	const config = grantFor(command);
	const network = config.network as { allowAllUnixSockets?: boolean } | undefined;
	return network?.allowAllUnixSockets === true;
}

suite('TerminalSandboxRuntimeConfigurationPerOperation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('the GnuPG grant is kept for ordinary Git work', () => {

		// The grant exists so signing can reach gpg-agent and the keyring. These
		// are the forms that need it, and they must not be caught by the guard.
		const kept: readonly (readonly string[])[] = [
			['commit', '-S', '-m', 'test'],
			['commit', '--gpg-sign', '-m', 'test'],
			['tag', '-s', 'v1.0.0', '-m', 'release'],
			['rebase', 'main'],
			['merge', '--no-ff', 'topic'],
			['cherry-pick', '-x', 'abc123'],
			['revert', 'abc123'],
			['push'],
			['status'],
			['log', '--oneline'],
			['-C', 'repo', 'commit', '-S', '-m', 'test'],
			['--git-dir', '.git', 'status'],
			['-c', 'user.name=Someone', 'commit', '-S', '-m', 'test'],
			['-c', 'user.email=someone@example.com', '-c', 'commit.gpgsign=true', 'commit'],
			['-c', 'user.signingkey=ABC', 'tag', '-s', 'v1'],
			['-c', 'USER.NAME=Someone', 'commit'],
			['-c', 'safe.directory=/repo', 'status'],
		];

		for (const args of kept) {
			test(`git ${args.join(' ')}`, () => {
				deepStrictEqual(grantFor(git(args)), GNUPG_GRANT);
			});
		}

		test('an unrelated environment prefix does not disturb it', () => {
			deepStrictEqual(grantFor(git(['status'], ['HOME=/tmp'])), GNUPG_GRANT);
			deepStrictEqual(grantFor(git(['commit', '-S'], ['GIT_TERMINAL_PROMPT=0'])), GNUPG_GRANT);
		});

		test('a subcommand argument that happens to name a guarded subcommand is still ordinary work', () => {
			// `submodule` here is the commit message, not the subcommand.
			deepStrictEqual(grantFor(git(['commit', '-S', '-m', 'submodule'])), GNUPG_GRANT);
			deepStrictEqual(grantFor(git(['commit', '-S', '-m', 'bisect'])), GNUPG_GRANT);
			deepStrictEqual(grantFor(git(['checkout', 'filter-branch'])), GNUPG_GRANT);
		});
	});

	suite('the GnuPG grant is refused when Git can be made to run a supplied program', () => {

		// Every entry reaches an arbitrary child process, which would inherit the
		// keyring and the Unix socket grant applied to the sandboxed process tree.
		const refused: readonly (readonly string[])[] = [
			// An alias value beginning with `!` is a shell command.
			['-c', 'alias.audit=!cat ~/.gnupg/private-keys-v1.d/*', 'audit'],
			['-c', 'alias.audit=!id', 'audit'],
			['--config-env=alias.audit=EVIL', 'audit'],
			// Config keys that name a program directly.
			['-c', 'core.pager=id', 'log'],
			['-c', 'core.editor=id', 'commit'],
			['-c', 'sequence.editor=id', 'rebase', '-i', 'main'],
			['-c', 'core.hooksPath=/tmp/hooks', 'commit'],
			['-c', 'credential.helper=!id', 'push'],
			['-c', 'core.sshCommand=id', 'fetch'],
			['-c', 'diff.external=id', 'diff'],
			['-c', 'gpg.program=id', 'commit', '-S'],
			['-c', 'filter.x.clean=id', 'add', '.'],
			['-c', 'uploadpack.packObjectsHook=id', 'fetch'],
			// Case must not be a way past the key check.
			['-c', 'ALIAS.audit=!id', 'audit'],
			['-c', 'Core.Pager=id', 'log'],
			// Options that hand Git a program.
			['rebase', '--exec', 'id', 'main'],
			['rebase', '--exec=id', 'main'],
			['fetch', '--upload-pack', 'id'],
			['push', '--receive-pack=id'],
			// Subcommands whose purpose is to run what the caller supplies.
			['bisect', 'run', 'id'],
			['submodule', 'foreach', 'id'],
			['filter-branch', '--tree-filter', 'id'],
			['-C', 'repo', 'submodule', 'foreach', 'id'],
			// A `-c` with no value at all is not something to reason about.
			['-c'],
		];

		for (const args of refused) {
			test(`git ${args.join(' ')}`, () => {
				deepStrictEqual(grantFor(git(args)), {}, `git ${args.join(' ')} should not receive the GnuPG grant`);
			});
		}

		test('environment assignments that redirect what Git runs', () => {
			const redirecting = [
				['GIT_CONFIG_COUNT=1'],
				['GIT_CONFIG_KEY_0=alias.audit'],
				['GIT_CONFIG_VALUE_0=!id'],
				['GIT_CONFIG_GLOBAL=/tmp/evil'],
				['GIT_CONFIG_SYSTEM=/tmp/evil'],
				['GIT_DIR=/tmp/evil/.git'],
				['GIT_SSH_COMMAND=id'],
				['GIT_EDITOR=id'],
				['GIT_SEQUENCE_EDITOR=id'],
				['GIT_PAGER=id'],
				['GIT_ASKPASS=id'],
				['GIT_EXTERNAL_DIFF=id'],
				['EDITOR=id'],
				['PAGER=id'],
				['PATH=/tmp/evil'],
				['LD_PRELOAD=/tmp/evil.so'],
				['DYLD_INSERT_LIBRARIES=/tmp/evil.dylib'],
				// Lower case, as a shell would still export it upper case.
				['git_config_count=1'],
			];
			for (const environmentAssignments of redirecting) {
				strictEqual(
					hasGnuPGGrant(git(['commit', '-S'], environmentAssignments)),
					false,
					`${environmentAssignments.join(' ')} git commit -S should not receive the GnuPG grant`
				);
			}
		});

		test('a guarded command in a chain refuses the grant for the whole invocation', () => {
			const config = getTerminalSandboxRuntimeConfigurationForCommands(OperatingSystem.Linux, [
				git(['commit', '-S', '-m', 'test']),
				git(['-c', 'alias.audit=!id', 'audit']),
			]);

			// The grant is applied to the sandboxed process tree, so it is enough for
			// one command in the chain to be able to spawn an arbitrary child.
			ok(!('network' in config), 'a chain containing a guarded Git command should not receive the grant');
		});
	});

	suite('unchanged behaviour', () => {

		test('Windows still gets no GnuPG runtime values', () => {
			deepStrictEqual(
				getTerminalSandboxRuntimeConfigurationForCommands(OperatingSystem.Windows, [git(['commit', '-S'])]),
				{}
			);
		});

		test('a Docker command in the chain still suppresses the grant', () => {
			const config = getTerminalSandboxRuntimeConfigurationForCommands(OperatingSystem.Linux, [
				git(['commit', '-S']),
				{ keyword: 'docker', args: ['ps'] },
			]);

			ok(!('network' in config), 'Docker in the chain should suppress the Unix socket grant');
		});

		test('the Node runtime values are unaffected', () => {
			deepStrictEqual(
				getTerminalSandboxRuntimeConfigurationForCommands(OperatingSystem.Linux, [{ keyword: 'npm', args: ['install'] }]),
				{ filesystem: { allowWrite: ['~/.volta/'] } }
			);
		});
	});
});
