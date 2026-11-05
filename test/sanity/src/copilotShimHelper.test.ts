/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import { before, describe, test } from 'mocha';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const helperPath = path.join(repositoryRoot, 'resources/linux/copilot-link.sh');

type Edition = 'code' | 'code-insiders';

/**
 * What an edition's shim reports for `--vscode-shim policy`. `unknown` is an older shim without the command.
 */
type ShimPolicy = 'allowed' | 'disabled' | 'unknown';

type LinkState = Edition | 'foreign-file' | 'foreign-link' | 'none';

interface IScenario {
	readonly action: 'install' | 'remove';
	readonly edition: Edition;
	/** Installed shims and the policy each reports; an absent edition has no shim. */
	readonly shims: Partial<Record<Edition, ShimPolicy>>;
	readonly link?: LinkState;
	/** Simulates debconf: editions listed here answered false to add-copilot-command. Omit for RPM, which has none. */
	readonly declined?: readonly Edition[];
}

interface IOutcome {
	readonly link: LinkState;
	readonly warned: boolean;
}

const shimPolicyExitCodes: Record<ShimPolicy, number> = { allowed: 0, disabled: 10, unknown: 2 };

/**
 * Runs the shipped helper against stub shims and a temporary link path, then reports the resulting link.
 */
function runScenario(shell: string, scenario: IScenario): IOutcome {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-link-'));
	try {
		const targets: Record<Edition, string> = {
			'code': path.join(root, 'code', 'copilot'),
			'code-insiders': path.join(root, 'code-insiders', 'copilot'),
		};
		const linkPath = path.join(root, 'bin', 'copilot');
		fs.mkdirSync(path.dirname(linkPath));
		for (const edition of ['code', 'code-insiders'] as const) {
			const policy = scenario.shims[edition];
			if (policy) {
				fs.mkdirSync(path.dirname(targets[edition]));
				// The stub records any standard input it receives, which must never be the package manager's.
				fs.writeFileSync(targets[edition], `#!/bin/sh\n[ "$1 $2" = "--vscode-shim policy" ] || exit 99\ncat >> "${root}/stdin"\nexit ${shimPolicyExitCodes[policy]}\n`, { mode: 0o755 });
			}
		}

		switch (scenario.link ?? 'none') {
			case 'code':
			case 'code-insiders':
				fs.symlinkSync(targets[scenario.link as Edition], linkPath);
				break;
			case 'foreign-file':
				fs.writeFileSync(linkPath, '#!/bin/sh\n', { mode: 0o755 });
				break;
			case 'foreign-link':
				fs.symlinkSync('/opt/other/copilot', linkPath);
				break;
		}

		const debconf = scenario.declined
			? `db_get() { case " ${scenario.declined.join(' ')} " in *" \${1%%/*} "*) RET=false ;; *) RET=true ;; esac; }\n`
			: '';
		const script = `. "${helperPath}"
vscode_copilot_link_path="${linkPath}"
vscode_copilot_link_code_target="${targets.code}"
vscode_copilot_link_code_insiders_target="${targets['code-insiders']}"
${debconf}vscode_copilot_link ${scenario.action} ${scenario.edition}
`;
		const result = spawnSync(shell, ['-c', script], { input: 'debconf-protocol-reply\n', encoding: 'utf8' });
		assert.strictEqual(result.error, undefined, `${shell} failed to start: ${result.error}`);
		assert.strictEqual(fs.existsSync(path.join(root, 'stdin')) ? fs.readFileSync(path.join(root, 'stdin'), 'utf8') : '', '', 'The shim must not read the maintainer script\'s standard input.');

		let link: LinkState = 'none';
		const stat = fs.lstatSync(linkPath, { throwIfNoEntry: false });
		if (stat?.isSymbolicLink()) {
			const target = fs.readlinkSync(linkPath);
			link = target === targets.code ? 'code' : target === targets['code-insiders'] ? 'code-insiders' : 'foreign-link';
		} else if (stat) {
			link = 'foreign-file';
		}
		return { link, warned: result.stderr.includes('warning: vscode_copilot_link:') };
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function runScenarios(shell: string, scenarios: Record<string, IScenario>): Record<string, IOutcome> {
	return Object.fromEntries(Object.entries(scenarios).map(([name, scenario]) => [name, runScenario(shell, scenario)]));
}

describe('Copilot link helper policy and opt-out', function () {
	const shells = ['sh', 'bash'];

	before(function () {
		if (process.platform !== 'linux') {
			this.skip();
		}
	});

	for (const shell of shells) {
		test(`${shell}: install follows the CopilotCliCommand policy`, () => {
			const both = (policy: ShimPolicy) => ({ 'code': policy, 'code-insiders': policy });
			assert.deepStrictEqual(runScenarios(shell, {
				allowedCreates: { action: 'install', edition: 'code', shims: both('allowed') },
				allowedTakesOver: { action: 'install', edition: 'code', shims: both('allowed'), link: 'code-insiders' },
				disabledCreatesNothing: { action: 'install', edition: 'code', shims: both('disabled') },
				disabledWithdrawsOwnLink: { action: 'install', edition: 'code', shims: both('disabled'), link: 'code' },
				disabledWithdrawsOtherEditionLink: { action: 'install', edition: 'code', shims: both('disabled'), link: 'code-insiders' },
				disabledPreservesForeignFile: { action: 'install', edition: 'code', shims: both('disabled'), link: 'foreign-file' },
				disabledPreservesForeignLink: { action: 'install', edition: 'code', shims: both('disabled'), link: 'foreign-link' },
				unknownCreatesNothing: { action: 'install', edition: 'code', shims: both('unknown') },
				unknownPreservesExistingLink: { action: 'install', edition: 'code', shims: both('unknown'), link: 'code-insiders' },
			}), {
				allowedCreates: { link: 'code', warned: false },
				allowedTakesOver: { link: 'code', warned: false },
				disabledCreatesNothing: { link: 'none', warned: false },
				disabledWithdrawsOwnLink: { link: 'none', warned: false },
				disabledWithdrawsOtherEditionLink: { link: 'none', warned: false },
				disabledPreservesForeignFile: { link: 'foreign-file', warned: false },
				disabledPreservesForeignLink: { link: 'foreign-link', warned: false },
				unknownCreatesNothing: { link: 'none', warned: true },
				unknownPreservesExistingLink: { link: 'code-insiders', warned: true },
			});
		});

		test(`${shell}: install respects the debconf add-copilot-command answer`, () => {
			const allowed = { 'code': 'allowed', 'code-insiders': 'allowed' } as const;
			assert.deepStrictEqual(runScenarios(shell, {
				acceptedCreates: { action: 'install', edition: 'code', shims: allowed, declined: [] },
				declinedCreatesNothing: { action: 'install', edition: 'code', shims: allowed, declined: ['code'] },
				declinedHandsOwnLinkToOtherEdition: { action: 'install', edition: 'code', shims: allowed, link: 'code', declined: ['code'] },
				declinedRemovesOwnLinkWhenOtherDeclined: { action: 'install', edition: 'code', shims: allowed, link: 'code', declined: ['code', 'code-insiders'] },
				declinedKeepsOtherEditionLink: { action: 'install', edition: 'code', shims: allowed, link: 'code-insiders', declined: ['code'] },
				declinedRemovesOwnLinkWhenPolicyUnknown: { action: 'install', edition: 'code', shims: { 'code': 'unknown', 'code-insiders': 'unknown' }, link: 'code', declined: ['code'] },
				disabledPolicyWinsOverAcceptedAnswer: { action: 'install', edition: 'code', shims: { 'code': 'disabled', 'code-insiders': 'disabled' }, link: 'code-insiders', declined: [] },
			}), {
				acceptedCreates: { link: 'code', warned: false },
				declinedCreatesNothing: { link: 'none', warned: false },
				declinedHandsOwnLinkToOtherEdition: { link: 'code-insiders', warned: false },
				declinedRemovesOwnLinkWhenOtherDeclined: { link: 'none', warned: false },
				declinedKeepsOtherEditionLink: { link: 'code-insiders', warned: false },
				declinedRemovesOwnLinkWhenPolicyUnknown: { link: 'none', warned: false },
				disabledPolicyWinsOverAcceptedAnswer: { link: 'none', warned: false },
			});
		});

		test(`${shell}: remove hands the link over only when the remaining edition may provide it`, () => {
			assert.deepStrictEqual(runScenarios(shell, {
				handsOverWhenAllowed: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'allowed' }, link: 'code' },
				removesWhenNoOtherEdition: { action: 'remove', edition: 'code', shims: {}, link: 'code' },
				removesWhenPolicyDisabled: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'disabled' }, link: 'code' },
				removesWhenPolicyUnknown: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'unknown' }, link: 'code' },
				removesWhenOtherDeclined: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'allowed' }, link: 'code', declined: ['code-insiders'] },
				keepsOtherEditionLinkWhenAllowed: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'allowed' }, link: 'code-insiders' },
				withdrawsOtherEditionLinkWhenDisabled: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'disabled' }, link: 'code-insiders' },
				preservesForeignLinkWhenDisabled: { action: 'remove', edition: 'code', shims: { 'code-insiders': 'disabled' }, link: 'foreign-link' },
			}), {
				handsOverWhenAllowed: { link: 'code-insiders', warned: false },
				removesWhenNoOtherEdition: { link: 'none', warned: false },
				removesWhenPolicyDisabled: { link: 'none', warned: false },
				removesWhenPolicyUnknown: { link: 'none', warned: false },
				removesWhenOtherDeclined: { link: 'none', warned: false },
				keepsOtherEditionLinkWhenAllowed: { link: 'code-insiders', warned: false },
				withdrawsOtherEditionLinkWhenDisabled: { link: 'none', warned: false },
				preservesForeignLinkWhenDisabled: { link: 'foreign-link', warned: false },
			});
		});
	}
});
