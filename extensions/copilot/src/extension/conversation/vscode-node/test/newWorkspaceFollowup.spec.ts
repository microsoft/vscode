/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
import { expect, suite, test } from 'vitest';
import { isUriContained, resolveProjectFileUri } from '../newWorkspaceFollowup';

/**
 * Unit tests for the path-traversal containment helper guarding the
 * "Create Workspace" file-write loop. This is the runtime defense-in-depth
 * for the MSRC-reported path traversal in the new-workspace flow.
 */
suite('isUriContained', () => {
	const parent = Uri.file('/home/u/proj');

	test('accepts paths at or within the parent folder', () => {
		expect(isUriContained(parent, parent)).toBe(true);
		expect(isUriContained(parent, Uri.file('/home/u/proj/a.txt'))).toBe(true);
		expect(isUriContained(parent, Uri.file('/home/u/proj/sub/dir/a.txt'))).toBe(true);
	});

	test('rejects sibling paths with a shared name prefix', () => {
		// Classic prefix-collision: /home/u/proj vs /home/u/proj-evil
		expect(isUriContained(parent, Uri.file('/home/u/proj-evil/x'))).toBe(false);
		expect(isUriContained(parent, Uri.file('/home/u/projx'))).toBe(false);
	});

	test('rejects paths that escape the parent via traversal', () => {
		// `Uri.joinPath` normalizes `..` before the comparison runs, so we
		// supply the resolved URI that the production code would actually see.
		expect(isUriContained(parent, Uri.file('/home/u/package.json'))).toBe(false);
		expect(isUriContained(parent, Uri.file('/etc/passwd'))).toBe(false);
	});

	test('rejects URIs with mismatched scheme or authority', () => {
		const remoteParent = Uri.parse('vscode-remote://host/proj');
		const localChild = Uri.file('/proj/a.txt');
		expect(isUriContained(remoteParent, localChild)).toBe(false);

		const otherHost = Uri.parse('vscode-remote://other/proj/a.txt');
		expect(isUriContained(remoteParent, otherHost)).toBe(false);

		const sameHostChild = Uri.parse('vscode-remote://host/proj/a.txt');
		expect(isUriContained(remoteParent, sameHostChild)).toBe(true);
	});

	test('handles a parent path that already ends with a slash', () => {
		const withSlash = parent.with({ path: parent.path + '/' });
		expect(isUriContained(withSlash, Uri.file('/home/u/proj/a.txt'))).toBe(true);
		expect(isUriContained(withSlash, Uri.file('/home/u/proj-evil/x'))).toBe(false);
	});
});

/**
 * Regression test for the GitHub repo-template "Create Workspace" flow.
 *
 * `listFilesInResponseFileTree` emits paths that may or may not include a
 * leading `/` depending on the source (the GitHub repo-template flow emits
 * `/<repo>/...`, the copilot flow emits `<projectName>/...`). The platform-
 * aware `path.relative` previously resolved a relative `projectRoot` against
 * `cwd` for the absolute `file`, producing a nonsense `..`-laden traversal that
 * `Uri.joinPath` normalized outside `workspaceUri` — so the runtime containment
 * guard added by the MSRC fix would silently skip every file. The fix forces
 * posix semantics with absolutized inputs.
 */
suite('resolveProjectFileUri', () => {
	const workspaceUri = Uri.file('/home/u/parent/myrepo');

	test('handles a `/`-prefixed file path (GitHub repo-template flow)', () => {
		const fileUri = resolveProjectFileUri(workspaceUri, 'myrepo', '/src/index.ts');
		expect(fileUri.path).toBe('/home/u/parent/myrepo/src/index.ts');
	});

	test('handles a non-prefixed file path (copilot new-workspace flow)', () => {
		const fileUri = resolveProjectFileUri(workspaceUri, 'myrepo', 'myrepo/src/index.ts');
		expect(fileUri.path).toBe('/home/u/parent/myrepo/src/index.ts');
	});

	test('preserves traversal segments so the containment check can reject them', () => {
		// A bypass of the parser must still be caught downstream by `isUriContained`.
		// `Uri.joinPath` normalizes `..`, so the resolved path escapes the workspace
		// and `isUriContained(workspaceUri, fileUri)` will return false.
		const fileUri = resolveProjectFileUri(workspaceUri, 'myrepo', 'myrepo/../package.json');
		expect(isUriContained(workspaceUri, fileUri)).toBe(false);
	});

	test('source preview URI built from the unmodified `file` resolves to the expected preview path', () => {
		// `createWorkspace` reads preview content via `Uri.joinPath(baseUri, file)`
		// using the *unmodified* `file` emitted by `listFilesInResponseFileTree`.
		// `Uri.joinPath` is backed by `paths.posix.join`, which treats arguments
		// as path segments (it does NOT drop `baseUri.path` when the next segment
		// starts with `/`). Asserting this here so the source/destination URI
		// shapes do not drift in the future.
		const baseUri = Uri.parse('vscode-copilot-github-workspace://req/myrepo');
		// GitHub repo-template flow: emitted file = `/src/index.ts`.
		expect(Uri.joinPath(baseUri, '/src/index.ts').path).toBe('/myrepo/src/index.ts');
		// Copilot new-workspace flow: emitted file = `myproject/src/index.ts`.
		const copilotBase = Uri.parse('vscode-copilot-workspace://req/myproject');
		expect(Uri.joinPath(copilotBase, 'myproject/src/index.ts').path).toBe('/myproject/myproject/src/index.ts');
	});
});
