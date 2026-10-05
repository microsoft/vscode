/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import sinon from 'sinon';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { CustomizationType, MessageKind, type ClientPluginCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { CustomizationEnablementKind } from '../../common/state/protocol/channels-session/state.js';
import type { AutomationEntry } from '../../common/state/protocol/channels-automation/state.js';
import { AgentHostAutomationCustomizations } from '../../node/agentHostAutomationCustomizations.js';
import { AUTOMATION_ACTIVE_CLIENT_ID, toAgentHostFileUri } from '../../common/agentPluginManager.js';

suite('AgentHostAutomationCustomizations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const hostPath = URI.file('/plugins/.host');
	const root = URI.joinPath(hostPath, 'automations');
	let fileService: FileService;
	let customizations: AgentHostAutomationCustomizations;
	const ref: ClientPluginCustomization = { type: CustomizationType.Plugin, id: 'bundle', uri: 'virtual:/bundle', name: 'Bundle', nonce: 'one' };

	setup(() => {
		fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		store.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, store.add(new InMemoryFileSystemProvider())));
		customizations = new AgentHostAutomationCustomizations(hostPath, fileService, new NullLogService(), URI.file('/home'));
	});

	teardown(() => sinon.restore());

	async function seed(content = '---\nname: Reviewer\n---\nReview carefully.'): Promise<void> {
		const source = toAgentClientUri(URI.parse(ref.uri), 'author');
		await fileService.writeFile(URI.joinPath(source, '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		await fileService.writeFile(URI.joinPath(source, 'agents/reviewer.md'), VSBuffer.fromString(content));
	}

	function entry(refs: ClientPluginCustomization[] = [ref], copies?: PluginCustomization[]): AutomationEntry {
		return {
			resource: 'ahp-automation:/example',
			definition: {
				title: 'Example', enabled: true, triggers: [],
				message: { text: 'Review', origin: { kind: MessageKind.Automation } },
				session: { provider: 'mock', customizations: refs },
			},
			customizations: copies,
			runs: [], operations: [], createdAt: '', modifiedAt: '',
		};
	}

	test('captures client-served contents and parses children without client-only fields', async () => {
		await seed();
		const [copy] = (await customizations.capture('author', [{ ...ref, clientId: 'author', childEnablement: {}, _meta: { private: true } }], undefined))!;
		const destination = URI.joinPath(root, createHash('sha256').update(`${ref.uri}\n${ref.nonce}`).digest('hex'));
		assert.deepStrictEqual({
			copy: { ...copy, children: copy.children?.map(child => ({ type: child.type, name: child.name, uri: child.uri })) },
			content: (await fileService.readFile(URI.joinPath(destination, 'agents/reviewer.md'))).value.toString(),
		}, {
			copy: {
				type: CustomizationType.Plugin, id: ref.id, uri: destination.toString(), name: ref.name,
				children: [{ type: CustomizationType.Agent, name: 'Reviewer', uri: URI.joinPath(destination, 'agents/reviewer.md').toString() }],
				load: { kind: 'loaded' }, icons: undefined, range: undefined, version: undefined,
			},
			content: '---\nname: Reviewer\n---\nReview carefully.',
		});
	});

	test('reuses unchanged copies without a client and recaptures changes while retaining the old directory', async () => {
		await seed();
		const copies = (await customizations.capture('author', [ref], undefined))!;
		const reused = await customizations.capture(undefined, [{ ...ref, name: 'Renamed' }], entry([ref], copies));
		await seed('Updated');
		const changed = (await customizations.capture('author', [{ ...ref, nonce: 'two' }], entry([ref], copies)))!;
		assert.deepStrictEqual({
			reused, distinct: changed[0].uri !== copies[0].uri,
			old: (await fileService.readFile(URI.joinPath(URI.parse(copies[0].uri), 'agents/reviewer.md'))).value.toString(),
			next: (await fileService.readFile(URI.joinPath(URI.parse(changed[0].uri), 'agents/reviewer.md'))).value.toString(),
		}, {
			reused: [{ ...copies[0], name: 'Renamed' }], distinct: true,
			old: '---\nname: Reviewer\n---\nReview carefully.', next: 'Updated',
		});
	});

	test('captures local file plugins in place, reuses them, and never garbage collects their paths', async () => {
		const directory = URI.file('/local/bundle');
		const localRef = { ...ref, uri: directory.toString() };
		await fileService.writeFile(URI.joinPath(directory, '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		await fileService.writeFile(URI.joinPath(directory, 'agents/reviewer.md'), VSBuffer.fromString('---\nname: Reviewer\n---\nReview.'));
		const copySpy = sinon.spy(fileService, 'copy');
		const copies = (await customizations.capture('author', [localRef], undefined, true))!;
		const reused = await customizations.capture(undefined, [{ ...localRef, name: 'Renamed' }], entry([localRef], copies));
		await fileService.createFolder(URI.joinPath(root, 'unused'));
		await customizations.collectGarbage([]);
		assert.deepStrictEqual({
			uri: copies[0].uri,
			children: copies[0].children?.map(child => ({ type: child.type, name: child.name, uri: child.uri })),
			load: copies[0].load,
			reused,
			copyCount: copySpy.callCount,
			collected: (await fileService.resolve(root)).children,
			sourceExists: await fileService.exists(directory),
		}, {
			uri: localRef.uri,
			children: [{ type: CustomizationType.Agent, name: 'Reviewer', uri: URI.joinPath(directory, 'agents/reviewer.md').toString() }],
			load: { kind: 'loaded' },
			reused: [{ ...copies[0], name: 'Renamed' }],
			copyCount: 0,
			collected: [],
			sourceExists: true,
		});
	});

	test('still copies virtual plugins for local clients', async () => {
		await seed();
		const [copy] = (await customizations.capture('author', [ref], undefined, true))!;
		const destination = URI.joinPath(root, createHash('sha256').update(`${ref.uri}\n${ref.nonce}`).digest('hex'));
		assert.deepStrictEqual({
			uri: copy.uri,
			children: copy.children?.map(child => child.uri),
		}, {
			uri: destination.toString(),
			children: [URI.joinPath(destination, 'agents/reviewer.md').toString()],
		});
	});

	test('still copies file plugins for remote clients', async () => {
		const remoteRef = { ...ref, uri: URI.file('/remote/bundle').toString() };
		const source = toAgentClientUri(URI.parse(remoteRef.uri), 'author');
		await fileService.writeFile(URI.joinPath(source, '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		const [copy] = (await customizations.capture('author', [remoteRef], undefined, false))!;
		const destination = URI.joinPath(root, createHash('sha256').update(`${remoteRef.uri}\n${remoteRef.nonce}`).digest('hex'));
		assert.deepStrictEqual({
			uri: copy.uri,
			manifest: (await fileService.readFile(URI.joinPath(destination, '.plugin/plugin.json'))).value.toString(),
			sourceExistsOnHost: await fileService.exists(URI.parse(remoteRef.uri)),
		}, {
			uri: destination.toString(), manifest: '{"name":"bundle"}', sourceExistsOnHost: false,
		});
	});

	test('shares nonce revisions across automations but not captures without a nonce', async () => {
		await seed();
		const first = (await customizations.capture('author', [ref], undefined))!;
		await seed('Updated');
		const shared = (await customizations.capture('other-client', [{ ...ref, id: 'other' }], undefined))!;
		const noNonce = { ...ref, nonce: undefined };
		const second = (await customizations.capture('author', [noNonce], undefined))!;
		const third = (await customizations.capture('author', [noNonce], undefined))!;
		assert.deepStrictEqual({ shared: shared[0].uri, id: shared[0].id, unique: second[0].uri !== third[0].uri }, {
			shared: first[0].uri, id: 'other', unique: true,
		});
	});

	test('rejects missing clients, invalid ids, and copy failures', async () => {
		await assert.rejects(customizations.capture(undefined, [ref], undefined), /dispatching client/);
		await assert.rejects(customizations.capture('author', [{ ...ref, id: ' ' }], undefined), /non-empty and unique/);
		await assert.rejects(customizations.capture('author', [ref, ref], undefined), /non-empty and unique/);
		await assert.rejects(customizations.capture('author', [ref], undefined));
		assert.deepStrictEqual(await customizations.capture(undefined, [], undefined), undefined);
	});

	test('rejects a parser failure rather than storing a success-shaped copy', async () => {
		const destination = URI.joinPath(root, createHash('sha256').update(`${ref.uri}\n${ref.nonce}`).digest('hex'));
		await fileService.writeFile(URI.joinPath(destination, 'plugin.json'), VSBuffer.fromString('{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"bundle"}'));
		sinon.stub(fileService, 'readFile').callThrough().onSecondCall().rejects(new Error('manifest read failed'));
		await assert.rejects(customizations.capture('author', [ref], undefined), /manifest.*missing/);
	});

	test('GC keeps referenced copies and removes stale revisions and staging leftovers', async () => {
		await seed();
		const copies = (await customizations.capture('author', [ref], undefined))!;
		await customizations.capture('author', [{ ...ref, nonce: 'two' }], undefined);
		await fileService.createFolder(URI.joinPath(root, '.staging-leftover'));
		await customizations.collectGarbage([entry([ref], copies)]);
		assert.deepStrictEqual((await fileService.resolve(root)).children?.map(child => child.resource.toString()), [copies[0].uri]);
	});

	test('GC keeps copies used by runs in this process after automations stop referencing them', async () => {
		await seed();
		const used = (await customizations.capture('author', [ref], undefined))!;
		customizations.toRunActiveClient(entry([ref], used));
		await seed('Updated');
		const unused = (await customizations.capture('author', [{ ...ref, nonce: 'two' }], undefined))!;
		await customizations.collectGarbage([]);
		assert.deepStrictEqual({
			used: await fileService.exists(URI.parse(used[0].uri)),
			unused: await fileService.exists(URI.parse(unused[0].uri)),
		}, { used: true, unused: false });
	});

	test('run active client preserves the template verbatim except uri and clientId', async () => {
		await seed();
		const copies = (await customizations.capture('author', [ref], undefined))!;
		const input: ClientPluginCustomization = {
			...ref, clientId: 'author', _meta: { custom: 'metadata' },
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			childEnablement: { Reviewer: [{ kind: CustomizationEnablementKind.Global, enabled: false }] },
		};
		assert.deepStrictEqual({
			activeClient: customizations.toRunActiveClient(entry([input], copies)),
			empty: customizations.toRunActiveClient(entry([])),
		}, {
			activeClient: {
				clientId: AUTOMATION_ACTIVE_CLIENT_ID, displayName: 'Automation', tools: [],
				customizations: [{ ...input, uri: toAgentHostFileUri(URI.parse(copies[0].uri)).toString(), clientId: AUTOMATION_ACTIVE_CLIENT_ID }],
			},
			empty: undefined,
		});
	});

	test('resolves bundled agent URIs without rewriting unrelated siblings', async () => {
		await seed();
		const copies = (await customizations.capture('author', [ref], undefined))!;
		const template = entry().definition.session;
		assert.deepStrictEqual({
			bundled: customizations.resolveAgent({ ...template, agent: { uri: 'virtual:/bundle/agents/reviewer.md' } }, copies),
			sibling: customizations.resolveAgent({ ...template, agent: { uri: 'virtual:/bundle-other/agents/reviewer.md' } }, copies),
			missing: customizations.resolveAgent(template, copies),
		}, {
			bundled: { uri: URI.joinPath(URI.parse(copies[0].uri), 'agents/reviewer.md').toString() },
			sibling: { uri: 'virtual:/bundle-other/agents/reviewer.md' },
			missing: undefined,
		});
	});
});
