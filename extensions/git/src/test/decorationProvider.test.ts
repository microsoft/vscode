/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import { EventEmitter, Uri } from 'vscode';
import { GitIgnoreDecorationProvider } from '../decorationProvider';
import type { Repository } from '../repository';

suite('git ignore decorations', () => {
	const root = path.resolve('/git-ignore-decorations/repository');
	let clock: sinon.SinonFakeTimers;
	let onDidCloseRepository: EventEmitter<Repository>;
	let provider: GitIgnoreDecorationProvider;
	let checkedPaths: string[][];
	let repository: Repository;

	setup(() => {
		clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		onDidCloseRepository = new EventEmitter<Repository>();
		checkedPaths = [];
		repository = {
			root,
			checkIgnore: async (paths: string[]) => {
				checkedPaths.push(paths);
				return new Set(paths);
			}
		} satisfies Pick<Repository, 'root' | 'checkIgnore'> as Repository;
		const onDidOpenRepository = new EventEmitter<Repository>();
		provider = new GitIgnoreDecorationProvider({
			getRepository: () => repository,
			onDidOpenRepository: onDidOpenRepository.event,
			onDidCloseRepository: onDidCloseRepository.event
		});
	});

	teardown(() => {
		provider.dispose();
		onDidCloseRepository.dispose();
		clock.restore();
	});

	test('checks pending paths once the debounce elapses', async () => {
		const uri = Uri.file(path.join(root, 'ignored.txt'));
		const decoration = provider.provideFileDecoration(uri);

		clock.tick(500);

		// Compare against `fsPath`, which the provider passes on and which lowercases Windows drive letters.
		assert.deepStrictEqual({ checkedPaths, ignored: !!(await decoration) }, { checkedPaths: [[uri.fsPath]], ignored: true });
	});

	test('does not run check-ignore for a repository closed before the debounce elapses', async () => {
		const decoration = provider.provideFileDecoration(Uri.file(path.join(root, 'ignored.txt')));

		onDidCloseRepository.fire(repository);
		clock.tick(500);

		assert.deepStrictEqual({ checkedPaths, decoration: await decoration }, { checkedPaths: [], decoration: undefined });
	});
});
