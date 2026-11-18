/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { GitCommitMessageGenerator } from '../../src/extension/prompt/node/gitCommitMessageGenerator';
import { Diff } from '../../src/platform/git/common/gitDiffService';
import { TestWorkspaceService } from '../../src/platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../src/platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../src/util/common/test/shims/textDocument';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { URI } from '../../src/util/vs/base/common/uri';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';

ssuite({ title: 'git commit message', location: 'external' }, () => {
	stest({ description: 'Generates a simple commit message', language: 'python' }, async (testingServiceCollection) => {
		const content = `
def print_hello_world():
        print("Hello, World!")`;

		const document = createTextDocumentData(URI.file('main.py'), content, 'python').document;
		testingServiceCollection.define(IWorkspaceService, new TestWorkspaceService(undefined, [document]));

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		const diff = `diff --git a/main.py b/main.py
index 0877b83..6260896 100644
--- a/main.py
+++ b/main.py
@@ -1,2 +1,2 @@
-def print_hello_world():
+def greet():
		print("Hello, World!")
\ No newline at end of file`;

		const changes: Diff[] = [
			{
				uri: document.uri,
				originalUri: document.uri,
				renameUri: undefined,
				status: 5 /* Modified */,
				diff
			} satisfies Diff
		];

		const generator = instantiationService.createInstance(GitCommitMessageGenerator);
		const message = await generator.generateGitCommitMessage('test-repo', 'main', changes, { repository: [], user: [] }, 0, CancellationToken.None);
		assert.ok(message !== undefined, 'Failed to generate a commit message');
	});

	stest({ description: 'Generates a conventional commit message for a bug fix', language: 'python' }, async (testingServiceCollection) => {
		const content = `
def print_hello_world():
        print("Hello, World!")`;

		const document = createTextDocumentData(URI.file('main.py'), content, 'python').document;
		testingServiceCollection.define(IWorkspaceService, new TestWorkspaceService(undefined, [document]));

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		const diff = `diff --git a/main.py b/main.py
index 0877b83..6260896 100644
--- a/main.py
+++ b/main.py
@@ -1,2 +1,2 @@
-def print_hello_world():
+def greet():
		print("Hello, World!")
\ No newline at end of file`;

		const repoCommits = [
			'feat: add greet function (by person@example.com)',
			'chore: setup initial project [fixes #3425]'
		];
		const userCommits = [
			'refactor: move logic into main.py',
			'feat: add hello world'
		];

		const changes: Diff[] = [
			{
				uri: document.uri,
				originalUri: document.uri,
				renameUri: undefined,
				status: 5 /* Modified */,
				diff
			} satisfies Diff
		];

		const generator = instantiationService.createInstance(GitCommitMessageGenerator);
		const message = await generator.generateGitCommitMessage('test-repo', 'main', changes, { repository: repoCommits, user: userCommits }, 0, CancellationToken.None);

		assert.ok(message !== undefined, 'Failed to generate a commit message');
		assert.ok(!userCommits.some(commit => message.toLowerCase().includes(commit)), 'Commit message contains a user commit');
		assert.ok(!repoCommits.some(commit => message.toLowerCase().includes(commit)), 'Commit message contains a repo commit');
		assert.ok(['fix:', 'chore:', 'feat:', 'refactor:'].some(prefix => message.toLowerCase().startsWith(prefix)), 'Commit message does not follow the conventional commits format');
		assert.ok(!message.includes('example.com'), 'Commit message contains the email address');
		assert.ok(!/#\d+/.test(message), 'Commit message does include an issue reference');

	});

	stest({ description: 'Generated commit messages do not bias to conventional commit style', language: 'python' }, async (testingServiceCollection) => {
		const content = `
def show_exomple():
        print("This is an example.")`;

		const document = createTextDocumentData(URI.file('main.py'), content, 'python').document;
		testingServiceCollection.define(IWorkspaceService, new TestWorkspaceService(undefined, [document]));

		const accessor = testingServiceCollection.createTestingAccessor();
		const instantiationService = accessor.get(IInstantiationService);

		const diff = `diff --git a/sample.py b/sample.py
index 0877b83..6260896 100644
--- a/sample.py
+++ b/sample.py
@@ -1,3 +1,3 @@
-def show_exomple():
+def show_example():
    print("This is an example.")
\ No newline at end of file`;

		const repoCommits = [
			'Initial project setup',
			'Install dependencies'
		];

		const userCommits = [
			'Add sample'
		];

		const changes: Diff[] = [
			{
				uri: document.uri,
				originalUri: document.uri,
				renameUri: undefined,
				status: 5 /* Modified */,
				diff
			} satisfies Diff
		];

		const generator = instantiationService.createInstance(GitCommitMessageGenerator);
		const message = await generator.generateGitCommitMessage('test-repo', 'main', changes, { repository: repoCommits, user: userCommits }, 0, CancellationToken.None);

		assert.ok(message !== undefined, 'Failed to generate a commit message');
		assert.ok(!userCommits.some(commit => message.toLowerCase().includes(commit)), 'Commit message contains a user commit');
		assert.ok(!repoCommits.some(commit => message.toLowerCase().includes(commit)), 'Commit message contains a repo commit');
		assert.ok(!['fix:', 'feat:', 'chore:', 'docs:', 'style:', 'refactor:'].some(prefix => message.toLowerCase().startsWith(prefix)), 'Commit message should not use conventional commits format');
	});
});
