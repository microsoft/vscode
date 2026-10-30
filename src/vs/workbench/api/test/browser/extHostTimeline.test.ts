/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { CommandsConverter, ExtHostCommands, ArgumentProcessor } from '../../common/extHostCommands.js';
import { MainThreadTimelineShape } from '../../common/extHost.protocol.js';
import { ExtHostTimeline } from '../../common/extHostTimeline.js';
import { MarkdownString, ThemeColor, ThemeIcon, TimelineItem, TimelineTriggerKind as ApiTimelineTriggerKind } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { TimelineOptions, TimelineProviderDescriptor, TimelineTriggerKind, WorkspaceTimelineProviderDescriptor } from '../../../contrib/timeline/common/timeline.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';

suite('ExtHostTimeline', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const uri = URI.parse('file:///timeline.txt');
	const options: TimelineOptions = { cacheResults: true, triggerKind: TimelineTriggerKind.Automatic };
	const converter = new class extends mock<CommandsConverter>() { };
	const providerId = 'test-timeline';
	const providerLabel = 'Test Timeline';

	function createExtension(id: string): IExtensionDescription {
		return { ...nullExtensionDescription, identifier: new ExtensionIdentifier(id) };
	}

	function createTimeline() {
		let argumentProcessor!: ArgumentProcessor;
		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(processor: ArgumentProcessor): void {
				argumentProcessor = processor;
			}
		};
		const calls: unknown[][] = [];
		const registrations: unknown[][] = [];
		const proxy = new class extends mock<MainThreadTimelineShape>() {
			override $registerTimelineProvider(provider: TimelineProviderDescriptor): void {
				registrations.push(['timeline', provider]);
			}
			override $unregisterTimelineProvider(): void { }
			override $registerWorkspaceTimelineProvider(provider: WorkspaceTimelineProviderDescriptor): void {
				registrations.push(['workspaceTimeline', provider]);
			}
			override $unregisterWorkspaceTimelineProvider(): void { }
			override $emitTimelineChangeEvent(id: string, uris: UriComponents[] | undefined): void {
				calls.push(['change', id, uris?.map(uri => URI.revive(uri).toString())]);
			}
			override $emitWorkspaceTimelineChangeEvent(id: string): void {
				calls.push(['workspaceChange', id]);
			}
		};
		const timeline = new ExtHostTimeline(SingleProxyRPCProtocol(proxy), commands);
		return { timeline, calls, registrations, processArgument: (arg: unknown, extension: IExtensionDescription | undefined) => argumentProcessor.processArgument(arg, extension) };
	}

	function toContext(handle: string, source: string, uri: URI | undefined) {
		return { $mid: MarshalledId.TimelineActionContext, handle, source, uri };
	}

	test('registers providers with the id and label passed at registration', function () {
		const { timeline, registrations } = createTimeline();
		const extension = createExtension('test.timeline');
		store.add(timeline.registerTimelineProvider(providerId, providerLabel, ['file', 'git'], { provideTimeline: () => undefined }, extension.identifier, converter));
		store.add(timeline.registerWorkspaceTimelineProvider(providerId, providerLabel, { provideWorkspaceTimeline: () => undefined }, extension.identifier, converter));

		assert.deepStrictEqual(registrations, [
			['timeline', { id: providerId, label: providerLabel, scheme: ['file', 'git'] }],
			['workspaceTimeline', { id: providerId, label: providerLabel }],
		]);
	});

	test('disposes cached timeline items with their provider', async function () {
		const { timeline, processArgument } = createTimeline();
		const extension = createExtension('test.timeline');
		const item = new TimelineItem('first item', 1);
		const provider = {
			provideTimeline: () => ({ items: [item] }),
		};
		const registration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', provider, extension.identifier, converter));
		const result = await timeline.$getTimeline(providerId, uri, options, CancellationToken.None);
		assert.ok(result);
		const context = toContext(result.items[0].handle, providerId, uri);
		assert.strictEqual(processArgument(context, extension), item);

		registration.dispose();
		const replacement = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', provider, extension.identifier, converter));
		assert.strictEqual(processArgument(context, extension), undefined);
		replacement.dispose();
	});

	test('does not cache an in-flight timeline result after provider disposal', async function () {
		const { timeline, processArgument } = createTimeline();
		const extension = createExtension('test.timeline');
		const deferredResult = new DeferredPromise<{ items: TimelineItem[] }>();
		const provider = {
			provideTimeline: () => deferredResult.p,
		};
		const registration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', provider, extension.identifier, converter));
		const resultPromise = timeline.$getTimeline(providerId, uri, options, CancellationToken.None);

		registration.dispose();
		const replacement = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', {
			...provider,
			provideTimeline: () => ({ items: [] }),
		}, extension.identifier, converter));
		deferredResult.complete({ items: [new TimelineItem('stale item', 1)] });

		assert.strictEqual(await resultPromise, undefined);
		assert.strictEqual(processArgument(toContext(`${providerId}|1`, providerId, uri), extension), undefined);
		replacement.dispose();
	});

	test('passes the original items to the providing extension and read-only copies to other extensions', async function () {
		const { timeline, processArgument } = createTimeline();
		const owner = createExtension('test.owner');
		const first: vscode.TimelineItem = new TimelineItem('first item', 2);
		first.id = 'first';
		first.description = 'description';
		first.contextValue = 'commit';
		first.resourceUri = URI.parse('git:/timeline.txt?first');
		first.command = { title: 'Open', command: 'test.open', arguments: [{ private: true }] };
		const second: vscode.TimelineItem = new TimelineItem('second item', 1);
		second.id = 'second';
		const provider = { provideTimeline: () => ({ items: [first, second] }) };
		const toInternal = new class extends mock<CommandsConverter>() {
			override toInternal(command: vscode.Command) {
				return { id: command.command, title: command.title };
			}
		};
		const registration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', provider, owner.identifier, toInternal));
		const result = await timeline.$getTimeline(providerId, uri, options, CancellationToken.None);
		const [firstContext, secondContext] = result!.items.map(item => toContext(item.handle, providerId, uri));

		const copy = processArgument(firstContext, createExtension('test.other')) as vscode.TimelineItem;
		const copies = processArgument([firstContext, secondContext], createExtension('test.other')) as vscode.TimelineItem[];
		assert.deepStrictEqual({
			owner: processArgument(firstContext, owner) === first,
			ownerSelection: (processArgument([firstContext, secondContext], owner) as vscode.TimelineItem[]).every((item, index) => item === [first, second][index]),
			copy: { ...copy },
			copyIsFrozen: Object.isFrozen(copy) && copy !== first,
			copies: copies.map(item => item.label),
			withoutExtension: processArgument(firstContext, undefined),
			selectionWithoutExtension: processArgument([firstContext, secondContext], undefined),
		}, {
			owner: true,
			ownerSelection: true,
			copy: {
				label: 'first item',
				timestamp: 2,
				id: 'first',
				iconPath: undefined,
				description: 'description',
				tooltip: undefined,
				resourceUri: first.resourceUri,
				contextValue: 'commit',
				accessibilityInformation: undefined,
			},
			copyIsFrozen: true,
			copies: ['first item', 'second item'],
			withoutExtension: undefined,
			selectionWithoutExtension: undefined,
		});
		registration.dispose();
	});

	test('passes items created from a resource without a label', async function () {
		const { timeline, processArgument } = createTimeline();
		const resourceUri = URI.parse('git:/timeline.txt?ref');
		const item: vscode.TimelineItem = new TimelineItem(resourceUri, 1);
		const registration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', { provideTimeline: () => ({ items: [item] }) }, createExtension('test.owner').identifier, converter));
		const result = await timeline.$getTimeline(providerId, uri, options, CancellationToken.None);
		const copy = processArgument(toContext(result!.items[0].handle, providerId, uri), createExtension('test.other')) as vscode.TimelineItem;

		assert.deepStrictEqual({
			item: { label: item.label, resourceUri: item.resourceUri?.toString() },
			converted: { label: result!.items[0].label, resourceUri: result!.items[0].resourceUri?.toString() },
			copy: { label: copy.label, resourceUri: copy.resourceUri?.toString() },
		}, {
			item: { label: undefined, resourceUri: 'git:/timeline.txt?ref' },
			converted: { label: undefined, resourceUri: 'git:/timeline.txt?ref' },
			copy: { label: undefined, resourceUri: 'git:/timeline.txt?ref' },
		});
		registration.dispose();
	});

	test('changing a copy for another extension does not change the original item', async function () {
		const { timeline, processArgument } = createTimeline();
		const owner = createExtension('test.owner');
		const item: vscode.TimelineItem = new TimelineItem('item', 1);
		item.tooltip = new MarkdownString('tooltip');
		item.tooltip.isTrusted = { enabledCommands: ['test.command'] };
		item.accessibilityInformation = { label: 'label' };
		item.iconPath = new ThemeIcon('git-commit', new ThemeColor('color'));
		const registration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', { provideTimeline: () => ({ items: [item] }) }, owner.identifier, converter));
		const result = await timeline.$getTimeline(providerId, uri, options, CancellationToken.None);

		const copy = processArgument(toContext(result!.items[0].handle, providerId, uri), createExtension('test.other')) as vscode.TimelineItem;
		const tryChange = (change: () => void) => { try { change(); } catch { /* frozen */ } };
		tryChange(() => (copy.tooltip as vscode.MarkdownString).appendMarkdown(' changed'));
		tryChange(() => ((copy.tooltip as vscode.MarkdownString).isTrusted as { enabledCommands: string[] }).enabledCommands.push('other.command'));
		tryChange(() => (copy.accessibilityInformation as { label: string }).label = 'changed');
		tryChange(() => ((copy.iconPath as ThemeIcon).color as ThemeColor).id = 'changed');

		const tooltip = item.tooltip as vscode.MarkdownString;
		assert.deepStrictEqual({
			tooltip: tooltip.value,
			isTrusted: tooltip.isTrusted,
			accessibilityInformation: item.accessibilityInformation,
			color: (item.iconPath as ThemeIcon).color?.id,
			copiedTooltip: (copy.tooltip as vscode.MarkdownString).value,
			ownerIsFrozen: Object.isFrozen(item) || Object.isFrozen(item.accessibilityInformation) || Object.isFrozen(item.iconPath),
		}, {
			tooltip: 'tooltip',
			isTrusted: { enabledCommands: ['test.command'] },
			accessibilityInformation: { label: 'label' },
			color: 'color',
			copiedTooltip: 'tooltip changed',
			ownerIsFrozen: false,
		});
		registration.dispose();
	});

	test('requests timelines with public options and forwards change events', async function () {
		const { timeline, calls } = createTimeline();
		const extension = createExtension('test.timeline');
		const requests: vscode.TimelineOptions[] = [];
		const onDidChangeTimeline = store.add(new Emitter<vscode.Uri | vscode.Uri[] | undefined>());
		const provider = {
			onDidChangeTimeline: onDidChangeTimeline.event,
			provideTimeline: (_uri: vscode.Uri, options: vscode.TimelineOptions) => {
				requests.push(options);
				return { items: [new TimelineItem('item', 1)], cursor: 'next' };
			},
		};
		const registration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', provider, extension.identifier, converter));

		const result = await timeline.$getTimeline(providerId, uri, { cursor: 'start', limit: 10, triggerKind: TimelineTriggerKind.Invoke, cacheResults: true, resetCache: true }, CancellationToken.None);
		onDidChangeTimeline.fire(uri);
		onDidChangeTimeline.fire([uri, URI.parse('file:///other.txt')]);
		onDidChangeTimeline.fire(undefined);

		assert.deepStrictEqual({ requests, cursor: result?.cursor, calls }, {
			requests: [{ cursor: 'start', limit: 10, triggerKind: ApiTimelineTriggerKind.Invoke }],
			cursor: 'next',
			calls: [
				['change', providerId, ['file:///timeline.txt']],
				['change', providerId, ['file:///timeline.txt', 'file:///other.txt']],
				['change', providerId, undefined],
			],
		});
		registration.dispose();
	});

	test('workspace timeline providers share an id only with providers of the same extension', async function () {
		const { timeline, calls, processArgument } = createTimeline();
		const extension = createExtension('test.timeline');
		const item = new TimelineItem('workspace item', 1);
		const onDidChangeWorkspaceTimeline = store.add(new Emitter<void>());
		const workspaceRegistration = store.add(timeline.registerWorkspaceTimelineProvider(providerId, providerLabel, {
			onDidChangeWorkspaceTimeline: onDidChangeWorkspaceTimeline.event,
			provideWorkspaceTimeline: () => ({ items: [item] }),
		}, extension.identifier, converter));
		const fileRegistration = store.add(timeline.registerTimelineProvider(providerId, providerLabel, 'file', { provideTimeline: () => ({ items: [] }) }, extension.identifier, converter));

		const result = await timeline.$getTimeline(providerId, undefined, options, CancellationToken.None);
		onDidChangeWorkspaceTimeline.fire();

		assert.deepStrictEqual({
			workspaceItem: processArgument(toContext(result!.items[0].handle, providerId, undefined), extension) === item,
			fileItem: processArgument(toContext(result!.items[0].handle, providerId, uri), extension),
			calls,
		}, {
			workspaceItem: true,
			fileItem: undefined,
			calls: [['workspaceChange', providerId]],
		});
		assert.throws(() => timeline.registerWorkspaceTimelineProvider(providerId, providerLabel, { provideWorkspaceTimeline: () => undefined }, extension.identifier, converter));
		fileRegistration.dispose();
		assert.throws(() => timeline.registerTimelineProvider(providerId, providerLabel, 'file', { provideTimeline: () => undefined }, createExtension('test.other').identifier, converter));

		workspaceRegistration.dispose();
	});
});
