/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Default auto-approval rules for safe Git subcommands.
 *
 * These patterns support `-C <path>` and `--no-pager` immediately after `git`.
 */
export const gitAutoApproveRules: Readonly<Record<string, boolean>> = {
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/': false,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b.*\\s--output(=|\\s|$)/': false,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/': true,

	// git grep
	// - `--open-files-in-pager`: This is the configured pager, so no risk of code execution
	// - See notes on `grep` in the terminal auto-approval configuration.
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/': true,

	// git branch
	// - `-d`, `-D`, `--delete`: Prevent branch deletion
	// - `-m`, `-M`: Prevent branch renaming
	// - `--force`: Generally dangerous
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/': true,
	'/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/': false,
};
