/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { renderFileAnchor, renderFileWidgets } from '../../../../browser/widget/chatContentParts/chatInlineAnchorWidget.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { Disposable, DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { ChatQueryTitlePart } from '../../../../browser/widget/chatContentParts/chatConfirmationWidget.js';
import { getChatMarkdownRenderOptions } from '../../../../browser/widget/chatContentMarkdownRenderer.js';
import { ChatPetAchievementId, ChatPetAchievementIds } from '../../../../browser/chatPetAchievements.js';
import { IChatPetService } from '../../../../browser/chatPetService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { rewriteAgentHostLinkTarget } from '../../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

suite('ChatInlineAnchorWidget Metadata Validation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let mockAnchorService: IChatMarkdownAnchorService;
	let attemptedUnlocks: ChatPetAchievementId[];

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, store);

		// Mock the anchor service
		mockAnchorService = {
			_serviceBrand: undefined,
			register: () => ({ dispose: () => { } }),
			lastFocusedAnchor: undefined
		};

		instantiationService.stub(IChatMarkdownAnchorService, mockAnchorService);
		attemptedUnlocks = [];
		instantiationService.stub(IChatPetService, new class extends mock<IChatPetService>() {
			override unlockAchievement(id: ChatPetAchievementId): boolean {
				attemptedUnlocks.push(id);
				return true;
			}
		}());
	});

	function createTestElement(linkText: string, href: string = 'file:///test.txt'): HTMLElement {
		const container = mainWindow.document.createElement('div');
		const anchor = mainWindow.document.createElement('a');
		anchor.textContent = linkText;
		anchor.setAttribute('data-href', href);
		container.appendChild(anchor);
		return container;
	}

	test('renders widget for link with vscodeLinkType query parameter', () => {
		const element = createTestElement('mySkill', 'file:///test.txt?vscodeLinkType=skill');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for link with vscodeLinkType query parameter');
	});

	test('renders widget for empty link text', () => {
		const element = createTestElement('');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for empty link text');
	});

	test('does not register duplicate widgets when an anchor is rendered again', () => {
		let registrations = 0;
		mockAnchorService.register = () => {
			registrations++;
			return Disposable.None;
		};
		const element = createTestElement('Open Report', 'file:///report.md?vscodeLinkType=markdown-preview');
		const anchor = element.querySelector('a')!;

		const rendered = renderFileAnchor(anchor, instantiationService, mockAnchorService, disposables);
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);
		const alreadyRendered = renderFileAnchor(anchor, instantiationService, mockAnchorService, disposables, { linkTypes: ['markdown-preview'] });

		assert.deepStrictEqual({ rendered, alreadyRendered, registrations, label: anchor.textContent }, {
			rendered: true,
			alreadyRendered: true,
			registrations: 1,
			label: 'Open Report',
		});
	});

	for (const { href, rendered } of [
		{ href: 'file:///report.md', rendered: false },
		{ href: 'file:///report.md?view=full', rendered: false },
		{ href: 'file:///report.md?vscodeLinkType=file', rendered: false },
		{ href: 'file:///report.md?vscodeLinkType=markdown-preview', rendered: true },
		{ href: 'file:///report.md?vscode%4CinkType=markdown-preview', rendered: true },
	]) {
		test(`filters single-anchor metadata for ${href}`, () => {
			const element = createTestElement('Open Report', href);
			const anchor = element.querySelector('a')!;

			assert.strictEqual(renderFileAnchor(anchor, instantiationService, mockAnchorService, disposables, { linkTypes: ['markdown-preview'] }), rendered);
		});
	}

	for (const authority of ['local', 'remote-host']) {
		for (const [linkType, editorOverride] of [
			['markdown-preview', 'vscode.markdown.preview.editor'],
			['file', undefined],
		]) {
			test(`opens ${linkType} links with the expected editor on ${authority}`, async () => {
				const resource = URI.file('/session/diagnostics/sandbox-policy.md');
				const link = resource.with({ query: `vscodeLinkType=${linkType}` });
				const element = createTestElement('Open Sandbox Policy', rewriteAgentHostLinkTarget(link.toString(), authority));
				const opened = new DeferredPromise<Parameters<IOpenerService['open']>>();
				instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
					override async open(...args: Parameters<IOpenerService['open']>): Promise<boolean> {
						opened.complete(args);
						return true;
					}
				}());
				renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

				element.querySelector<HTMLElement>('.chat-inline-anchor-widget')?.click();

				const [openedResource, options] = await opened.p;
				assert.deepStrictEqual({
					resource: openedResource.toString(),
					options,
					hasLinkStyle: element.querySelector('.chat-inline-anchor-widget')?.classList.contains('chat-markdown-preview-link'),
				}, {
					resource: rewriteAgentHostLinkTarget(resource.toString(), authority),
					options: {
						fromUserGesture: true,
						editorOptions: { override: editorOverride, selection: undefined },
					},
					hasLinkStyle: linkType === 'markdown-preview',
				});
				await timeout(0);
			});
		}
	}

	test('uses a custom resource opener when provided', async () => {
		const resource = URI.file('/workspace/package.json');
		const element = createTestElement('', resource.toString());
		const opened = new DeferredPromise<URI>();
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables, {
			openResource: async resource => {
				opened.complete(resource);
				return true;
			},
		});

		element.querySelector<HTMLElement>('.chat-inline-anchor-widget')?.click();

		assert.strictEqual((await opened.p).toString(), resource.toString());
		await timeout(0);
		assert.deepStrictEqual(attemptedUnlocks, [ChatPetAchievementIds.ChatReferenceOpened]);
	});

	test('wraps the resource opener in trackOpen', async () => {
		const resource = URI.file('/workspace/package.json');
		const element = createTestElement('', resource.toString());
		const calls: string[] = [];
		const tracked = new DeferredPromise<void>();
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables, {
			openResource: async () => {
				calls.push('open');
				return true;
			},
			trackOpen: async open => {
				calls.push('before');
				await open();
				calls.push('after');
				tracked.complete();
			},
		});

		element.querySelector<HTMLElement>('.chat-inline-anchor-widget')?.click();
		await tracked.p;

		assert.deepStrictEqual(calls, ['before', 'open', 'after']);
	});

	test('trackOpen observes a failing resource opener', async () => {
		const resource = URI.file('/workspace/package.json');
		const element = createTestElement('', resource.toString());
		const error = new Error('cannot open');
		const failure = new DeferredPromise<unknown>();
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables, {
			openResource: () => Promise.reject(error),
			trackOpen: async open => {
				try {
					await open();
					failure.complete(undefined);
				} catch (e) {
					failure.complete(e);
				}
			},
		});

		element.querySelector<HTMLElement>('.chat-inline-anchor-widget')?.click();

		assert.strictEqual(await failure.p, error);
		assert.deepStrictEqual(attemptedUnlocks, []);
	});

	test('renders widget for empty vscode-agent-host link in chat query title', () => {
		const container = mainWindow.document.createElement('div');
		const titlePart = disposables.add(instantiationService.createInstance(
			ChatQueryTitlePart,
			container,
			new MarkdownString('Read [](vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0), lines 1 to 2'),
			undefined,
		));
		titlePart.setOptions({ markdownRenderOptions: getChatMarkdownRenderOptions(), renderFileWidgets: true });

		const widget = container.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for empty vscode-agent-host link in chat query title');
		assert.strictEqual(widget.querySelector('.icon-label')?.textContent, 'foo.ts');
	});

	test('renders widget for vscodeLinkType=file', () => {
		const element = createTestElement('document.txt', 'file:///path/to/document.txt?vscodeLinkType=file');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for vscodeLinkType=file');
	});

	test('does not render widget for link without vscodeLinkType query parameter', () => {
		const element = createTestElement('regular link text', 'file:///test.txt');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for link without vscodeLinkType query parameter');
	});

	test('does not render widget when URI scheme is missing', () => {
		const element = createTestElement('mySkill', ''); // Empty href
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered when URI scheme is missing');
	});

	test('renders widget with various vscodeLinkType values', () => {
		const element = createTestElement('customName', 'file:///test.txt?vscodeLinkType=custom');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered for any vscodeLinkType value');
	});

	test('handles vscodeLinkType with other query parameters', () => {
		const element = createTestElement('skillName', 'file:///test.txt?other=value&vscodeLinkType=skill&another=param');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered when vscodeLinkType is among multiple query parameters');
	});

	test('handles multiple links in same element', () => {
		const container = mainWindow.document.createElement('div');

		// Add link with vscodeLinkType query parameter
		const validAnchor = mainWindow.document.createElement('a');
		validAnchor.textContent = 'validSkill';
		validAnchor.setAttribute('data-href', 'file:///valid.txt?vscodeLinkType=skill');
		container.appendChild(validAnchor);

		// Add link without vscodeLinkType query parameter
		const invalidAnchor = mainWindow.document.createElement('a');
		invalidAnchor.textContent = 'regular text';
		invalidAnchor.setAttribute('data-href', 'file:///invalid.txt');
		container.appendChild(invalidAnchor);

		// Add empty link text
		const emptyAnchor = mainWindow.document.createElement('a');
		emptyAnchor.textContent = '';
		emptyAnchor.setAttribute('data-href', 'file:///empty.txt');
		container.appendChild(emptyAnchor);

		renderFileWidgets(container, instantiationService, mockAnchorService, disposables);

		const widgets = container.querySelectorAll('.chat-inline-anchor-widget');
		assert.strictEqual(widgets.length, 2, 'Should render widgets for link with vscodeLinkType and empty link text only');
	});

	test('uses link text as fileName in metadata', () => {
		const element = createTestElement('myCustomFileName', 'file:///test.txt?vscodeLinkType=skill');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(widget, 'Widget should be rendered');
		// The link text becomes the fileName which is used as the label
		const labelElement = widget?.querySelector('.icon-label');
		assert.ok(labelElement?.textContent?.includes('myCustomFileName'), 'Label should contain the link text as fileName');
	});

	test('does not render widget for malformed URI', () => {
		const element = createTestElement('mySkill', '://malformed-uri-without-scheme');
		renderFileWidgets(element, instantiationService, mockAnchorService, disposables);

		const widget = element.querySelector('.chat-inline-anchor-widget');
		assert.ok(!widget, 'Widget should not be rendered for malformed URI');
	});
});
