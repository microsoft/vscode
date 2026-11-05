/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileOperationResult, FileSystemProviderCapabilities, toFileOperationResult } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildCopilotBuiltinSkillsContainer, COPILOT_TROUBLESHOOT_SKILL_CONTENT, createCopilotSkillProvider } from '../../node/copilot/copilotBuiltinSkills.js';
import { CopilotBuiltinAgentsStore } from '../../node/copilot/copilotBuiltinAgents.js';

suite('Copilot builtin troubleshoot skill', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('supplies the exact host home and SDK conversation for concurrent reads', async () => {
		const home = URI.file('/custom home/"quoted"/$&');
		const providers = ['owner-sdk-id', 'peer-sdk-id'].map(id => createCopilotSkillProvider(id, home));
		const options = { signal: new AbortController().signal };
		await Promise.all(providers.map(provider => provider.listSkills(options)));
		const contents = await Promise.all(providers.map(provider => provider.readSkill('troubleshoot', options)));
		assert.deepStrictEqual(contents.map((content, index) => ({
			current: content?.includes(JSON.stringify(URI.joinPath(home, 'session-state', index === 0 ? 'owner-sdk-id' : 'peer-sdk-id', 'events.jsonl').fsPath)),
			root: content?.includes(JSON.stringify(URI.joinPath(home, 'session-state').fsPath)),
			unresolved: content?.includes('{{COPILOT_SESSION_LOG_CONTEXT}}'),
			xdg: content?.includes('XDG_STATE_HOME'),
		})), Array.from({ length: 2 }, () => ({ current: true, root: true, unresolved: false, xdg: false })));
	});

	test('unknown skills and cancelled reads do not return content', async () => {
		const provider = createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'));
		const controller = new AbortController();
		const reason = new Error('Cancelled');
		controller.abort(reason);
		assert.strictEqual(await provider.readSkill('other', { signal: new AbortController().signal }), undefined);
		await assert.rejects(async () => provider.readSkill('troubleshoot', { signal: controller.signal }), reason);
	});

	test('published skill is readable but cannot change the shipped or SDK content', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(new CopilotBuiltinAgentsStore(fileService));
		const child = buildCopilotBuiltinSkillsContainer().children![0];
		const uri = URI.parse(child.uri);
		await assert.rejects(fileService.writeFile(uri, VSBuffer.fromString('modified')),
			(error: Error) => toFileOperationResult(error) === FileOperationResult.FILE_PERMISSION_DENIED);
		const provider = createCopilotSkillProvider('sdk-id', URI.file('/copilot-home'));
		assert.deepStrictEqual({
			scheme: uri.scheme,
			readonly: fileService.hasCapability(uri, FileSystemProviderCapabilities.Readonly),
			content: (await fileService.readFile(uri)).value.toString(),
			sdkContent: (await provider.readSkill('troubleshoot', { signal: new AbortController().signal }))?.startsWith('# Troubleshoot'),
		}, { scheme: 'copilot-builtin', readonly: true, content: COPILOT_TROUBLESHOOT_SKILL_CONTENT, sdkContent: true });
	});
});
