/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import * as path from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFolderQuery, ISerializedFileMatch, isProgressMessage, QueryType } from '../../common/search.js';
import { getSearchIgnoreFileNames } from '../../common/searchIgnoreFiles.js';
import { SearchService } from '../../node/rawSearchService.js';
import { TextSearchEngineAdapter } from '../../node/textSearchAdapter.js';

suite('ContributedIgnoreFiles-integration', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let folder: string;
	const nested = 'nested[glob]';
	const files = {
		'.customignore': '\uFEFFinherited.txt\nparent-only.txt \n/root-only.txt\ndirectory-only/\n \t\n# Comment\n!\n/\n',
		'.rgignore': 'ripgrep-ignored.txt\n',
		'.gitignore': 'git-ignored.txt\n',
		'included.txt': 'fixture\n',
		'inherited.txt': 'fixture\n',
		'root-only.txt': 'fixture\n',
		'git-ignored.txt': 'fixture\n',
		'ripgrep-ignored.txt': 'fixture\n',
		'directory-only.txt': 'fixture\n',
		'directory-only/file.txt': 'fixture\n',
		[`${nested}/.customignore`]: 'local.txt\n/anchored.txt\n!inherited.txt\n',
		[`${nested}/local.txt`]: 'fixture\n',
		[`${nested}/anchored.txt`]: 'fixture\n',
		[`${nested}/inherited.txt`]: 'fixture\n',
		[`${nested}/parent-only.txt`]: 'fixture\n',
		[`${nested}/root-only.txt`]: 'fixture\n',
		'sibling/local.txt': 'fixture\n',
		'sibling/anchored.txt': 'fixture\n',
		'sibling/inherited.txt': 'fixture\n',
	};
	const included = ['directory-only.txt', 'git-ignored.txt', 'included.txt', `${nested}/inherited.txt`, `${nested}/root-only.txt`, 'sibling/anchored.txt', 'sibling/local.txt'].sort();

	setup(async () => {
		folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-ignore-test-'));
		await Promise.all(Object.entries(files).map(async ([file, contents]) => {
			const filePath = path.join(folder, file);
			await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
			await fs.promises.writeFile(filePath, contents);
		}));
	});

	teardown(async () => {
		await fs.promises.rm(folder, { recursive: true, force: true });
	});

	for (const kind of ['file', 'text'] as const) {
		async function search(folderQuery: IFolderQuery, contributions: string[][] = [['.customignore']], includePattern?: { [pattern: string]: boolean }, excludePattern?: { [pattern: string]: boolean }): Promise<string[]> {
			const commonQuery = {
				folderQueries: [folderQuery],
				ignoreFileNames: getSearchIgnoreFileNames(contributions),
				includePattern,
				excludePattern,
			};
			const results: ISerializedFileMatch[] = [];
			if (kind === 'file') {
				await new SearchService().doFileSearch({ ...commonQuery, type: QueryType.File, filePattern: 'txt' }, undefined, progress => {
					if (!isProgressMessage(progress)) {
						results.push(...(Array.isArray(progress) ? progress : [progress]));
					}
				});
			} else {
				const token = disposables.add(new CancellationTokenSource()).token;
				await new TextSearchEngineAdapter({ ...commonQuery, type: QueryType.Text, contentPattern: { pattern: 'fixture' } }).search(token, progress => results.push(...progress), () => { });
			}
			return results.map(result => path.relative(folderQuery.folder.fsPath, result.path).split(path.sep).join('/')).sort();
		}

		test(`${kind} search scopes nested rules and negations to their directories`, async () => {
			assert.deepStrictEqual(await search({ folder: URI.file(folder), disregardIgnoreFiles: false }), included);
		});

		test(`${kind} search retains .rgignore when the contributing extension is disabled`, async () => {
			const expected = Object.keys(files).filter(file => file.endsWith('.txt') && file !== 'ripgrep-ignored.txt').sort();
			assert.deepStrictEqual(await search({ folder: URI.file(folder), disregardIgnoreFiles: false }, []), expected);
		});

		test(`${kind} search reads .gitignore only when contributed`, async () => {
			assert.deepStrictEqual(await search({ folder: URI.file(folder), disregardIgnoreFiles: false }, [['.customignore', '.gitignore']]), included.filter(file => file !== 'git-ignored.txt'));
		});

		test(`${kind} search can disregard all ignore files`, async () => {
			assert.deepStrictEqual(await search({ folder: URI.file(folder), disregardIgnoreFiles: true }), Object.keys(files).filter(file => file.endsWith('.txt')).sort());
		});

		test(`${kind} search can disregard contributed parent ignore files`, async () => {
			assert.deepStrictEqual(await search({ folder: URI.file(path.join(folder, nested)), disregardIgnoreFiles: false, disregardParentIgnoreFiles: true }), ['inherited.txt', 'parent-only.txt', 'root-only.txt']);
		});

		test(`${kind} search applies parent rules relative to the parent directory`, async () => {
			assert.deepStrictEqual(await search({ folder: URI.file(path.join(folder, nested)), disregardIgnoreFiles: false, disregardParentIgnoreFiles: false }), ['inherited.txt', 'root-only.txt']);
		});

		test(`${kind} search keeps include and exclude globs relative to the search root`, async () => {
			assert.deepStrictEqual(await search({ folder: URI.file(path.join(folder, nested)), disregardIgnoreFiles: false, disregardParentIgnoreFiles: false }, [['.customignore']], { 'root-only.txt': true, 'inherited.txt': true }, { 'inherited.txt': true }), ['root-only.txt']);
		});

		test(`${kind} search preserves escaped spaces and comment markers`, async () => {
			const syntaxFolder = path.join(folder, 'syntax');
			await fs.promises.mkdir(syntaxFolder);
			await fs.promises.writeFile(path.join(syntaxFolder, '.customignore'), '\\#ignored.txt\n\\!ignored.txt\nspace\\ .txt\n');
			await Promise.all(['#ignored.txt', '!ignored.txt', 'space .txt', 'space.txt'].map(file => fs.promises.writeFile(path.join(syntaxFolder, file), 'fixture\n')));
			assert.deepStrictEqual(await search({ folder: URI.file(syntaxFolder), disregardIgnoreFiles: false }), ['space.txt']);
		});
	}
});
