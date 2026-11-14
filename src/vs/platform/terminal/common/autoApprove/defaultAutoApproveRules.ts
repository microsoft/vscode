/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gitAutoApproveRules } from './gitAutoApproveRules.js';
import { powershellAutoApproveRules } from './powershellAutoApproveRules.js';
import { sortAutoApproveRules } from './sortAutoApproveRules.js';

/** Shared implicit terminal auto-approval defaults for the workbench and agent host. */
export const defaultTerminalAutoApproveRules: Readonly<Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>> = {
	// This is the default set of terminal auto approve commands. Note that these are best
	// effort and do not aim to provide exhaustive coverage to prevent dangerous commands
	// from executing as that is simply not feasible. Workspace trust and warnings of
	// possible prompt injection are _the_ thing protecting the user in agent mode, once
	// that trust boundary has been breached all bets are off as trusting a workspace that
	// contains anything malicious has already compromised the machine.
	//
	// Instead, the focus here is to unblock the user from approving clearly safe commands
	// frequently and cover common edge cases that could arise from the user auto-approving
	// commands.
	//
	// Take for example `find` which looks innocuous and most users are likely to auto
	// approve future calls when offered. However, the `-exec` argument can run anything. So
	// instead of leaving this decision up to the user we provide relatively safe defaults
	// and block common edge cases. So offering these default rules, despite their flaws, is
	// likely to protect the user more in general than leaving everything up to them (plus
	// make agent mode more convenient).

	// #region Safe commands
	//
	// Generally safe and common readonly commands

	cd: true,
	echo: true,
	ls: true,
	dir: true,
	pwd: true,
	cat: true,
	head: true,
	tail: true,
	findstr: true,
	wc: true,
	tr: true,
	cut: true,
	cmp: true,
	which: true,
	basename: true,
	dirname: true,
	realpath: true,
	readlink: true,
	stat: true,
	file: true,
	od: true,
	du: true,
	df: true,
	sleep: true,
	nl: true,

	// grep
	// - Variable
	// - `-f`: Read patterns from file, this is an acceptable risk since you can do similar
	//   with cat
	// - `-P`: PCRE risks include denial of service (memory exhaustion, catastrophic
	//   backtracking) which could lock up the terminal. Older PCRE versions allow code
	//   execution via this flag but this has been patched with CVEs.
	// - Variable injection is possible, but requires setting a variable which would need
	//   manual approval.
	grep: true,

	// #endregion

	// #region Safe sub-commands
	//
	// Safe and common sub-commands

	...gitAutoApproveRules,

	// docker - readonly sub-commands
	'/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/': true,
	'/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/': true,
	'/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/': true,

	// #endregion

	// #region PowerShell

	...powershellAutoApproveRules,

	// #endregion

	// #region Package managers (npm, yarn, pnpm)
	//
	// Read-only commands that don't modify files or execute arbitrary code.

	// npm read-only commands
	'/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/': true,
	'/^npm\\s+config\\s+(list|get)\\b/': true,
	'/^npm\\s+pkg\\s+get\\b/': true,
	'/^npm\\s+audit$/': true,
	'/^npm\\s+cache\\s+verify\\b/': true,

	// yarn read-only commands
	'/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/': true,
	'/^yarn\\s+licenses\\b/': true,
	'/^yarn\\s+audit\\b(?!.*\\bfix\\b)/': true,
	'/^yarn\\s+config\\s+(list|get)\\b/': true,
	'/^yarn\\s+cache\\s+dir\\b/': true,

	// pnpm read-only commands
	'/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/': true,
	'/^pnpm\\s+licenses\\b/': true,
	'/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/': true,
	'/^pnpm\\s+config\\s+(list|get)\\b/': true,

	// Safe lockfile-only installs since we trust the workspace and lock file is trusted.
	'npm ci': true,
	'/^npm\\s+ci\\s+\\S/': false,
	'/^yarn\\s+install\\s+--frozen-lockfile\\b/': true,
	'/^yarn\\s+install\\s+--frozen-lockfile\\s+\\S/': false,
	'/^pnpm\\s+install\\s+--frozen-lockfile\\b/': true,
	'/^pnpm\\s+install\\s+--frozen-lockfile\\s+\\S/': false,

	// #endregion

	// #region Safe + disabled args
	//
	// Commands that are generally allowed with special cases we block. Note that shell
	// expansion is handled by the inline command detection when parsing sub-commands.

	// column
	// - `-c`: We block excessive columns that could lead to memory exhaustion.
	column: true,
	'/^column\\b.*\\s-c\\s+[0-9]{4,}/': false,

	// date
	// -s|--set: Sets the system clock
	date: true,
	'/^date\\b.*\\s(-s|--set)\\b/': false,

	// find
	// - `-delete`: Deletes files or directories.
	// - `-exec`/`-execdir`: Execute on results.
	// - `-fprint`/`fprintf`/`fls`: Writes files.
	// - `-ok`/`-okdir`: Like exec but with a confirmation.
	find: true,
	'/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/': false,

	// rg (ripgrep)
	// - `--pre`: Executes arbitrary command as preprocessor for every file searched.
	// - `--hostname-bin`: Executes arbitrary command to get hostname.
	rg: true,
	'/^rg\\b.*\\s(--pre|--hostname-bin)\\b/': false,

	// sed
	// - `-e`/`--expression`: Add the commands in script to the set of commands to be run
	//   while processing the input.
	// - `-f`/`--file`: Add the commands contained in the file script-file to the set of
	//   commands to be run while processing the input.
	// - standalone `e`: Execute a shell command from the sed script
	// - standalone `r`/`R`: Read arbitrary files into the stream
	// - standalone `w`/`W`: Write pattern space to arbitrary files
	// - `s///e` flag: Executes substitution result as shell command
	// - `s///w` flag: Write substitution result to file
	// - Note that `--sandbox` exists which blocks unsafe commands that could potentially be
	//   leveraged to auto approve
	// - In-place editing (`-i`, `-I`, `--in-place`) is detected and blocked via file write
	//   detection if necessary
	// - These patterns are conservative: a literal `;e ` or `{e ` inside a replacement
	//   string also matches, which asks for confirmation rather than auto-approving.
	// TODO: replace sed deny regexes with a shared script analyzer — https://github.com/microsoft/vscode/issues/329218
	sed: true,
	'/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/': false,
	'/^sed\\b.*s\\/.*\\/.*\\/[ew]/': false,
	// Quoted positional script whose first command is e/r/R/w/W. The opening quote is
	// captured so the closing quote must match it, and whitespace and `!` are allowed
	// around the optional address since sed ignores them. The option prefix also skips
	// the separate operand consumed by -l/--line-length.
	'/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+([\'"])\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1)/': false,
	// Same dangerous commands after a `;` or `{` separator inside a quoted script.
	// Escaped characters are consumed before testing for the matching closing quote.
	'/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+([\'"])(?:\\\\.|(?!\\1).)*[;{]\\s*(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|\\1|[;}])/': false,
	// Unquoted positional script form (e.g. `sed 1e id`, `sed w file`, `sed /pat/e file`)
	'/^sed\\b(?:\\s+(?:(?:-l|--line-length)\\s+\\S+|--line-length=\\S+|-\\S+))*\\s+(?:(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/)(?:\\s*,\\s*(?:\\d+|\\$|\\/(?:\\\\.|[^\\/])*\\/))?)?\\s*!?\\s*[erRwW](?:\\s|$)/': false,

	...sortAutoApproveRules,

	// tree
	// - `-o`: Output redirection can write files (`tree -o /etc/something file`) which are
	//   blocked currently
	tree: true,
	'/^tree\\b.*\\s-o\\b/': false,

	// xxd
	// - Only allow flags and a single input file as it's difficult to parse the outfile
	//   positional argument safely.
	'/^xxd$/': true,
	'/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/': true,

	// #endregion

	// #region Dangerous commands
	//
	// There are countless dangerous commands available on the command line, the defaults
	// here include common ones that the user is likely to want to explicitly approve first.
	// This is not intended to be a catch all as the user needs to opt-in to auto-approve
	// commands, it provides some additional safety when the commands get approved by overly
	// broad user/workspace rules.

	// Deleting files
	rm: false,
	rmdir: false,
	del: false,
	'Remove-Item': false,
	ri: false,
	rd: false,
	erase: false,
	dd: false,

	// Managing/killing processes, dangerous thing to do generally
	kill: false,
	ps: false,
	top: false,
	'Stop-Process': false,
	spps: false,
	taskkill: false,
	'taskkill.exe': false,

	// Web requests, prompt injection concerns
	curl: false,
	wget: false,
	'Invoke-RestMethod': false,
	'Invoke-WebRequest': false,
	'irm': false,
	'iwr': false,

	// File permissions and ownership, messing with these can cause hard to diagnose issues
	chmod: false,
	chown: false,
	'Set-ItemProperty': false,
	'sp': false,
	'Set-Acl': false,

	// General eval/command execution, can lead to anything else running
	jq: false,
	xargs: false,
	eval: false,
	'Invoke-Expression': false,
	iex: false,

	// #endregion
};
