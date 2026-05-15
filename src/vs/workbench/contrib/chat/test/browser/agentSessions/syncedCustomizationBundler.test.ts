/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { SyncedCustomizationBundler } from '../../../browser/agentSessions/agentHost/syncedCustomizationBundler.js';
import { IAgentHostFileSystemService, SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';

suite('SyncedCustomizationBundler', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let instantiationService: TestInstantiationService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const memFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));

		// Register the synced-customization scheme via a mock service
		const syncedProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(SYNCED_CUSTOMIZATION_SCHEME, syncedProvider));

		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentHostFileSystemService, { ensureSyncedCustomizationProvider() { /* already registered above */ } });
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function createBundler(authority = 'test-agent'): SyncedCustomizationBundler {
		return disposables.add(instantiationService.createInstance(SyncedCustomizationBundler, authority));
	}

	async function seedFile(path: string, content: string): Promise<URI> {
		const uri = URI.from({ scheme: Schemas.inMemory, path });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
		return uri;
	}

	test('returns undefined for empty file list', async () => {
		const bundler = createBundler();
		const result = await bundler.bundle([]);
		assert.strictEqual(result, undefined);
	});

	test('returns undefined when all files have unsupported types', async () => {
		const bundler = createBundler();
		const uri = await seedFile('/test/hooks.json', '{}');
		// Hooks are not supported by the bundler yet
		const result = await bundler.bundle([{ uri, type: PromptsType.hook }]);
		assert.strictEqual(result, undefined);
	});

	test('bundles instruction files into rules directory', async () => {
		const bundler = createBundler();
		const uri = await seedFile('/test/my-rules.md', '# My rules\nDo X');

		const result = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
		assert.ok(result, 'should return a result');
		assert.ok(result.ref.uri, 'should have a URI');
		assert.strictEqual(result.ref.displayName, 'VS Code Synced Data');
		assert.ok(result.ref.nonce, 'should have a nonce');

		// Verify the file was written to the in-memory FS
		const destUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/rules/my-rules.md' });
		const content = await fileService.readFile(destUri);
		assert.strictEqual(content.value.toString(), '# My rules\nDo X');
	});

	test('bundles files into correct directories by type', async () => {
		const bundler = createBundler();
		const instrUri = await seedFile('/test/rule.md', 'rule content');
		const promptUri = await seedFile('/test/cmd.prompt.md', 'prompt content');
		const agentUri = await seedFile('/test/my-agent.md', 'agent content');
		const skillUri = await seedFile('/test/my-skill.md', 'skill content');

		const result = await bundler.bundle([
			{ uri: instrUri, type: PromptsType.instructions },
			{ uri: promptUri, type: PromptsType.prompt },
			{ uri: agentUri, type: PromptsType.agent },
			{ uri: skillUri, type: PromptsType.skill },
		]);
		assert.ok(result);

		// Verify each file landed in the correct directory
		const ruleContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/rules/rule.md' }));
		assert.strictEqual(ruleContent.value.toString(), 'rule content');

		const cmdContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/commands/cmd.prompt.md' }));
		assert.strictEqual(cmdContent.value.toString(), 'prompt content');

		const agentContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/agents/my-agent.md' }));
		assert.strictEqual(agentContent.value.toString(), 'agent content');

		// Non-SKILL.md skill files are written flat
		const skillContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/my-skill.md' }));
		assert.strictEqual(skillContent.value.toString(), 'skill content');
	});

	test('bundles SKILL.md files into per-skill subdirectories', async () => {
		const bundler = createBundler();
		const skillA = await seedFile('/skills/skill-a/SKILL.md', 'skill A content');
		const skillB = await seedFile('/skills/skill-b/SKILL.md', 'skill B content');
		const skillC = await seedFile('/skills/my-cool-skill/SKILL.md', 'skill C content');

		const result = await bundler.bundle([
			{ uri: skillA, type: PromptsType.skill },
			{ uri: skillB, type: PromptsType.skill },
			{ uri: skillC, type: PromptsType.skill },
		]);
		assert.ok(result);

		// Each SKILL.md should be in its own subdirectory (named after the parent folder)
		const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/skill-a/SKILL.md' }));
		assert.strictEqual(contentA.value.toString(), 'skill A content');

		const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/skill-b/SKILL.md' }));
		assert.strictEqual(contentB.value.toString(), 'skill B content');

		const contentC = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/my-cool-skill/SKILL.md' }));
		assert.strictEqual(contentC.value.toString(), 'skill C content');
	});

	test('writes plugin manifest', async () => {
		const bundler = createBundler();
		const uri = await seedFile('/test/file.md', 'content');

		await bundler.bundle([{ uri, type: PromptsType.instructions }]);

		const manifestUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/.plugin/plugin.json' });
		const manifest = await fileService.readFile(manifestUri);
		const parsed = JSON.parse(manifest.value.toString());
		assert.strictEqual(parsed.name, 'VS Code Synced Data');
	});

	test('nonce is stable for same content', async () => {
		const bundler = createBundler();
		const uri = await seedFile('/test/stable.md', 'same content');

		const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
		const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
		assert.strictEqual(result1!.ref.nonce, result2!.ref.nonce);
	});

	test('nonce changes when content changes', async () => {
		const bundler = createBundler();
		const uri = await seedFile('/test/changing.md', 'v1');

		const result1 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
		await fileService.writeFile(uri, VSBuffer.fromString('v2'));
		const result2 = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
		assert.notStrictEqual(result1!.ref.nonce, result2!.ref.nonce);
	});

	test('nonce is order-independent', async () => {
		const bundler = createBundler();
		const uriA = await seedFile('/test/a.md', 'A');
		const uriB = await seedFile('/test/b.md', 'B');

		const result1 = await bundler.bundle([
			{ uri: uriA, type: PromptsType.instructions },
			{ uri: uriB, type: PromptsType.instructions },
		]);
		const result2 = await bundler.bundle([
			{ uri: uriB, type: PromptsType.instructions },
			{ uri: uriA, type: PromptsType.instructions },
		]);
		assert.strictEqual(result1!.ref.nonce, result2!.ref.nonce);
	});

	test('different authorities do not conflict', async () => {
		const bundlerA = createBundler('agent-a');
		const bundlerB = createBundler('agent-b');
		const uri = await seedFile('/test/shared.md', 'shared content');

		await bundlerA.bundle([{ uri, type: PromptsType.instructions }]);
		await bundlerB.bundle([{ uri, type: PromptsType.instructions }]);

		// Both should have their own copy
		const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/agent-a/rules/shared.md' }));
		const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/agent-b/rules/shared.md' }));
		assert.strictEqual(contentA.value.toString(), 'shared content');
		assert.strictEqual(contentB.value.toString(), 'shared content');
	});

	test('lastNonce tracks the most recent bundle', async () => {
		const bundler = createBundler();
		assert.strictEqual(bundler.lastNonce, undefined);

		const uri = await seedFile('/test/track.md', 'tracking');
		const result = await bundler.bundle([{ uri, type: PromptsType.instructions }]);
		assert.strictEqual(bundler.lastNonce, result!.ref.nonce);
	});

	test('SKILL.md files with same basename do not overwrite each other', async () => {
		const bundler = createBundler();
		// Both files have the same basename "SKILL.md" — the collision bug
		// caused all skills to overwrite each other at skills/SKILL.md.
		const skillA = await seedFile('/skills/alpha/SKILL.md', 'alpha skill');
		const skillB = await seedFile('/skills/beta/SKILL.md', 'beta skill');

		const result = await bundler.bundle([
			{ uri: skillA, type: PromptsType.skill },
			{ uri: skillB, type: PromptsType.skill },
		]);
		assert.ok(result);

		// Both should be preserved in separate subdirectories
		const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/alpha/SKILL.md' }));
		const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/beta/SKILL.md' }));
		assert.strictEqual(contentA.value.toString(), 'alpha skill');
		assert.strictEqual(contentB.value.toString(), 'beta skill');
	});

	test('non-SKILL.md skill files are written flat', async () => {
		const bundler = createBundler();
		const skillUri = await seedFile('/test/my-helper.md', 'helper skill');

		const result = await bundler.bundle([{ uri: skillUri, type: PromptsType.skill }]);
		assert.ok(result);

		// Non-SKILL.md files go directly under skills/ without subdirectory
		const content = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/my-helper.md' }));
		assert.strictEqual(content.value.toString(), 'helper skill');
	});

	test('mixed SKILL.md and non-SKILL.md skill files coexist', async () => {
		const bundler = createBundler();
		const skillDir = await seedFile('/skills/council-plan/SKILL.md', 'council plan');
		const skillFlat = await seedFile('/test/quick-fix.md', 'quick fix');

		const result = await bundler.bundle([
			{ uri: skillDir, type: PromptsType.skill },
			{ uri: skillFlat, type: PromptsType.skill },
		]);
		assert.ok(result);

		const contentA = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/council-plan/SKILL.md' }));
		assert.strictEqual(contentA.value.toString(), 'council plan');

		const contentB = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/skills/quick-fix.md' }));
		assert.strictEqual(contentB.value.toString(), 'quick fix');
	});

	test('SKILL.md nonce includes subdirectory path', async () => {
		const bundler = createBundler();
		// Two skills with same content but different parent dirs should produce
		// different nonces because their hash keys include the subdirectory.
		const skillA = await seedFile('/skills/skill-x/SKILL.md', 'same content');
		const skillB = await seedFile('/skills/skill-y/SKILL.md', 'same content');

		const resultA = await bundler.bundle([{ uri: skillA, type: PromptsType.skill }]);
		const resultB = await bundler.bundle([{ uri: skillB, type: PromptsType.skill }]);
		assert.notStrictEqual(resultA!.ref.nonce, resultB!.ref.nonce);
	});

	test('rebundle clears previous tree', async () => {
		const bundler = createBundler();
		const uri = await seedFile('/test/first.md', 'first version');

		await bundler.bundle([{ uri, type: PromptsType.instructions }]);

		// Verify the first file exists
		const destUri = URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/rules/first.md' });
		const content = await fileService.readFile(destUri);
		assert.strictEqual(content.value.toString(), 'first version');

		// Re-bundle with a different file — old file should be gone
		const uri2 = await seedFile('/test/second.md', 'second version');
		await bundler.bundle([{ uri: uri2, type: PromptsType.instructions }]);

		let threw = false;
		try {
			await fileService.readFile(destUri);
		} catch {
			threw = true;
		}
		assert.ok(threw, 'old file should have been deleted by rebundle');

		const newContent = await fileService.readFile(URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/test-agent/rules/second.md' }));
		assert.strictEqual(newContent.value.toString(), 'second version');
	});

	test('bundle description includes file count', async () => {
		const bundler = createBundler();
		const uriA = await seedFile('/test/a.md', 'A');
		const uriB = await seedFile('/test/b.md', 'B');
		const uriC = await seedFile('/test/c.md', 'C');

		const result = await bundler.bundle([
			{ uri: uriA, type: PromptsType.instructions },
			{ uri: uriB, type: PromptsType.agent },
			{ uri: uriC, type: PromptsType.prompt },
		]);
		assert.ok(result);
		assert.ok(result.ref.description?.includes('3'), 'description should mention file count');
	});
});
