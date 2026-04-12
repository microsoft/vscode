"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const git_1 = __importDefault(require("../../../completions/git"));
// const gitSubcommandAndArgs = ['--bare', '--exec-path', '--git-dir', '--help', '--html-path', '--info-path', '--man-path', '--namespace', '--no-optional-locks', '--no-pager', '--no-replace-objects', '--paginate', '--version', '--work-tree', '-C', '-c', '-p', 'add', 'apply', 'archive', 'bisect', 'blame', 'branch', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'config', 'daemon', 'diff', 'fetch', 'grep', 'init', 'log', 'ls-remote', 'merge', 'mergetool', 'mv', 'pull', 'push', 'rebase', 'reflog', 'remote', 'reset', 'restore', 'revert', 'rm', 'show', 'stage', 'stash', 'status', 'submodule', 'switch', 'tag', 'worktree'];
// const gitCommitArgs = ['--', '--all', '--allow-empty', '--allow-empty-message', '--amend', '--author', '--branch', '--cleanup', '--date', '--dry-run', '--edit', '--file', '--fixup', '--gpg-sign', '--include', '--long', '--message', '--no-edit', '--no-gpg-sign', '--no-post-rewrite', '--no-signoff', '--no-status', '--no-verify', '--null', '--only', '--patch', '--pathspec-file-nul', '--pathspec-from-file', '--porcelain', '--quiet', '--reedit-message', '--reset-author', '--reuse-message', '--short', '--signoff', '--squash', '--status', '--template', '--untracked-files', '--verbose', '-C', '-F', '-S', '-a', '-am', '-c', '-e', '-i', '-m', '-n', '-o', '-p', '-q', '-s', '-t', '-u', '-v', '-z'];
// const gitMergeArgs = ['-', '--abort', '--allow-unrelated-histories', '--autostash', '--cleanup', '--commit', '--continue', '--edit', '--ff', '--ff-only', '--file', '--gpg-sign', '--log', '--no-autostash', '--no-commit', '--no-edit', '--no-ff', '--no-gpg-sign', '--no-log', '--no-overwrite-ignore', '--no-progress', '--no-rerere-autoupdate', '--no-signoff', '--no-squash', '--no-stat', '--no-summary', '--no-verify', '--no-verify-signatures', '--overwrite-ignore', '--progress', '--quiet', '--quit', '--rerere-autoupdate', '--signoff', '--squash', '--stat', '--strategy', '--strategy-option', '--summary', '--verbose', '--verify-signatures', '-F', '-S', '-X', '-e', '-m', '-n', '-q', '-s'];
// const gitAddArgs = ['--', '--all', '--chmod', '--dry-run', '--edit', '--force', '--ignore-errors', '--ignore-missing', '--ignore-removal', '--intent-to-add', '--interactive', '--no-all', '--no-ignore-removal', '--no-warn-embedded-repo', '--patch', '--pathspec-file-nul', '--pathspec-from-file', '--refresh', '--renormalize', '--update', '--verbose', '-A', '-N', '-e', '-f', '-i', '-n', '-p', '-u', '-v'];
const expectedCompletions = [{ label: 'git', description: git_1.default.description }];
exports.gitTestSuiteSpec = {
    name: 'git',
    completionSpecs: git_1.default,
    availableCommands: 'git',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'g|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'gi|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'git|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // TODO: These currently read .gitconfig and end up returning different results depending on the system
        // Basic options
        // { input: 'git |', expectedCompletions: gitSubcommandAndArgs },
        // Complex options
        // { input: 'git add |', expectedCompletions: gitAddArgs, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
        // { input: 'git commit |', expectedCompletions: gitCommitArgs },
        // { input: 'git merge |', expectedCompletions: gitMergeArgs }
    ],
};
//# sourceMappingURL=git.test.js.map