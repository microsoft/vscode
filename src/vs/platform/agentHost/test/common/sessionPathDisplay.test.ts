/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { posix } from '../../../../base/common/path.js';
import { ExtUri, extUri, extUriIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getSessionPathDisplay, type ISessionPathRoot } from '../../common/sessionPathDisplay.js';

suite('Session path display', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const current = URI.parse('ahp-session:/current');
	const other = URI.parse('ahp-session:/other');
	const home = URI.file('/custom/copilot/session-state');
	const roots: readonly ISessionPathRoot[] = [
		{ root: URI.joinPath(home, 'main'), session: current },
		{ root: URI.joinPath(home, 'peer'), session: current },
		{ root: URI.joinPath(home, 'peer-two'), session: current },
		{ root: URI.joinPath(home, 'other'), session: other, title: 'Fix login' },
	];

	test('labels default and peer folders by their session, preserving the original target', () => {
		const paths = ['main', 'peer', 'peer-two', 'other'].map(id => `${home.path}/${id}/files/report.txt`);
		assert.deepStrictEqual(paths.map(path => getSessionPathDisplay(path, URI.file(path), current, roots, extUri)), paths.map((fullPath, index) => ({
			fullPath,
			label: `${index === 3 ? 'Session "Fix login"' : 'This session'} / files/report.txt`,
			session: index === 3 ? other : current,
			isCurrentSession: index !== 3,
			relativePath: 'files/report.txt',
		})));
	});

	test('handles roots, normalized descendants, and the most specific same-owner root', () => {
		const paths = [`${home.path}/main/`, `${home.path}/main/files/../report.txt`, `${home.path}/main/files/report.txt`];
		const nested = [...roots, { root: URI.joinPath(home, 'main', 'files'), session: current }];
		assert.deepStrictEqual(paths.map(path => getSessionPathDisplay(path, URI.file(path), current, nested, extUri).label), [
			'This session', 'This session / report.txt', 'This session / report.txt',
		]);
	});

	test('does not abbreviate unknown, shared, relative, escaping, or similarly prefixed paths', () => {
		const paths = [home.path, `${home.path}/unknown/file`, `${home.path}/main-other/file`, `${home.path}/main/../outside/file`, '/elsewhere/copilot/session-state/main/file', 'main/file'];
		assert.deepStrictEqual(paths.map(path => getSessionPathDisplay(path, URI.file(path), current, roots, extUri)), paths.map(fullPath => ({ label: fullPath, fullPath })));
	});

	test('falls back for untitled and conflicting owners, never matching by title', () => {
		const path = `${home.path}/other/file`;
		const resource = URI.file(path);
		assert.deepStrictEqual([
			getSessionPathDisplay(path, resource, current, [{ root: roots[3].root, session: other }], extUri),
			getSessionPathDisplay(path, resource, current, [...roots, { root: roots[3].root, session: current }], extUri),
			getSessionPathDisplay(path, resource, current, [{ ...roots[3], title: 'This session' }], extUri).label,
		], [
			{ label: path, fullPath: path },
			{ label: path, fullPath: path },
			'Session "This session" / file',
		]);
	});

	test('uses fresh ownership and titles without changing the physical path', () => {
		const path = `${home.path}/peer/file`;
		const resource = URI.file(path);
		const moved = [{ root: roots[1].root, session: other, title: 'Destination' }];
		assert.deepStrictEqual([
			getSessionPathDisplay(path, resource, current, roots, extUri).label,
			getSessionPathDisplay(path, resource, current, moved, extUri).label,
			getSessionPathDisplay(path, resource, other, moved, extUri).label,
			getSessionPathDisplay(path, resource, current, [{ ...moved[0], title: 'Renamed' }], extUri).label,
		], ['This session / file', 'Session "Destination" / file', 'This session / file', 'Session "Renamed" / file']);
	});

	test('uses explicit path-case semantics and preserves Windows spelling', () => {
		const fullPath = 'C:\\Users\\Example\\.copilot\\session-state\\MAIN\\files\\report.txt';
		const resource = URI.file('C:/Users/Example/.copilot/session-state/MAIN/files/report.txt');
		const windowsRoots = [{ root: URI.file('C:/Users/Example/.copilot/session-state/main'), session: current }];
		assert.deepStrictEqual([
			getSessionPathDisplay(fullPath, resource, current, windowsRoots, extUriIgnorePathCase),
			getSessionPathDisplay(fullPath, resource, current, windowsRoots, extUri),
		], [
			{ label: 'This session / files/report.txt', fullPath, session: current, isCurrentSession: true, relativePath: 'files/report.txt' },
			{ label: fullPath, fullPath },
		]);
	});

	test('derives storage-relative suffixes after case-insensitive POSIX file matching', () => {
		const posixExtUri = new ExtUri(() => true);
		// Model macOS file-URI relative-path math independently of the test runner's OS.
		posixExtUri.relativePath = (from, to) => posix.relative(from.path, to.path);
		const root = URI.file('/custom/copilot/session-state/sdk');
		const cases = [
			{ root, path: '/custom/copilot/session-state/SDK' },
			{ root: root.with({ path: `${root.path}/` }), path: '/custom/copilot/session-state/SDK/files/Report.txt' },
			{ root, path: '/custom/copilot/session-state/SDK/files/../Report.txt' },
		];
		assert.deepStrictEqual(cases.map(({ root, path }) => getSessionPathDisplay(path, URI.file(path), current, [{ root, session: current }], posixExtUri).label), [
			'This session',
			'This session / files/Report.txt',
			'This session / Report.txt',
		]);
	});

	test('accepts mapped virtual resources and isolates remote authorities', () => {
		const path = '/session-state/files/report.txt';
		const mapped = URI.joinPath(home, 'main', 'files', 'report.txt');
		const remote = mapped.with({ scheme: 'vscode-agent-host', authority: 'host-a' });
		const remoteRoots = roots.map(root => ({ ...root, root: root.root.with({ scheme: remote.scheme, authority: 'host-a' }) }));
		assert.deepStrictEqual([
			getSessionPathDisplay(path, mapped, current, roots, extUri).label,
			getSessionPathDisplay(path, remote, current, remoteRoots, extUri).label,
			getSessionPathDisplay(path, remote.with({ authority: 'host-b' }), current, remoteRoots, extUri).label,
		], ['This session / files/report.txt', 'This session / files/report.txt', path]);
	});

	test('returns literal names for the consumer to escape', () => {
		const title = '`[Review](command:run)` <script> & "quotes"\nnext';
		const path = `${home.path}/other/<file>.txt`;
		assert.deepStrictEqual(getSessionPathDisplay(path, URI.file(path), current, [{ ...roots[3], title }], extUri), {
			label: `Session "${title}" / <file>.txt`, fullPath: path, session: other, isCurrentSession: false, relativePath: '<file>.txt',
		});
	});
});
