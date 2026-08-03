/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Guards recorded fixtures against POSIX-only shell commands.
 *
 * A capture is otherwise platform-neutral: it records what the *model* said,
 * and the agent host executes that live on whatever platform the test runs on.
 * The one thing that does not travel is a command string the model chose — if
 * it happens to pick `wc -l` or `printf`, that choice is frozen into the fixture
 * and the test can never replay on Windows.
 *
 * Nobody selects those strings deliberately. They are whatever the model
 * produced from a prompt that described the goal instead of specifying the
 * command, which makes this exactly the kind of regression that reappears the
 * next time somebody re-records. Checking at the moment the fixture is written
 * puts the failure on the author's own machine, while they still have the
 * context to fix it, instead of on a CI leg they may not run.
 *
 * Deliberately a blocklist of constructs known not to replay reliably in the
 * suite's Windows shells rather than an allowlist of portable ones: the goal is
 * to catch the commands models actually reach for, without failing a recording
 * for an unfamiliar-but-fine command.
 */

/** A shell command found in a recorded fixture, with where it came from. */
export interface IRecordedCommand {
	readonly command: string;
	readonly toolName: string;
}

export interface IPosixCommandFinding {
	readonly command: string;
	readonly toolName: string;
	readonly reason: string;
}

interface IPosixPattern {
	readonly pattern: RegExp;
	readonly reason: string;
}

/**
 * `pwd` is deliberately absent: PowerShell defines it as an alias for
 * `Get-Location`, and the host-managed terminal uses PowerShell on Windows. The
 * lint target is fixture portability across the suite's effective Windows
 * shells, not `cmd` syntax specifically.
 *
 * Each pattern is anchored to a command position — the start of the string, or
 * after a `|`, `&&`, `||` or `;` — so that an argument or file name that merely
 * contains the word does not trip it (`node -e "readdirSync('.')"` must not
 * match `rm`).
 */
const COMMAND_POSITION = String.raw`(?:^|[|;]|&&|\|\|)\s*`;

const POSIX_PATTERNS: readonly IPosixPattern[] = [
	{
		pattern: new RegExp(`${COMMAND_POSITION}(?:ls|cat|rm|mv|cp|touch|wc|head|tail|grep|sed|awk|find|xxd|printf|chmod|chown|du|df|which|basename|dirname|mkdir|rmdir|ln|tee|sort|uniq|cut|tr|test|\\[|export|unset|source|\\.)\\b`),
		reason: 'uses a POSIX coreutil or shell builtin that is not portable to Windows shells',
	},
	{
		pattern: /(?:^|\s)2>(?:&1|\s*\/dev\/null)/,
		reason: 'redirects stderr using POSIX syntax',
	},
	{
		pattern: /\/dev\/(?:null|stdin|stdout|stderr)\b/,
		reason: 'references a POSIX device path',
	},
	{
		pattern: /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/,
		reason: 'expands a variable using POSIX syntax',
	},
	{
		pattern: /(?:^|\s)~\//,
		reason: 'uses POSIX home-directory expansion',
	},
];

/**
 * Placeholders the recorder substitutes into captured paths. They look like
 * POSIX variable expansions but are rewritten before replay, so they must not
 * be reported.
 */
const RECORDER_PLACEHOLDER_RE = /\$\{(?:workdir|homedir|workspace|temp|user|timestamp|shell|read_shell|write_shell|stop_shell|list_shell|shell_shutdown)\}/g;

/** Reports every POSIX-only construct found in the given commands. */
export function findPosixOnlyCommands(commands: readonly IRecordedCommand[]): IPosixCommandFinding[] {
	const findings: IPosixCommandFinding[] = [];
	for (const { command, toolName } of commands) {
		const scrubbed = command.replace(RECORDER_PLACEHOLDER_RE, 'PLACEHOLDER');
		for (const { pattern, reason } of POSIX_PATTERNS) {
			if (pattern.test(scrubbed)) {
				findings.push({ command, toolName, reason });
				break;
			}
		}
	}
	return findings;
}

/** Formats findings as the error a recording fails with. */
export function formatPosixCommandError(fixturePath: string, findings: readonly IPosixCommandFinding[]): string {
	const lines = findings.map(finding => `  - \`${finding.command}\` (${finding.toolName}): ${finding.reason}`);
	return [
		`[capi-replay] recorded ${findings.length === 1 ? 'a shell command that is' : 'shell commands that are'} POSIX-only, so this capture cannot replay on Windows:`,
		...lines,
		'',
		`Fixture: ${fixturePath}`,
		'',
		'The model chose this command; the prompt did not. Fix the prompt, not the capture:',
		'  - If a file tool can do the job, steer the agent to it ("Use your file tools; do not run a shell command.").',
		'  - If no file tool exists (rename, delete, mkdir, listing), pin the command:',
		'    "Run exactly this shell command, with no modifications: `node -e \\"...\\"`".',
		'',
		'If the scenario genuinely cannot be portable, scope the test to a platform',
		'explicitly at its call site and say why, then set `allowPosixCommands` on the',
		'capiReplay options so this check does not fire.',
	].join('\n');
}
