/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { ILanguagePacks } from '../../../nls.js';
import { join } from '../../common/path.js';
import { IResolveNLSConfigurationContext, resolveNLSConfiguration } from '../../node/nls.js';
import { Promises } from '../../node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { getRandomTestPath } from './testUtils.js';

type NLSMetadata = Pick<IResolveNLSConfigurationContext, 'nlsMetadataPath' | 'nlsMetadataHash'>;

suite('NLS configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const commit = 'test-commit';
	const languagePackId = 'test-language-pack.de';
	let testDir: string;
	let userDataPath: string;
	let vscodeDev: string | undefined;

	setup(async () => {
		vscodeDev = process.env['VSCODE_DEV'];
		delete process.env['VSCODE_DEV'];

		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'nls');
		userDataPath = join(testDir, 'user');
		await promises.mkdir(userDataPath, { recursive: true });

		const translationsFile = join(testDir, 'main.i18n.json');
		const languagePacks: ILanguagePacks = {
			de: {
				hash: 'test-language-pack',
				label: 'Deutsch',
				extensions: [],
				translations: { vscode: translationsFile }
			}
		};
		await Promise.all([
			promises.writeFile(join(userDataPath, 'languagepacks.json'), JSON.stringify(languagePacks)),
			promises.writeFile(translationsFile, JSON.stringify({
				contents: {
					'vs/base/test': { first: 'Erste', second: 'Zweite' },
					'vs/workbench/api/common/extHostLogService': { remote: 'Entfernt' }
				}
			}))
		]);
	});

	teardown(async () => {
		if (vscodeDev === undefined) {
			delete process.env['VSCODE_DEV'];
		} else {
			process.env['VSCODE_DEV'] = vscodeDev;
		}
		await Promises.rm(testDir);
	});

	async function writeMetadata(name: string, keys: Array<[string, string[]]>, messages: string[]): Promise<NLSMetadata> {
		const nlsMetadataPath = join(testDir, name);
		await promises.mkdir(nlsMetadataPath, { recursive: true });
		await Promise.all([
			promises.writeFile(join(nlsMetadataPath, 'nls.keys.json'), JSON.stringify(keys)),
			promises.writeFile(join(nlsMetadataPath, 'nls.messages.json'), JSON.stringify(messages))
		]);
		return {
			nlsMetadataPath,
			nlsMetadataHash: createHash('sha256').update(JSON.stringify({ commit, keys, messages })).digest('hex')
		};
	}

	async function resolveMessages(metadata: NLSMetadata) {
		const configuration = await resolveNLSConfiguration({
			userLocale: 'de',
			osLocale: 'de',
			userDataPath,
			commit,
			...metadata
		});
		assert.ok(configuration.languagePack);
		const messages: string[] = JSON.parse(await promises.readFile(configuration.languagePack.messagesFile, 'utf8'));
		return { ...configuration.languagePack, messages };
	}

	test('switches between server and server-web tables at the same commit', async () => {
		const serverMetadata = await writeMetadata('server', [
			['vs/workbench/api/common/extHostLogService', ['remote']]
		], ['Remote']);
		const serverWebMetadata = await writeMetadata('server-web', [
			['vs/base/test', ['first', 'missing']],
			['vs/workbench/api/common/extHostLogService', ['remote']]
		], ['First', 'Fallback', 'Remote']);

		const server = await resolveMessages(serverMetadata);
		const serverWeb = await resolveMessages(serverWebMetadata);
		const serverAgain = await resolveMessages(serverMetadata);

		assert.deepStrictEqual({
			messages: [server.messages, serverWeb.messages, serverAgain.messages],
			distinctTargetCaches: server.messagesFile !== serverWeb.messagesFile,
			reusedServerCache: server.messagesFile === serverAgain.messagesFile
		}, {
			messages: [['Entfernt'], ['Erste', 'Fallback', 'Entfernt'], ['Entfernt']],
			distinctTargetCaches: true,
			reusedServerCache: true
		});
	});

	test('distinguishes key order when the default messages are identical', async () => {
		const firstMetadata = await writeMetadata('first', [['vs/base/test', ['first', 'second']]], ['Same', 'Same']);
		const secondMetadata = await writeMetadata('second', [['vs/base/test', ['second', 'first']]], ['Same', 'Same']);

		const first = await resolveMessages(firstMetadata);
		const second = await resolveMessages(secondMetadata);

		assert.deepStrictEqual([first.messages, second.messages], [['Erste', 'Zweite'], ['Zweite', 'Erste']]);
	});

	test('refreshes fallback messages after rebuilding at the same commit', async () => {
		const originalMetadata = await writeMetadata('server', [['vs/base/test', ['missing']]], ['Original']);
		const original = await resolveMessages(originalMetadata);
		const updatedMetadata = await writeMetadata('server', [['vs/base/test', ['missing']]], ['Updated']);
		const updated = await resolveMessages(updatedMetadata);

		assert.deepStrictEqual([original.messages, updated.messages], [['Original'], ['Updated']]);
	});

	test('reuses the cache for identical tables in different locations', async () => {
		const firstMetadata = await writeMetadata('first', [['vs/base/test', ['first']]], ['First']);
		const secondMetadata = await writeMetadata('second', [['vs/base/test', ['first']]], ['First']);
		const first = await resolveMessages(firstMetadata);
		await promises.writeFile(first.messagesFile, JSON.stringify(['Cached translation']));
		const second = await resolveMessages(secondMetadata);

		assert.deepStrictEqual({
			sameCache: first.messagesFile === second.messagesFile,
			messages: second.messages
		}, {
			sameCache: true,
			messages: ['Cached translation']
		});
	});

	test('a cache hit does not read the NLS tables', async () => {
		const metadata = await writeMetadata('server', [['vs/base/test', ['first']]], ['First']);
		const first = await resolveMessages(metadata);
		await Promise.all([
			promises.unlink(join(metadata.nlsMetadataPath, 'nls.keys.json')),
			promises.unlink(join(metadata.nlsMetadataPath, 'nls.messages.json'))
		]);
		const cached = await resolveMessages(metadata);

		assert.deepStrictEqual({
			sameCache: first.messagesFile === cached.messagesFile,
			messages: cached.messages
		}, {
			sameCache: true,
			messages: ['Erste']
		});
	});

	test('does not reuse or overwrite a legacy commit-only cache', async () => {
		const legacyCachePath = join(userDataPath, 'clp', languagePackId, commit);
		await promises.mkdir(legacyCachePath, { recursive: true });
		const legacyMessagesFile = join(legacyCachePath, 'nls.messages.json');
		await promises.writeFile(legacyMessagesFile, JSON.stringify(['Legacy translation']));
		const metadata = await writeMetadata('server', [['vs/base/test', ['first']]], ['First']);
		const result = await resolveMessages(metadata);

		assert.deepStrictEqual({
			messages: result.messages,
			separateCache: result.messagesFile !== legacyMessagesFile,
			legacy: JSON.parse(await promises.readFile(legacyMessagesFile, 'utf8'))
		}, {
			messages: ['Erste'],
			separateCache: true,
			legacy: ['Legacy translation']
		});
	});

	test('preserves the legacy cache path for products without an identity', async () => {
		const metadata = await writeMetadata('server', [['vs/base/test', ['first']]], ['First']);
		const result = await resolveMessages({ nlsMetadataPath: metadata.nlsMetadataPath });

		assert.deepStrictEqual({
			messages: result.messages,
			messagesFile: result.messagesFile
		}, {
			messages: ['Erste'],
			messagesFile: join(userDataPath, 'clp', languagePackId, commit, 'nls.messages.json')
		});
	});

	test('regenerates all table caches after a corruption marker', async () => {
		const firstMetadata = await writeMetadata('first', [['vs/base/test', ['first']]], ['First']);
		const secondMetadata = await writeMetadata('second', [['vs/base/test', ['second']]], ['Second']);
		const first = await resolveMessages(firstMetadata);
		const second = await resolveMessages(secondMetadata);
		await promises.writeFile(first.corruptMarkerFile, 'corrupt');
		const regenerated = await resolveMessages(firstMetadata);

		assert.deepStrictEqual({
			messages: regenerated.messages,
			secondCacheExists: await Promises.exists(second.messagesFile),
			translationsConfigExists: await Promises.exists(regenerated.translationsConfigFile)
		}, {
			messages: ['Erste'],
			secondCacheExists: false,
			translationsConfigExists: true
		});
	});

	test('does not require NLS metadata for the default locale', async () => {
		const nlsMetadataPath = join(testDir, 'missing');
		const result = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', userDataPath, commit, nlsMetadataPath });

		assert.deepStrictEqual(result, {
			userLocale: 'en',
			osLocale: 'en',
			resolvedLanguage: 'en',
			defaultMessagesFile: join(nlsMetadataPath, 'nls.messages.json'),
			locale: 'en',
			availableLanguages: {}
		});
	});
});
