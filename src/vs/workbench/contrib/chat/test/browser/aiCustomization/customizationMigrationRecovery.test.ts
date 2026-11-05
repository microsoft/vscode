/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { createCustomizationMigrationRecoveryPlan, listCustomizationMigrationRecoveries, prepareCustomizationMigrationRecovery, restoreCustomizationMigrationSources, updateCustomizationMigrationRecovery } from '../../../browser/aiCustomization/customizationMigrationRecovery.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';

suite('Customization migration recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class ConcurrentSourceChangeProvider extends InMemoryFileSystemProvider {
		beforeSourceMove: (() => Promise<void>) | undefined;

		override async rename(from: URI, to: URI, options: { overwrite: boolean }): Promise<void> {
			if (this.beforeSourceMove && to.path.includes('.before-restore-')) {
				const beforeSourceMove = this.beforeSourceMove;
				this.beforeSourceMove = undefined;
				await beforeSourceMove();
			}
			return super.rename(from, to, options);
		}
	}

	function createFileService(provider: InMemoryFileSystemProvider = new InMemoryFileSystemProvider()): FileService {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(provider)));
		return fileService;
	}

	test('backs up and restores files and complete skill directories', async () => {
		const fileService = createFileService();
		const root = URI.from({ scheme: Schemas.inMemory, path: '/migration' });
		const instruction = URI.from({ scheme: Schemas.inMemory, path: '/user/instructions.md' });
		const skill = URI.from({ scheme: Schemas.inMemory, path: '/workspace/skills/review' });
		await fileService.writeFile(instruction, VSBuffer.fromString('original instructions'));
		await fileService.writeFile(URI.joinPath(skill, 'SKILL.md'), VSBuffer.fromString('original skill'));
		await fileService.writeFile(URI.joinPath(skill, 'reference.md'), VSBuffer.fromString('original reference'));

		const recovery = await prepareCustomizationMigrationRecovery(fileService, root, 'flow-1', { id: 'copilot', label: 'Copilot' }, [
			{ uri: instruction, storage: PromptsStorage.user, type: PromptsType.instructions },
			{ uri: skill, storage: PromptsStorage.local, type: PromptsType.skill },
			{ uri: skill, storage: PromptsStorage.local, type: PromptsType.skill },
		]);
		await fileService.writeFile(instruction, VSBuffer.fromString('changed instructions'));
		await fileService.del(skill, { recursive: true });

		const plan = await createCustomizationMigrationRecoveryPlan(fileService, recovery.manifestResource);
		const result = await restoreCustomizationMigrationSources(fileService, plan, true);
		const listed = await listCustomizationMigrationRecoveries(fileService, URI.joinPath(root, '..'));

		assert.deepStrictEqual({
			sourceStates: plan.entries.map(entry => entry.state),
			result,
			instruction: (await fileService.readFile(instruction)).value.toString(),
			skill: (await fileService.readFile(URI.joinPath(skill, 'SKILL.md'))).value.toString(),
			reference: (await fileService.readFile(URI.joinPath(skill, 'reference.md'))).value.toString(),
			sourceCount: recovery.manifest.sources.length,
			listed: listed.recoveries.map(item => item.manifest.migrationFlowId),
			errors: listed.errors.map(error => error.message),
		}, {
			sourceStates: ['changed', 'missing'],
			result: { restored: 2, unchanged: 0 },
			instruction: 'original instructions',
			skill: 'original skill',
			reference: 'original reference',
			sourceCount: 2,
			listed: ['flow-1'],
			errors: [],
		});
	});

	test('tracks lifecycle and refuses changed sources without confirmation', async () => {
		const fileService = createFileService();
		const root = URI.from({ scheme: Schemas.inMemory, path: '/customizationMigrations/flow-2' });
		const source = URI.from({ scheme: Schemas.inMemory, path: '/user/agent.agent.md' });
		await fileService.writeFile(source, VSBuffer.fromString('original'));
		const recovery = await prepareCustomizationMigrationRecovery(fileService, root, 'flow-2', { id: 'claude', label: 'Claude' }, [
			{ uri: source, storage: PromptsStorage.user, type: PromptsType.agent },
		]);
		await updateCustomizationMigrationRecovery(fileService, recovery.manifestResource, {
			status: 'running',
			sessionResource: URI.parse('ahp-session:/session-1'),
		});
		await fileService.writeFile(source, VSBuffer.fromString('changed'));
		const plan = await createCustomizationMigrationRecoveryPlan(fileService, recovery.manifestResource);

		await assert.rejects(() => restoreCustomizationMigrationSources(fileService, plan, false), /without confirmation/);
		const listed = await listCustomizationMigrationRecoveries(fileService, URI.joinPath(root, '..'));

		assert.deepStrictEqual({
			state: plan.entries[0].state,
			status: listed.recoveries[0].manifest.status,
			sessionResource: listed.recoveries[0].manifest.sessionResource,
			content: (await fileService.readFile(source)).value.toString(),
		}, {
			state: 'changed',
			status: 'running',
			sessionResource: 'ahp-session:/session-1',
			content: 'changed',
		});
	});

	test('preserves a source changed concurrently with restore', async () => {
		const provider = new ConcurrentSourceChangeProvider();
		const fileService = createFileService(provider);
		const root = URI.from({ scheme: Schemas.inMemory, path: '/customizationMigrations/flow-3' });
		const source = URI.from({ scheme: Schemas.inMemory, path: '/user/agent.agent.md' });
		await fileService.writeFile(source, VSBuffer.fromString('original'));
		const recovery = await prepareCustomizationMigrationRecovery(fileService, root, 'flow-3', { id: 'codex', label: 'Codex' }, [
			{ uri: source, storage: PromptsStorage.user, type: PromptsType.agent },
		]);
		await fileService.writeFile(source, VSBuffer.fromString('changed before confirmation'));
		const plan = await createCustomizationMigrationRecoveryPlan(fileService, recovery.manifestResource);
		provider.beforeSourceMove = async () => {
			await fileService.writeFile(source, VSBuffer.fromString('changed after confirmation'));
		};

		await assert.rejects(() => restoreCustomizationMigrationSources(fileService, plan, true), /changed after confirmation/);

		assert.strictEqual((await fileService.readFile(source)).value.toString(), 'changed after confirmation');
	});

	test('removes a directory that displaced an original file', async () => {
		const fileService = createFileService();
		const root = URI.from({ scheme: Schemas.inMemory, path: '/customizationMigrations/flow-4' });
		const source = URI.from({ scheme: Schemas.inMemory, path: '/user/agent.agent.md' });
		await fileService.writeFile(source, VSBuffer.fromString('original'));
		const recovery = await prepareCustomizationMigrationRecovery(fileService, root, 'flow-4', { id: 'copilot', label: 'Copilot' }, [
			{ uri: source, storage: PromptsStorage.user, type: PromptsType.agent },
		]);
		await fileService.del(source);
		await fileService.writeFile(URI.joinPath(source, 'nested.md'), VSBuffer.fromString('replacement'));
		const plan = await createCustomizationMigrationRecoveryPlan(fileService, recovery.manifestResource);

		const result = await restoreCustomizationMigrationSources(fileService, plan, true);

		assert.deepStrictEqual({
			result,
			content: (await fileService.readFile(source)).value.toString(),
		}, {
			result: { restored: 1, unchanged: 0 },
			content: 'original',
		});
	});
});
