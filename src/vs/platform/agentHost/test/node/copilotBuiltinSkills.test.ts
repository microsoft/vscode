/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFile } from 'fs/promises';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IFileContent, IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { createCopilotSkillProvider } from '../../node/copilot/copilotBuiltinSkills.js';

suite('Copilot builtin troubleshoot skill', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('loads lazily and supplies the exact host home and SDK conversation for concurrent reads', async () => {
		const reads: string[] = [];
		const fileService = upcastPartial<IFileService>({
			readFile: async resource => {
				reads.push(resource.path);
				return upcastPartial<IFileContent>({ value: VSBuffer.wrap(await readFile(resource.fsPath)) });
			},
		});
		const home = URI.file('/custom home/"quoted"/$&');
		const providers = ['owner-sdk-id', 'peer-sdk-id'].map(id => createCopilotSkillProvider(id, home, fileService, new NullLogService()));
		const options = { signal: new AbortController().signal };
		await Promise.all(providers.map(provider => provider.listSkills(options)));
		assert.deepStrictEqual(reads, []);
		const contents = await Promise.all(providers.map(provider => provider.readSkill('troubleshoot', options)));
		assert.deepStrictEqual(contents.map((content, index) => ({
			current: content?.includes(JSON.stringify(URI.joinPath(home, 'session-state', index === 0 ? 'owner-sdk-id' : 'peer-sdk-id', 'events.jsonl').fsPath)),
			root: content?.includes(JSON.stringify(URI.joinPath(home, 'session-state').fsPath)),
			unresolved: content?.includes('{{COPILOT_SESSION_LOG_CONTEXT}}'),
			xdg: content?.includes('XDG_STATE_HOME'),
		})), Array.from({ length: 2 }, () => ({ current: true, root: true, unresolved: false, xdg: false })));
	});

	test('unknown skills and cancelled reads do not read the asset', async () => {
		let reads = 0;
		const fileService = upcastPartial<IFileService>({
			readFile: async () => { reads++; throw new Error('Unexpected read'); },
		});
		const provider = createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'), fileService, new NullLogService());
		const controller = new AbortController();
		const reason = new Error('Cancelled');
		controller.abort(reason);
		assert.strictEqual(await provider.readSkill('other', { signal: new AbortController().signal }), undefined);
		await assert.rejects(async () => provider.readSkill('troubleshoot', { signal: controller.signal }), reason);
		assert.strictEqual(reads, 0);
	});

	test('asset failures are logged and propagated rather than returning an empty skill', async () => {
		const failure = new Error('Skill asset missing');
		const logged: unknown[] = [];
		const logService = new class extends NullLogService {
			override error(_message: string | Error, ...args: unknown[]): void { logged.push(...args); }
		};
		const provider = createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'), upcastPartial<IFileService>({
			readFile: async () => { throw failure; },
		}), logService);
		await assert.rejects(async () => provider.readSkill('troubleshoot', { signal: new AbortController().signal }), failure);
		assert.deepStrictEqual(logged, [failure]);
	});
});
