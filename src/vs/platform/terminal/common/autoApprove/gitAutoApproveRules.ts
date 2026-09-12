/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Default auto-approval rules for safe Git subcommands.
 *
 * These patterns support `-C <path>` and `--no-pager` immediately after `git`.
 * Git's uppercase `-C` changes directory, while lowercase `-c` injects configuration.
 */
export const gitAutoApproveRules: Readonly<Record<string, boolean>> = {
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+status\\b/': true,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+log\\b/': true,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/': false,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+show\\b/': true,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+show\\b.*\\s--output(=|\\s|$)/': false,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+diff\\b/': true,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+ls-files\\b/': true,

	// git branch
	// - `-d`, `-D`, `--delete`: Prevent branch deletion
	// - `-m`, `-M`: Prevent branch renaming
	// - `--force`: Generally dangerous
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+branch\\b/': true,
	'/^git(\\s+(-(?-i:C)\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/': false,
};
