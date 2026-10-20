/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { allowedMarkdownHtmlAttributes } from '../../../../../../base/browser/markdownRenderer.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OpenerService } from '../../../../../../editor/browser/services/openerService.js';
import { AGENT_HOST_LABEL_FORMATTER, agentHostAuthority, agentHostLabelFormatter, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { MarkedKatexSupport } from '../../../../markdown/browser/markedKatexSupport.js';
import { allowedChatMarkdownHtmlTags, ChatContentMarkdownRenderer, getChatMarkdownRenderOptions } from '../../../browser/widget/chatContentMarkdownRenderer.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ChatWorkspaceEditContentPart } from '../../../browser/widget/chatContentParts/chatWorkspaceEditContentPart.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IExportableChatData, parseChatImport, Response } from '../../../common/model/chatModel.js';

suite('ChatMarkdownRenderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let testRenderer: ChatContentMarkdownRenderer;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	setup(() => {
		instantiationService = store.add(workbenchInstantiationService(undefined, store));
		testRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	});

	suite('imported chat command links', () => {
		const commandId = 'test.chatImport';
		const commandUri = `command:${commandId}?${encodeURIComponent(JSON.stringify(['marker']))}`;
		const value = `[Details](${commandUri}) [website](https://example.com/)`;

		for (const isTrusted of [true, false, { enabledCommands: [commandId] }]) {
			for (const legacy of [true, false]) {
				test(`blocks imported command links (trust: ${JSON.stringify(isTrusted)}, legacy: ${legacy})`, () => {
					const markdown = { value, isTrusted };
					const data: IExportableChatData = {
						initialLocation: ChatAgentLocation.Chat,
						responderUsername: 'assistant',
						requests: [{
							requestId: 'request',
							message: 'hello',
							variableData: { variables: [] },
							response: legacy ? [markdown] : [{ kind: 'markdownContent', content: markdown }],
						}],
					};
					const imported = parseChatImport(JSON.stringify(data));
					const response = store.add(new Response(imported.requests[0].response!));
					const part = response.value[0];
					if (part.kind !== 'markdownContent') {
						assert.fail('Expected markdown content');
					}
					const result = store.add(testRenderer.render(part.content));

					assert.deepStrictEqual({
						links: Array.from(result.element.querySelectorAll('a'), link => link.dataset.href),
						text: result.element.textContent?.trim(),
					}, {
						links: ['https://example.com/'],
						text: 'Details website',
					});
				});
			}
		}

		test('trusted non-imported markdown still executes command links only on click', async () => {
			const executed = new DeferredPromise<void>();
			const executeCommand = sinon.stub().callsFake(() => executed.complete());
			instantiationService.stub(ICommandService, { executeCommand });
			instantiationService.stub(IOpenerService, instantiationService.createInstance(OpenerService));
			instantiationService.stub(IMarkdownRendererService, instantiationService.createInstance(MarkdownRendererService));
			const renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
			const result = store.add(renderer.render(new MarkdownString(value, { isTrusted: true })));
			const link = result.element.querySelector<HTMLAnchorElement>(`a[data-href^="command:"]`);
			assert.ok(link);
			assert.strictEqual(executeCommand.called, false);

			link.click();
			await executed.p;

			assert.deepStrictEqual(executeCommand.args, [[commandId, 'marker']]);
		});
	});

	test('workspace edits render canonical file links without trusting imported content', () => {
		const resource = URI.file('/workspace/example.ts');
		const cachedResourceData = {
			...resource.toJSON(),
			external: `${resource.toString()}) [Details](command:test.chatImport`,
		};
		const cachedResource = URI.revive(cachedResourceData);
		const oldResource = URI.file('/workspace/`[Details](https:example.com)`.ts');
		instantiationService.stub(IChatMarkdownAnchorService, store.add(new ChatMarkdownAnchorService()));
		const part = store.add(instantiationService.createInstance(ChatWorkspaceEditContentPart, {
			kind: 'workspaceEdit',
			edits: [
				{ newResource: cachedResource },
				{ oldResource },
				{ oldResource, newResource: cachedResource },
				{ newResource: URI.parse('command:test.chatImport') },
			],
		}, undefined!, testRenderer));

		assert.deepStrictEqual({
			links: Array.from(part.domNode.querySelectorAll('a'), link => link.dataset.href),
			fileWidgets: part.domNode.querySelectorAll('.chat-inline-anchor-widget').length,
		}, {
			links: [resource.toString(), resource.toString()],
			fileWidgets: 2,
		});
	});

	suite('link hovers', () => {
		let setupManagedHover: sinon.SinonSpy<Parameters<IHoverService['setupManagedHover']>, ReturnType<IHoverService['setupManagedHover']>>;

		setup(() => {
			setupManagedHover = sinon.spy(NullHoverService.setupManagedHover);
			instantiationService.stub(IHoverService, { ...NullHoverService, setupManagedHover });
			store.add(instantiationService.get(ILabelService).registerFormatter(AGENT_HOST_LABEL_FORMATTER));
			testRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
		});

		test('shows host paths for transformed and already mapped links without changing their targets', () => {
			const authority = agentHostAuthority('vscode-remote://wsl+Ubuntu');
			store.add(instantiationService.get(ILabelService).registerFormatter(agentHostLabelFormatter(authority, OperatingSystem.Linux)));
			const file = URI.file('/home/user/my project/a&b.ts').with({ fragment: 'L42,7' });
			const target = toAgentHostUri(file, authority).toString();
			const links = [
				{ href: '/home/user/my%20project/a&b.ts:42:7', transformUri: () => target },
				{ href: target, transformUri: undefined },
			];

			const actual = links.map(({ href, transformUri }) => {
				const result = store.add(testRenderer.render(new MarkdownString(`[file](${href})`), { transformUri }));
				const link = result.element.querySelector('a');
				return {
					hover: setupManagedHover.lastCall.args[2],
					target: link?.dataset.href,
					text: link?.textContent,
					nativeTitle: link?.title,
				};
			});

			assert.deepStrictEqual(actual, links.map(() => ({
				hover: '/home/user/my project/a&b.ts#L42,7',
				target,
				text: 'file',
				nativeTitle: '',
			})));
		});

		test('uses the remote host operating system for path formatting', () => {
			const labelService = instantiationService.get(ILabelService);
			store.add(labelService.registerFormatter(agentHostLabelFormatter('windows-host', OperatingSystem.Windows)));
			const target = toAgentHostUri(URI.file('C:/my project/file.ts'), 'windows-host').toString();
			store.add(testRenderer.render(new MarkdownString(`[file](${target})`)));

			assert.strictEqual(setupManagedHover.lastCall.args[2], 'C:\\my project\\file.ts');
		});

		test('preserves explicit titles and ordinary file, external, and command link behavior', () => {
			const target = toAgentHostUri(URI.file('/home/user/file.ts'), 'remote-host').toString();
			const file = URI.file('/my project/file.ts').with({ fragment: 'L7' });
			const markdown = new MarkdownString(`[custom](${target} "Custom title") [file](${file}) [web](https://example.com/) [command](command:example)`, { isTrusted: true });
			const result = store.add(testRenderer.render(markdown));

			assert.deepStrictEqual({
				hovers: setupManagedHover.getCalls().map(call => call.args[2]),
				targets: Array.from(result.element.querySelectorAll('a'), link => link.dataset.href),
			}, {
				hovers: ['Custom title', `${file.fsPath}#L7`, 'https://example.com/'],
				targets: [target, file.toString(), 'https://example.com/', 'command:example'],
			});
		});
	});

	test('simple', async () => {
		const md = new MarkdownString('a');
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.textContent);
	});

	test('plain text fast path preserves rendered markdown shape and single tildes', () => {
		const md = new MarkdownString('Hello, ~world~. This is plain.', { isTrusted: true, supportHtml: true, supportThemeIcons: true });
		const result = store.add(testRenderer.render(md));

		assert.deepStrictEqual({
			outerHTML: result.element.outerHTML,
			textContent: result.element.textContent,
		}, {
			outerHTML: '<div class="rendered-markdown"><p>Hello, ~world~. This is plain.</p></div>',
			textContent: 'Hello, ~world~. This is plain.',
		});
	});

	test('plain text fast path reuses target element', () => {
		const md = new MarkdownString('Hello, world.');
		const target = document.createElement('div');
		target.appendChild(document.createElement('span'));
		const result = store.add(testRenderer.render(md, undefined, target));

		assert.deepStrictEqual({
			sameElement: result.element === target,
			outerHTML: target.outerHTML,
		}, {
			sameElement: true,
			outerHTML: '<div class="rendered-markdown"><p>Hello, world.</p></div>',
		});
	});

	test('only renders strikethrough with double tildes', () => {
		const md = new MarkdownString('Keep ~single tildes~ but strike ~~double tildes~~.');
		const result = store.add(testRenderer.render(md, { markedOptions: { gfm: true } }));

		assert.deepStrictEqual({
			outerHTML: result.element.outerHTML,
			textContent: result.element.textContent,
		}, {
			outerHTML: '<div class="rendered-markdown"><p>Keep ~single tildes~ but strike <del>double tildes</del>.</p></div>',
			textContent: 'Keep ~single tildes~ but strike double tildes.',
		});
	});

	test('supportHtml with one-line markdown', async () => {
		const md = new MarkdownString('**hello**');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);

		const md2 = new MarkdownString('1. [_hello_](https://example.com) test **text**');
		md2.supportHtml = true;
		const result2 = store.add(testRenderer.render(md2));
		await assertSnapshot(result2.element.outerHTML);
	});

	test('invalid HTML', async () => {
		const md = new MarkdownString('1<canvas>2<details>3</details></canvas>4');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('invalid HTML with attributes', async () => {
		const md = new MarkdownString('1<details id="id1" style="display: none">2<details id="my id 2">3</details></details>4');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('valid HTML', async () => {
		const md = new MarkdownString(`
<h1>heading</h1>
<ul>
	<li>1</li>
	<li><b>hi</b></li>
</ul>
<pre><code>code here</code></pre>`);
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('mixed valid and invalid HTML', async () => {
		const md = new MarkdownString(`
<h1>heading</h1>
<details>
<ul>
	<li><span><details><i>1</i></details></span></li>
	<li><b>hi</b></li>
</ul>
</details>
<pre><canvas>canvas here</canvas></pre><details></details>`);
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('self-closing elements', async () => {
		{
			const md = new MarkdownString('<area><hr><br><input type="text" value="test">');
			md.supportHtml = true;
			const result = store.add(testRenderer.render(md));
			await assertSnapshot(result.element.outerHTML);
		}
		{
			const md = new MarkdownString('<area><hr><br><input type="checkbox">');
			md.supportHtml = true;
			const result = store.add(testRenderer.render(md));
			await assertSnapshot(result.element.outerHTML);
		}
	});

	test('html comments', async () => {
		const md = new MarkdownString('<!-- comment1 <div></div> --><div>content</div><!-- comment2 -->');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('CDATA', async () => {
		const md = new MarkdownString('<![CDATA[<div>content</div>]]>');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('remote images are disallowed', async () => {
		const md = new MarkdownString('<img src="http://disallowed.com/image.jpg">');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	suite('remote images', () => {
		const allowedSources = [
			'https://raw.githubusercontent.com/owner/repo/main/image.png',
			'https://private-user-images.githubusercontent.com/123/image.png?jwt=signature',
			'https://avatars.githubusercontent.com/u/123?v=4',
			'https://gist.github.com/assets/image.png',
			'https://github.com/user-attachments/assets/f5fe0721-ea46-4eb3-b0d4-aa96c0aaad30',
			'https://github.com:443/user-attachments/assets/image.png',
			'https://GITHUB.COM/user-attachments/assets/image.png',
		];
		const disallowedSources = [
			'https://example.com/image.png',
			'http://raw.githubusercontent.com/owner/repo/main/image.png',
			'http://github.com/user-attachments/assets/image.png',
			'https://github.localhost/user-attachments/assets/image.png',
			'https://github.com/owner/repo/blob/main/image.png?raw=true',
			'https://github.com/user-attachments/image.png',
			'https://github.com/user-attachments/assets-other/image.png',
			'https://github.com/User-attachments/assets/image.png',
			'https://gist.github.com/owner/id/image.png',
			'https://gist.github.com/assets-other/image.png',
			'https://raw.githubusercontent.com.evil.example/image.png',
			'https://evil.raw.githubusercontent.com/image.png',
			'https://github.com.evil.example/user-attachments/assets/image.png',
			'https://github.com@evil.example/user-attachments/assets/image.png',
			'https://user@github.com/user-attachments/assets/image.png',
			'https://user:password@github.com/user-attachments/assets/image.png',
			'https://github.com:8443/user-attachments/assets/image.png',
			'https://github.com./user-attachments/assets/image.png',
			'https://github.com/user-attachments/assets/../../../image.png',
			'https://github.com/user-attachments/assets/%2e%2e/%2e%2e/image.png',
			'https://github.com/user-attachments/assets/%252e%252e/%252e%252e/image.png',
			'https://github.com/user-attachments/assets/%5c..%5c..%5cimage.png',
			'https://github.com%2f.evil.example/user-attachments/assets/image.png',
			'https://github.com%5c@evil.example/user-attachments/assets/image.png',
			'https://example.com/image.png?url=https://github.com/user-attachments/assets/image.png',
			'//github.com/user-attachments/assets/image.png',
			'file://remote-host/share/image.png',
			'ftp://raw.githubusercontent.com/image.png',
		];

		for (const supportHtml of [false, true]) {
			for (const [allowed, sources] of [[true, allowedSources], [false, disallowedSources]] as const) {
				for (const source of sources) {
					test(`${allowed ? 'allows' : 'blocks'} ${supportHtml ? 'HTML' : 'Markdown'} image ${source}`, () => {
						const value = supportHtml ? `<img src="${source}" alt="Screenshot">` : `![Screenshot](${source})`;
						const result = store.add(testRenderer.render(new MarkdownString(value, { supportHtml })));

						assert.deepStrictEqual(
							Array.from(result.element.querySelectorAll<HTMLImageElement>('img[src]'), image => ({
								src: image.getAttribute('src'),
								alt: image.alt,
							})),
							allowed ? [{ src: URI.parse(source).toString(true), alt: 'Screenshot' }] : [],
						);
					});
				}
			}
		}

		test('caller options cannot override the remote image policy', () => {
			const policy = getChatMarkdownRenderOptions({
				sanitizerConfig: { remoteImageIsAllowed: () => true },
			}).sanitizerConfig!.remoteImageIsAllowed!;

			assert.deepStrictEqual(
				[...allowedSources, ...disallowedSources].map(source => policy(URI.parse(source))),
				[...allowedSources.map(() => true), ...disallowedSources.map(() => false)],
			);
		});

		test('preserves session-scoped agent host image eligibility', () => {
			const allowed = toAgentHostUri(URI.file('/images/allowed.png'), agentHostAuthority('local'));
			const blocked = toAgentHostUri(URI.file('/images/blocked.png'), agentHostAuthority('local'));
			const policy = getChatMarkdownRenderOptions({
				sanitizerConfig: { remoteImageIsAllowed: uri => uri.path === allowed.path },
			}).sanitizerConfig!.remoteImageIsAllowed!;
			const defaultPolicy = getChatMarkdownRenderOptions().sanitizerConfig!.remoteImageIsAllowed!;

			assert.deepStrictEqual({
				allowed: policy(allowed),
				blocked: policy(blocked),
				defaultBlocked: defaultPolicy(allowed),
				github: policy(URI.parse(allowedSources[0])),
				external: policy(URI.parse(disallowedSources[0])),
			}, {
				allowed: true,
				blocked: false,
				defaultBlocked: false,
				github: true,
				external: false,
			});
		});

		test('resolves relative images against their base URI before checking the allowlist', () => {
			const results = [
				{ source: 'image.png', base: 'https://raw.githubusercontent.com/owner/repo/main/readme.md' },
				{ source: 'image.png', base: 'https://example.com/readme.md' },
				{ source: '../../../image.png', base: 'https://github.com/user-attachments/assets/readme.md' },
			].map(({ source, base }) => {
				const markdown = new MarkdownString(`![Screenshot](${source})`);
				markdown.baseUri = URI.parse(base);
				return store.add(testRenderer.render(markdown)).element.querySelector('img')?.getAttribute('src');
			});

			assert.deepStrictEqual(results, [
				'https://raw.githubusercontent.com/owner/repo/main/image.png',
				undefined,
				undefined,
			]);
		});

		test('checks URI transformations and mappings before loading images', () => {
			const source = 'https://github.com/user-attachments/assets/image.png';
			const disallowed = 'https://example.com/image.png';
			const transformed = store.add(testRenderer.render(new MarkdownString(`![Screenshot](${source})`), {
				transformUri: () => disallowed,
			}));
			const mappedMarkdown = new MarkdownString(`![Screenshot](${source})`);
			mappedMarkdown.uris = { [source]: URI.parse(disallowed) };
			const mapped = store.add(testRenderer.render(mappedMarkdown));

			assert.deepStrictEqual(
				[transformed, mapped].map(result => result.element.querySelectorAll('img').length),
				[0, 0],
			);
		});

		test('strips alternate image-loading attributes and event handlers', () => {
			const source = 'https://github.com/user-attachments/assets/image.png';
			const markdown = new MarkdownString(`<picture><source srcset="https://example.com/source.png"><img src="${source}" srcset="https://example.com/image.png 2x" onerror="alert(1)" style="background-image: url(https://example.com/background.png)" alt="Screenshot"></picture>`, { supportHtml: true });
			const result = store.add(testRenderer.render(markdown));
			const image = result.element.querySelector('img');

			assert.deepStrictEqual({
				sourceCount: result.element.querySelectorAll('picture, source').length,
				attributes: image ? Array.from(image.attributes, attribute => attribute.name).sort() : [],
				alt: image?.alt,
			}, {
				sourceCount: 0,
				attributes: ['alt', 'src'],
				alt: 'Screenshot',
			});
		});

		test('keeps data images and local and remote extension host files working', () => {
			const data = new MarkdownString('![Screenshot](data:image/png;base64,iVBORw0KGgo=)');
			const local = new MarkdownString('![Screenshot](image.png)');
			local.baseUri = URI.file('/images/readme.md');
			const remoteFile = 'file:///images/image.png';
			const remote = new MarkdownString(`![Screenshot](${remoteFile})`);
			remote.uris = { [remoteFile]: URI.parse('vscode-remote://ssh-remote+host/images/image.png') };

			assert.deepStrictEqual(
				[data, local, remote].map(markdown => store.add(testRenderer.render(markdown)).element.querySelectorAll('img[src]').length),
				[1, 1, 1],
			);
		});
	});

	test('raw style elements are not allowed by the math sanitizer', () => {
		const md = new MarkdownString('<style>.example { background-image: none; }</style><div class="example">content</div>');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md, {
			sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
				allowedTags: allowedChatMarkdownHtmlTags,
				allowedAttributes: allowedMarkdownHtmlAttributes,
			}),
		}));

		assert.strictEqual(result.element.querySelector('style'), null);
	});

	test('code block ending at end of content does not leak body tag', async () => {
		const md = new MarkdownString('text\n```ts\nconst x = 1;\n```');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		const textContent = result.element.textContent;
		assert.ok(!textContent?.includes('</body>'), `Rendered text should not contain </body>, got: ${textContent}`);
	});

	test('fillInIncompleteTokens closes bare codespan when supportHtml is set', () => {
		// Regression: the chat content renderer wraps `supportHtml` markdown
		// in `<body>...</body>`, which produces a trailing html token. The
		// paragraph/codespan fixup in `fillInIncompleteTokens` must still
		// fire so streaming a partial backtick (e.g. the agent host
		// "Created isolated worktree for branch `xyz" announcement) does
		// not leave a bare ` in the DOM until the closing backtick arrives.
		const md = new MarkdownString('Created isolated worktree for branch `xyz', { supportHtml: true });
		const result = store.add(testRenderer.render(md, { fillInIncompleteTokens: true }));

		const codeEl = result.element.querySelector('code');
		assert.ok(codeEl, `Expected a <code> element in: ${result.element.outerHTML}`);
		assert.strictEqual(codeEl!.textContent, 'xyz');
		assert.ok(!result.element.textContent?.includes('`'), `Rendered text should not contain a bare backtick, got: ${result.element.textContent}`);
	});
});
