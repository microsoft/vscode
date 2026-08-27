/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { Emitter } from '../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILinkPresentation, ILinkPresentationProviderRegistration } from '../../../../platform/dataChannel/common/dataChannel.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { DataChannelService, LinkPresentationService } from '../../../services/dataChannel/browser/dataChannelService.js';
import { NullExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadDataChannels } from '../../browser/mainThreadDataChannels.js';
import { ExtHostDataChannels } from '../../common/extHostDataChannels.js';
import { ExtHostDataChannelsShape, MainThreadDataChannelsShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadDataChannels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the selected kind when the provider is no longer available', () => {
		const presentations: unknown[] = [];
		const extHostProxy = new class extends mock<ExtHostDataChannelsShape>() {
			override $acceptLinkPresentation(_handle: number, data: unknown): void {
				presentations.push(data);
			}

			override $acceptLinkPresentationRules(): void { }
		};
		const mainThread = store.add(new MainThreadDataChannels(
			SingleProxyRPCProtocol(extHostProxy),
			store.add(new DataChannelService()),
			store.add(new LinkPresentationService(
				new NullExtensionService(),
				new NullLogService(),
				new TestConfigurationService(),
				store.add(new TestStorageService()),
			)),
		));

		mainThread.$createLinkPresentationWatcher(1, 'missing', 'pullRequest', URI.parse('https://example.com/pull/1'));

		assert.deepStrictEqual(presentations, [{
			kind: 'pullRequest',
			status: { kind: 'error', label: 'Not available' },
			tooltip: 'The selected link presentation provider does not accept this resource.',
			ariaLabel: 'Link presentation is not available',
		}]);
	});

	test('bridges core link presentation watchers and runtime enablement', async () => {
		const presentation = observableValue<ILinkPresentation | undefined>('presentation', {
			kind: 'session',
			status: { kind: 'pending', label: 'Loading' },
		});
		const configurationService = new TestConfigurationService({ 'test.richLinks.enabled': true });
		const linkPresentationService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			configurationService,
			store.add(new TestStorageService()),
		));
		let providerWatcherCreateCount = 0;
		let providerWatcherDisposeCount = 0;
		store.add(linkPresentationService.registerLinkPresentationProvider({
			id: 'test.sessions',
			uriPattern: /^agent-host-session:/i,
			kind: 'session',
			enablement: 'test.richLinks.enabled',
		}, {
			createLinkPresentationWatcher: () => {
				providerWatcherCreateCount++;
				return {
					presentation,
					dispose: () => providerWatcherDisposeCount++,
				};
			},
		}));

		let acceptedRules: readonly { id: string; source: string; flags: string; kind: vscode.LinkPresentationKind }[] = [];
		const extHostHolder: { value?: ExtHostDataChannels } = {};
		const extHostProxy: ExtHostDataChannelsShape = {
			$onDidReceiveData: (channelId, value) => extHostHolder.value?.$onDidReceiveData(channelId, value),
			$acceptLinkPresentationRules: rules => {
				acceptedRules = rules;
				extHostHolder.value?.$acceptLinkPresentationRules(rules);
			},
			$acceptLinkPresentation: (handle, value) => extHostHolder.value?.$acceptLinkPresentation(handle, value),
			$createLinkPresentationWatcher: (handle, providerHandle, resource) => extHostHolder.value
				? extHostHolder.value.$createLinkPresentationWatcher(handle, providerHandle, resource)
				: Promise.reject(new Error('Extension host is not initialized.')),
			$disposeLinkPresentationWatcher: handle => extHostHolder.value?.$disposeLinkPresentationWatcher(handle),
		};
		const mainThread = store.add(new MainThreadDataChannels(
			SingleProxyRPCProtocol(extHostProxy),
			store.add(new DataChannelService()),
			linkPresentationService,
		));
		const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThread));
		extHostHolder.value = extHost;
		extHost.$acceptLinkPresentationRules(acceptedRules);
		let ruleChangeCount = 0;
		store.add(extHost.onDidChangeLinkPresentationRules(() => ruleChangeCount++));
		const extension = {
			...nullExtensionDescription,
			enabledApiProposals: ['linkPresentation'],
		};
		assert.throws(
			() => extHost.createLinkPresentationWatcher(extension, 'test.sessions', URI.parse('https://example.com/not-supported')),
			/does not accept/,
		);
		const watcher = store.add(extHost.createLinkPresentationWatcher(extension, 'test.sessions', URI.parse('agent-host-session://copilotcli/session')));
		const values: vscode.LinkPresentationData[] = [watcher.presentation];
		store.add(watcher.onDidChangePresentation(() => values.push(watcher.presentation)));

		presentation.set({ kind: 'session', title: 'Running session', status: { kind: 'pending', label: 'Working' } }, undefined);
		await configurationService.setUserConfiguration('test.richLinks.enabled', false);
		fireConfigurationChange(configurationService, 'test.richLinks.enabled');
		presentation.set({ kind: 'session', title: 'Completed session', status: { kind: 'success', label: 'Completed' } }, undefined);
		await configurationService.setUserConfiguration('test.richLinks.enabled', true);
		fireConfigurationChange(configurationService, 'test.richLinks.enabled');
		await Promise.resolve();
		await Promise.resolve();
		watcher.dispose();
		linkPresentationService.dispose();

		assert.deepStrictEqual({
			values,
			acceptedRules,
			linkPresentationRules: extHost.linkPresentationRules.map(rule => ({ id: rule.id, source: rule.uriPattern.source, flags: rule.uriPattern.flags, kind: rule.kind })),
			ruleChangeCount,
			providerWatcherCreateCount,
			providerWatcherDisposeCount,
		}, {
			values: [
				{ kind: 'session', status: { kind: 'pending', label: 'Loading' } },
				{ kind: 'session', title: 'Running session', status: { kind: 'pending', label: 'Working' } },
				{ kind: 'session', title: 'Running session', status: { kind: 'pending', label: 'Working' }, isLoading: true },
				{ kind: 'session', title: 'Completed session', status: { kind: 'success', label: 'Completed' } },
			],
			acceptedRules: [{ id: 'test.sessions', source: '^agent-host-session:', flags: 'i', kind: 'session' }],
			linkPresentationRules: [{ id: 'test.sessions', source: '^agent-host-session:', flags: 'i', kind: 'session' }],
			ruleChangeCount: 2,
			providerWatcherCreateCount: 2,
			providerWatcherDisposeCount: 2,
		});
	});

	test('selects extension providers by URI regexp and shares live watchers', async () => {
		const configurationService = new TestConfigurationService({ 'test.richLinks.enabled': true });
		const linkPresentationService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			configurationService,
			store.add(new TestStorageService()),
		));
		store.add(linkPresentationService.declareExtensionLinkPresentationProvider('test.extension', {
			id: 'test.linkPresentations',
			uriPattern: '^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$',
			kind: 'pullRequest',
			enablement: 'test.richLinks.enabled',
		}));
		let acceptedRules: readonly { id: string; source: string; flags: string; kind: vscode.LinkPresentationKind }[] = [];
		const extHostProxy: ExtHostDataChannelsShape = {
			$onDidReceiveData: (channelId, value) => extHost.$onDidReceiveData(channelId, value),
			$acceptLinkPresentationRules: rules => acceptedRules = rules,
			$acceptLinkPresentation: (handle, value) => extHost.$acceptLinkPresentation(handle, value),
			$createLinkPresentationWatcher: (handle, providerHandle, resource) => extHost.$createLinkPresentationWatcher(handle, providerHandle, resource),
			$disposeLinkPresentationWatcher: handle => extHost.$disposeLinkPresentationWatcher(handle),
		};
		const mainThread = store.add(new MainThreadDataChannels(
			SingleProxyRPCProtocol(extHostProxy),
			store.add(new DataChannelService()),
			linkPresentationService,
		));
		const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThread));
		const extension = {
			...nullExtensionDescription,
			identifier: new ExtensionIdentifier('test.extension'),
			enabledApiProposals: ['linkPresentation'],
		};
		const onDidChangePresentation = store.add(new Emitter<void>());
		let presentation: vscode.LinkPresentationData = {
			kind: 'pullRequest',
			title: 'Initial pull request',
			status: { kind: 'open', label: 'Open' },
			isLoading: true,
		};
		let providerWatcherCreateCount = 0;
		let providerWatcherDisposeCount = 0;
		store.add(extHost.registerLinkPresentationProvider(extension, 'test.linkPresentations', {
			provideLinkPresentationWatcher: () => {
				providerWatcherCreateCount++;
				return {
					get presentation() { return presentation; },
					onDidChangePresentation: onDidChangePresentation.event,
					dispose: () => providerWatcherDisposeCount++,
				};
			},
		}));

		const resource = URI.parse('https://github.com/microsoft/vscode/pull/1');
		assert.strictEqual(linkPresentationService.getLinkPresentationRule(resource)?.id, 'test.linkPresentations');
		assert.strictEqual(linkPresentationService.getLinkPresentationRule(URI.parse('https://example.com/microsoft/vscode/pull/1')), undefined);

		const watcher = store.add(linkPresentationService.createLinkPresentationWatcher('test.linkPresentations', resource)!);
		const values: (ILinkPresentation | undefined)[] = [];
		store.add(autorun(reader => values.push(watcher.presentation.read(reader))));
		await Promise.resolve();
		await Promise.resolve();
		presentation = {
			kind: 'pullRequest',
			title: 'Updated pull request',
			status: { kind: 'merged', label: 'Merged' },
		};
		onDidChangePresentation.fire();

		const secondWatcher = store.add(linkPresentationService.createLinkPresentationWatcher('test.linkPresentations', resource)!);
		const secondInitialPresentation = secondWatcher.presentation.get();

		await configurationService.setUserConfiguration('test.richLinks.enabled', false);
		fireConfigurationChange(configurationService, 'test.richLinks.enabled');
		await configurationService.setUserConfiguration('test.richLinks.enabled', true);
		fireConfigurationChange(configurationService, 'test.richLinks.enabled');
		await Promise.resolve();
		await Promise.resolve();
		watcher.dispose();
		secondWatcher.dispose();
		linkPresentationService.dispose();

		assert.deepStrictEqual({
			values,
			acceptedRules,
			secondInitialPresentation,
			providerWatcherCreateCount,
			providerWatcherDisposeCount,
		}, {
			values: [
				undefined,
				{
					kind: 'pullRequest',
					title: 'Initial pull request',
					status: { kind: 'open', label: 'Open' },
					isLoading: true,
				},
				{
					kind: 'pullRequest',
					title: 'Updated pull request',
					status: { kind: 'merged', label: 'Merged' },
				},
				undefined,
				{
					kind: 'pullRequest',
					title: 'Updated pull request',
					status: { kind: 'merged', label: 'Merged' },
					isLoading: true,
				},
				{
					kind: 'pullRequest',
					title: 'Updated pull request',
					status: { kind: 'merged', label: 'Merged' },
				},
			],
			acceptedRules: [{
				id: 'test.linkPresentations',
				source: '^https:\\/\\/github\\.com\\/[^/]+\\/[^/]+\\/pull\\/[0-9]+$',
				flags: 'i',
				kind: 'pullRequest',
			}],
			secondInitialPresentation: {
				kind: 'pullRequest',
				title: 'Updated pull request',
				status: { kind: 'merged', label: 'Merged' },
			},
			providerWatcherCreateCount: 2,
			providerWatcherDisposeCount: 2,
		});
	});

	test('initializes watchers synchronously from rules and the last-data cache', () => {
		let watcherHandle: number | undefined;
		const mainThreadProxy: MainThreadDataChannelsShape = {
			$createLinkPresentationWatcher: handle => watcherHandle = handle,
			$disposeLinkPresentationWatcher: () => { },
			$registerLinkPresentationProvider: () => { },
			$unregisterLinkPresentationProvider: () => { },
			$acceptLinkPresentationProviderData: () => { },
			dispose: () => { },
		};
		const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThreadProxy));
		extHost.$acceptLinkPresentationRules([{
			id: 'test.pullRequests',
			source: '^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$',
			flags: 'i',
			kind: 'pullRequest',
		}]);
		const extension = {
			...nullExtensionDescription,
			enabledApiProposals: ['linkPresentation'],
		};
		const resource = URI.parse('https://github.com/microsoft/vscode/pull/1');

		const firstWatcher = store.add(extHost.createLinkPresentationWatcher(extension, 'test.pullRequests', resource));
		const ruleInitialPresentation = firstWatcher.presentation;
		if (watcherHandle === undefined) {
			throw new Error('Expected a watcher handle.');
		}
		extHost.$acceptLinkPresentation(watcherHandle, {
			kind: 'pullRequest',
			title: 'Cached pull request',
			status: { kind: 'open', label: 'Open' },
		});
		firstWatcher.dispose();
		const secondWatcher = store.add(extHost.createLinkPresentationWatcher(extension, 'test.pullRequests', resource));
		extHost.$acceptLinkPresentationRules([{
			id: 'test.pullRequests',
			source: '^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$',
			flags: 'i',
			kind: 'issue',
		}]);
		const changedKindWatcher = store.add(extHost.createLinkPresentationWatcher(extension, 'test.pullRequests', resource));

		assert.deepStrictEqual({
			ruleInitialPresentation,
			cachedInitialPresentation: secondWatcher.presentation,
			changedKindInitialPresentation: changedKindWatcher.presentation,
		}, {
			ruleInitialPresentation: {
				kind: 'pullRequest',
				isLoading: true,
			},
			cachedInitialPresentation: {
				kind: 'pullRequest',
				title: 'Cached pull request',
				status: { kind: 'open', label: 'Open' },
				isLoading: true,
			},
			changedKindInitialPresentation: {
				kind: 'issue',
				isLoading: true,
			},
		});
	});

	test('skips file link presentation providers', () => {
		const linkPresentationService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			new TestConfigurationService(),
			store.add(new TestStorageService()),
		));
		let watcherCreateCount = 0;
		store.add(linkPresentationService.registerLinkPresentationProvider({
			id: 'test.coreFiles',
			uriPattern: /^file:/,
			kind: 'file',
		}, {
			createLinkPresentationWatcher: () => {
				watcherCreateCount++;
				return {
					presentation: observableValue<ILinkPresentation | undefined>('filePresentation', { kind: 'file' }),
					dispose: () => { },
				};
			},
		}));
		store.add(linkPresentationService.declareExtensionLinkPresentationProvider('test.extension', {
			id: 'test.extensionFiles',
			uriPattern: '^https://example\\.com/file$',
			kind: 'file',
		}));

		const fileResource = URI.parse('file:///workspace/file.ts');
		const remoteFileResource = URI.parse('https://example.com/file');
		assert.deepStrictEqual({
			rules: linkPresentationService.linkPresentationRules,
			fileRule: linkPresentationService.getLinkPresentationRule(fileResource),
			remoteFileRule: linkPresentationService.getLinkPresentationRule(remoteFileResource),
			fileWatcher: linkPresentationService.createLinkPresentationWatcher('test.coreFiles', fileResource),
			remoteFileWatcher: linkPresentationService.createLinkPresentationWatcher('test.extensionFiles', remoteFileResource),
			watcherCreateCount,
		}, {
			rules: [],
			fileRule: undefined,
			remoteFileRule: undefined,
			fileWatcher: undefined,
			remoteFileWatcher: undefined,
			watcherCreateCount: 0,
		});
	});

	test('rejects presentations that disagree with the registered kind', () => {
		const linkPresentationService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			new TestConfigurationService(),
			store.add(new TestStorageService()),
		));
		const presentation = observableValue<ILinkPresentation | undefined>('presentation', {
			kind: 'issue',
			title: 'Wrong kind',
		});
		store.add(linkPresentationService.registerLinkPresentationProvider({
			id: 'test.pullRequests',
			uriPattern: /^https:\/\/example\.com\/pull\/[0-9]+$/,
			kind: 'pullRequest',
		}, {
			createLinkPresentationWatcher: () => ({
				presentation,
				dispose: () => { },
			}),
		}));
		const watcher = store.add(linkPresentationService.createLinkPresentationWatcher(
			'test.pullRequests',
			URI.parse('https://example.com/pull/1'),
		)!);
		const values: (ILinkPresentation | undefined)[] = [];
		store.add(autorun(reader => values.push(watcher.presentation.read(reader))));

		presentation.set({
			kind: 'pullRequest',
			title: 'Correct kind',
		}, undefined);

		assert.deepStrictEqual(values, [
			{
				kind: 'pullRequest',
				status: { kind: 'error', label: 'Not available' },
				tooltip: 'The link presentation provider failed to load.',
				ariaLabel: 'Link presentation is not available',
			},
			{
				kind: 'pullRequest',
				title: 'Correct kind',
			},
		]);
	});

	test('replaces a restored presentation when the provider returns the wrong kind', () => {
		const configurationService = new TestConfigurationService();
		const storageService = store.add(new TestStorageService());
		const resource = URI.parse('https://example.com/pull/1');
		const registration: ILinkPresentationProviderRegistration = {
			id: 'test.pullRequests',
			uriPattern: /^https:\/\/example\.com\/pull\/[0-9]+$/,
			kind: 'pullRequest',
		};
		const firstService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			configurationService,
			storageService,
		));
		store.add(firstService.registerLinkPresentationProvider(registration, {
			createLinkPresentationWatcher: () => ({
				presentation: observableValue<ILinkPresentation | undefined>('firstPresentation', {
					kind: 'pullRequest',
					title: 'Cached pull request',
				}),
				dispose: () => { },
			}),
		}));
		const firstWatcher = store.add(firstService.createLinkPresentationWatcher(registration.id, resource)!);
		firstWatcher.dispose();
		firstService.dispose();

		const restoredService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			configurationService,
			storageService,
		));
		store.add(restoredService.registerLinkPresentationProvider(registration, {
			createLinkPresentationWatcher: () => ({
				presentation: observableValue<ILinkPresentation | undefined>('wrongPresentation', {
					kind: 'issue',
					title: 'Wrong kind',
				}),
				dispose: () => { },
			}),
		}));
		const restoredWatcher = store.add(restoredService.createLinkPresentationWatcher(registration.id, resource)!);

		assert.deepStrictEqual(restoredWatcher.presentation.get(), {
			kind: 'pullRequest',
			status: { kind: 'error', label: 'Not available' },
			tooltip: 'The link presentation provider failed to load.',
			ariaLabel: 'Link presentation is not available',
		});
	});

	test('restores the shared cache after a service restart', () => {
		const configurationService = new TestConfigurationService({ 'test.richLinks.enabled': true });
		const storageService = store.add(new TestStorageService());
		const resource = URI.parse('https://github.com/microsoft/vscode/pull/1');
		const registration: ILinkPresentationProviderRegistration = {
			id: 'test.pullRequests',
			uriPattern: /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[0-9]+$/i,
			kind: 'pullRequest',
			enablement: 'test.richLinks.enabled',
		};
		const firstService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			configurationService,
			storageService,
		));
		const firstPresentation = observableValue<ILinkPresentation | undefined>('firstPresentation', {
			kind: 'pullRequest',
			title: 'Persisted pull request',
			status: { kind: 'open', label: 'Open' },
		});
		store.add(firstService.registerLinkPresentationProvider(registration, {
			createLinkPresentationWatcher: () => ({
				presentation: firstPresentation,
				dispose: () => { },
			}),
		}));
		const firstWatcher = store.add(firstService.createLinkPresentationWatcher(registration.id, resource)!);
		firstWatcher.dispose();
		firstService.dispose();

		const restoredService = store.add(new LinkPresentationService(
			new NullExtensionService(),
			new NullLogService(),
			configurationService,
			storageService,
		));
		const unresolvedPresentation = observableValue<ILinkPresentation | undefined>('unresolvedPresentation', undefined);
		store.add(restoredService.registerLinkPresentationProvider(registration, {
			createLinkPresentationWatcher: () => ({
				presentation: unresolvedPresentation,
				dispose: () => { },
			}),
		}));
		const restoredWatcher = store.add(restoredService.createLinkPresentationWatcher(registration.id, resource)!);

		assert.deepStrictEqual(restoredWatcher.presentation.get(), {
			kind: 'pullRequest',
			title: 'Persisted pull request',
			status: { kind: 'open', label: 'Open' },
			isLoading: true,
		});
		restoredWatcher.dispose();
		restoredService.dispose();
	});

	function fireConfigurationChange(configurationService: TestConfigurationService, setting: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section === setting;
			}
		});
	}
});
