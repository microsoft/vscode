/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostCanvasPackage, IAgentHostCanvasPackagesService, ICanvasPackageLaunch } from '../../common/agentHostCanvasPackages.js';
import { AgentHostLocalCanvasesConfigKey } from '../../common/agentHostSchema.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { CustomizationEnablementResolution, ICustomizationEnablementChangeEvent } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CopilotCanvasLaunchAuthority } from '../../node/copilot/copilotCanvasLaunchAuthority.js';
import { createNoopCustomizationEnablementService } from './testCustomizationEnablementService.js';

suite('CopilotCanvasLaunchAuthority', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.file('/workspace');
	const pluginDirectory = URI.file('/installed/package/revision');
	const item: IAgentHostCanvasPackage = { id: 'package', name: 'Package', source: URI.file('/source').toString(), snapshot: pluginDirectory.toString(), revision: 'revision', fileCount: 1, byteLength: 1 };
	const launch: ICanvasPackageLaunch = { packageId: item.id, revision: item.revision, pluginDirectory, workspace, dataDirectory: URI.file('/data/package/workspace') };

	function fixture(local = true) {
		const log = new NullLogService();
		const state = store.add(new AgentHostStateManager(log));
		const configuration = store.add(new AgentConfigurationService(state, log));
		configuration.updateRootConfig({ [AgentHostLocalCanvasesConfigKey]: true });
		const packagesChanged = store.add(new Emitter<string>());
		const enablementChanged = store.add(new Emitter<ICustomizationEnablementChangeEvent>());
		let approved = true;
		let pending = false;
		let resolver: Promise<ICanvasPackageLaunch | undefined> | undefined;
		const resolutions: { sessionId: string; modulePath: string; workspace: string }[] = [];
		const packages = upcastPartial<IAgentHostCanvasPackagesService>({
			supported: true,
			onDidChange: packagesChanged.event,
			list: () => [item],
			isApproved: () => approved,
			resolveLaunch: async (sessionId, modulePath, directory) => {
				resolutions.push({ sessionId, modulePath, workspace: directory.toString() });
				return resolver ?? (approved ? launch : undefined);
			},
		});
		const enablement = {
			...createNoopCustomizationEnablementService(),
			onDidChange: enablementChanged.event,
			resolve: (): CustomizationEnablementResolution => pending
				? { kind: 'pending', reason: 'session' }
				: { kind: 'resolved', enabled: true, enablement: [], workingDirectory: { kind: 'directory', uri: workspace } },
		};
		const authority = store.add(new CopilotCanvasLaunchAuthority(() => local, packages, enablement, configuration, log));
		const stops: string[] = [];
		const bind = (sessionId: string, directories = [pluginDirectory], retained = true) => {
			const chat = URI.parse(`ahp-chat:/session/${sessionId}`);
			const lease = store.add(authority.bind({
				sessionId, chat, session: URI.parse('copilotcli:/session'), workspace, pluginDirectories: directories,
				stop: async () => { stops.push(sessionId); },
			}));
			if (retained) {
				lease.markRetained();
			}
			return { chat, lease };
		};
		return {
			authority, bind, stops, resolutions, configuration,
			revokePackage: () => { approved = false; packagesChanged.fire(item.id); },
			setPending: (value: boolean) => { pending = value; enablementChanged.fire({ sessions: ['copilotcli:/session'] }); },
			setResolver: (value: Promise<ICanvasPackageLaunch | undefined>) => { resolver = value; },
		};
	}

	test('resolves the exact pre-registered backing and refuses unknown runtime sessions', async () => {
		const f = fixture();
		f.bind('sdk-main');
		assert.deepStrictEqual({
			unknown: await f.authority.resolve('unknown', 'extension', '/module.mjs'),
			launch: await f.authority.resolve('sdk-main', 'extension', '/module.mjs'),
			resolutions: f.resolutions,
		}, {
			unknown: undefined,
			launch,
			resolutions: [{ sessionId: 'extension', modulePath: '/module.mjs', workspace: workspace.toString() }],
		});
	});

	test('an approved package outside this backing plugin snapshot is still denied', async () => {
		const f = fixture();
		f.bind('sdk-main', [URI.file('/different-plugin')]);
		assert.strictEqual(await f.authority.resolve('sdk-main', 'extension', '/module.mjs'), undefined);
	});

	test('even an approved cold backing cannot execute before SDK retention is confirmed', async () => {
		const f = fixture();
		const { lease } = f.bind('sdk-cold', [pluginDirectory], false);
		const beforeRetention = await f.authority.resolve('sdk-cold', 'extension', '/module.mjs');
		lease.markRetained();
		assert.deepStrictEqual({
			beforeRetention,
			afterRetention: await f.authority.resolve('sdk-cold', 'extension', '/module.mjs'),
			resolutions: f.resolutions.length,
		}, { beforeRetention: undefined, afterRetention: launch, resolutions: 1 });
	});

	test('revocation invalidates a pending authorization before it can return a launch', async () => {
		const f = fixture();
		const { lease } = f.bind('sdk-main');
		const deferred = new DeferredPromise<ICanvasPackageLaunch | undefined>();
		f.setResolver(deferred.p);
		const resolving = f.authority.resolve('sdk-main', 'extension', '/module.mjs');
		f.configuration.updateRootConfig({ [AgentHostLocalCanvasesConfigKey]: false });
		await deferred.complete(launch);
		await f.authority.whenIdle();
		assert.throws(() => lease.assertCurrent(), /Cancel/);
		assert.deepStrictEqual({ result: await resolving, stops: f.stops }, { result: undefined, stops: ['sdk-main'] });
	});

	test('package or enablement revocation stops the owning executable backing', async () => {
		for (const revoke of ['package', 'enablement']) {
			const f = fixture();
			const { lease } = f.bind('sdk-main');
			await f.authority.resolve('sdk-main', 'extension', '/module.mjs');
			if (revoke === 'package') {
				f.revokePackage();
			} else {
				f.setPending(true);
			}
			await f.authority.whenIdle();
			assert.throws(() => lease.assertCurrent(), /Cancel/);
			assert.deepStrictEqual({ result: await f.authority.resolve('sdk-main', 'extension', '/module.mjs'), stops: f.stops }, { result: undefined, stops: ['sdk-main'] });
		}
	});

	test('chat revocation and old lease disposal cannot affect an independent peer or new incarnation', async () => {
		const f = fixture();
		const first = f.bind('sdk-main');
		const peer = f.bind('sdk-peer');
		f.authority.revokeChat(first.chat);
		await f.authority.whenIdle();
		first.lease.dispose();
		const replacement = f.bind('sdk-main');
		first.lease.dispose();
		peer.lease.assertCurrent();
		replacement.lease.assertCurrent();
		assert.deepStrictEqual(f.stops, ['sdk-main']);
	});

	test('a remote host cannot bind launch authority even when the preview is enabled', () => {
		const f = fixture(false);
		assert.throws(() => f.bind('sdk-main'), /unavailable/);
	});

	test('replacing the SDK client retires every backing lease before asynchronous shutdown', async () => {
		const f = fixture();
		const first = f.bind('sdk-main');
		const peer = f.bind('sdk-peer');
		await f.authority.resolve('sdk-main', 'extension', '/module.mjs');
		f.authority.revokeAll();
		assert.throws(() => first.lease.assertCurrent(), /Cancel/);
		assert.throws(() => peer.lease.assertCurrent(), /Cancel/);
		await f.authority.whenIdle();
		assert.deepStrictEqual({
			late: await f.authority.resolve('sdk-main', 'extension', '/module.mjs'),
			stopped: f.stops,
		}, { late: undefined, stopped: ['sdk-main', 'sdk-peer'] });
	});
});
