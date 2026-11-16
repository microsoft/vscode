/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { autorun, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { observeChatResourceExists } from '../../browser/chatResources/chatResourceExistence.js';
import { ChatResourceContributionEntries, IChatResourceContribution, IChatResourceSessionIds, resolveChatResourceTemplate } from '../../browser/chatResources/chatResourceContributions.js';
import { getShownChatResource } from '../../browser/chatResources/chatResourcesControl.js';
import { defaultChatEmbeddedResourceSize, getChatEmbeddedResourceHeight, IChatEmbeddedResourceSize, resizeChatEmbeddedResource } from '../../browser/chatResources/chatResourceSizing.js';

suite('ChatResources', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const noTextContent = upcastPartial<ITextModelService>({ canHandleResource: () => false });
	const extensions = upcastPartial<IExtensionService>({ onDidChangeExtensionsStatus: Event.None });

	test('a resource exists as its file system says, or always for a text content provider\'s scheme, which activates later', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('chat-status', store.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(URI.parse('chat-status:/status.md'), VSBuffer.fromString('# Status'));
		const textContentSchemes = new Set<string>();
		const activated = store.add(new Emitter<never[]>());
		const providers = {
			fileService,
			textModelService: upcastPartial<ITextModelService>({ canHandleResource: resource => textContentSchemes.has(resource.scheme) }),
			extensionService: upcastPartial<IExtensionService>({ onDidChangeExtensionsStatus: activated.event }),
		};
		const observe = (uri: string) => observeChatResourceExists(providers, URI.parse(uri), store.add(new DisposableStore()));
		const existing = observe('chat-status:/status.md');
		const missing = observe('chat-status:/missing.md');
		const appLink = observe('app-link:/a.cdp.link');
		await waitForState(existing, value => value);
		const beforeActivation = appLink.get();
		textContentSchemes.add('app-link');
		activated.fire([]);
		await waitForState(appLink, value => value);

		assert.deepStrictEqual({ existing: existing.get(), missing: missing.get(), beforeActivation, afterActivation: appLink.get() }, {
			existing: true, missing: false, beforeActivation: false, afterActivation: true,
		});
	});

	test('resolves resource templates with the chat\'s and the agent\'s session id', () => {
		const ids: IChatResourceSessionIds = { chatSessionId: 'chat 1', agentSessionId: 'cli-42' };
		assert.deepStrictEqual([
			resolveChatResourceTemplate('chat-todos:/${chatSessionId}.todo.json', ids)?.toString(true),
			resolveChatResourceTemplate('chat-todos:/${agentSessionId}.todo.json', ids)?.toString(true),
			resolveChatResourceTemplate('chat-todos:/${agentSessionId}.todo.json', { chatSessionId: 'chat 1', agentSessionId: undefined }),
			resolveChatResourceTemplate('chat-todos:/${chatSessionId}.todo.json', { chatSessionId: 'a#b?c', agentSessionId: undefined })?.path,
		], ['chat-todos:/chat 1.todo.json', 'chat-todos:/cli-42.todo.json', undefined, '/a#b?c.todo.json']);
	});

	test('lists a contributed resource while its file exists for the chat', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('chat-status', store.add(new InMemoryFileSystemProvider())));
		const contribution: IChatResourceContribution = { extensionId: new ExtensionIdentifier('pub.ext'), id: 'status', label: 'Status', icon: undefined, resource: 'chat-status:/${agentSessionId}.md' };
		const ids = observableValue<IChatResourceSessionIds | undefined>('ids', { chatSessionId: 'chat-1', agentSessionId: 'cli-42' });
		const entries = store.add(new ChatResourceContributionEntries(observableValue('contributions', [contribution]), ids, () => { }, fileService, noTextContent, extensions));
		const listed = () => entries.sections.get().flatMap(section => section.entries.map(entry => `${entry.id} ${entry.label} ${entry.resource?.toString()}`));
		// Like the pill that reads them, an observer keeps the entries and their file watchers alive.
		store.add(autorun(reader => entries.sections.read(reader)));

		const before = listed();
		await fileService.writeFile(URI.parse('chat-status:/cli-42.md'), VSBuffer.fromString('# Status'));
		await waitForState(entries.sections, sections => sections.length > 0);
		const created = listed();
		await fileService.del(URI.parse('chat-status:/cli-42.md'));
		await waitForState(entries.sections, sections => sections.length === 0);

		assert.deepStrictEqual({ before, created, deleted: listed() }, {
			before: [],
			created: ['contributed:pub.ext/status Status chat-status:/cli-42.md'],
			deleted: [],
		});
	});

	test('watches a resource whose file system provider registers later', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const contribution: IChatResourceContribution = { extensionId: new ExtensionIdentifier('pub.ext'), id: 'status', label: 'Status', icon: undefined, resource: 'chat-status:/${chatSessionId}.md' };
		const entries = store.add(new ChatResourceContributionEntries(observableValue('contributions', [contribution]), observableValue('ids', { chatSessionId: 'chat-1', agentSessionId: undefined }), () => { }, fileService, noTextContent, extensions));
		store.add(autorun(reader => entries.sections.read(reader)));
		const provider = store.add(new InMemoryFileSystemProvider());
		const watched: string[] = [];
		const watch = provider.watch.bind(provider);
		provider.watch = (resource, options) => {
			watched.push(resource.toString());
			return watch(resource, options);
		};

		store.add(fileService.registerProvider('chat-status', provider));
		await fileService.writeFile(URI.parse('chat-status:/chat-1.md'), VSBuffer.fromString('# Status'));
		await waitForState(entries.sections, sections => sections.length > 0);

		assert.deepStrictEqual(watched, ['chat-status:/chat-1.md']);
	});

	suite('embedded size', () => {
		const automatic = (maxAutomaticHeight: number): IChatEmbeddedResourceSize => ({ fixedHeight: undefined, maxAutomaticHeight });

		test('follows the content height up to the maximum, within the available space', () => {
			assert.deepStrictEqual([
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 200, 1000),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 600, 1000),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 600, 250),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 10, 1000),
				getChatEmbeddedResourceHeight({ fixedHeight: 500, maxAutomaticHeight: 320 }, 100, 1000),
			], [200, 320, 250, 40, 500]);
		});

		test('leaves the transcript its room even below the minimum height', () => {
			assert.deepStrictEqual([
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 10, 24),
				getChatEmbeddedResourceHeight(defaultChatEmbeddedResourceSize, 200, -5),
			], [24, 0]);
		});

		test('dragging to another height fixes it', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 200, 260, 200), { fixedHeight: 260, maxAutomaticHeight: 320 });
		});

		test('dragging back to the automatic height follows the content again', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource({ fixedHeight: 100, maxAutomaticHeight: 320 }, 320, 315, 600), automatic(320));
		});

		test('dragging to the content height follows it and remembers it as the maximum', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 320, 605, 600), automatic(600));
		});

		test('the remembered maximum is never below the default', () => {
			assert.deepStrictEqual(resizeChatEmbeddedResource(automatic(600), 200, 205, 200), automatic(320));
		});

		test('heights are clamped', () => {
			assert.deepStrictEqual([
				resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 200, 5, undefined),
				resizeChatEmbeddedResource(defaultChatEmbeddedResourceSize, 200, 5000, undefined),
			], [{ fixedHeight: 40, maxAutomaticHeight: 320 }, { fixedHeight: 1000, maxAutomaticHeight: 320 }]);
		});
	});

	test('an area shows its first resource until the user chooses, then only the chosen one', () => {
		const resources = [{ id: 'todos' }, { id: 'plan' }];
		assert.deepStrictEqual([
			getShownChatResource(resources, undefined)?.id,
			getShownChatResource(resources, 'plan')?.id,
			getShownChatResource(resources, null)?.id,
			// The chosen resource left the area, for example because the user showed it at the top: no other one takes its place.
			getShownChatResource(resources, 'notes')?.id,
		], ['todos', 'plan', undefined, undefined]);
	});
});
