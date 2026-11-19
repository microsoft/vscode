/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { computeLinks } from '../../../../../../../../editor/common/languages/linkComputer.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../../../editor/common/core/ranges/offsetRange.js';
import { PositionOffsetTransformer } from '../../../../../../../../editor/common/core/text/positionToOffset.js';
import { LanguageFeaturesService } from '../../../../../../../../editor/common/services/languageFeaturesService.js';
import { getLinks } from '../../../../../../../../editor/contrib/links/browser/getLinks.js';
import { createTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../../platform/actions/common/actions.js';
import { NullLogService } from '../../../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { ChatInputSessionLinkDetector, ChatInputSessionLinkProvider, recoverSessionLinkMentions } from '../../../../../browser/widget/input/editor/chatInputSessionLinkProvider.js';
import { getInlineRequestAttachments } from '../../../../../common/attachments/chatInlineAttachments.js';
import { IChatRequestVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { ChatRequestDynamicVariablePart, ChatRequestTextPart } from '../../../../../common/requestParser/chatParserTypes.js';

suite('ChatInputSessionLinkProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sessionId = 'fd85cb8e-8954-4f79-b66b-b66979b73ca8';
	const internalLink = `agent-host-session://ahp-session/${sessionId}`;
	const externalPath = `agents/agent-host-session/ahp-session/${sessionId}`;

	async function detect(text: string, modelScheme = Schemas.vscodeChatInput) {
		const languageFeaturesService = new LanguageFeaturesService();
		store.add(languageFeaturesService.linkProvider.register({ language: '*', hasAccessToAllModels: true }, {
			provideLinks: model => ({ links: computeLinks(model) }),
		}));
		store.add(new ChatInputSessionLinkProvider(languageFeaturesService, new class extends mock<IProductService>() {
			override readonly urlProtocol = 'code-oss';
		}, store.add(new NullLogService())));
		const model = store.add(createTextModel(text, 'chatinput', undefined, URI.from({ scheme: modelScheme, path: '/input' })));
		const result = store.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
		return result.links.map(link => ({ text: model.getValueInRange(link.range), url: typeof link.url === 'string' ? link.url : link.url?.toString(true) }));
	}

	for (const protocol of ['vscode-insiders', 'vscode', 'code-oss']) {
		test(`opens ${protocol} session links through the internal opener`, async () => {
			const text = `${protocol}://${externalPath}`;
			assert.deepStrictEqual(await detect(text), [{ text, url: internalLink }]);
		});
	}

	test('supports both chat input schemes but not other editors', async () => {
		assert.deepStrictEqual(await Promise.all([
			detect(internalLink, Schemas.vscodeChatInput),
			detect(internalLink, Schemas.sessionsChatInput),
			detect(internalLink, Schemas.untitled),
		]), [
			[{ text: internalLink, url: internalLink }],
			[{ text: internalLink, url: internalLink }],
			[],
		]);
	});

	test('preserves chat, turn and connection routing', async () => {
		const text = `vscode-insiders://${externalPath}/chat/peer%252Fchat?connectionAuthority=remote&turn=turn-1`;
		assert.deepStrictEqual(await detect(text), [{
			text,
			url: `${internalLink}?chat=peer%2Fchat&connectionAuthority=remote&turn=turn-1`,
		}]);
	});

	test('excludes surrounding punctuation and preserves ordinary links and input text', async () => {
		const externalLink = `vscode-insiders://${externalPath}`;
		assert.deepStrictEqual(await detect(`See (${externalLink}), https://example.com.\n[Session](${internalLink})`), [
			{ text: externalLink, url: internalLink },
			{ text: 'https://example.com', url: 'https://example.com' },
			{ text: internalLink, url: internalLink },
		]);
	});

	for (const protocol of ['agent-host-session', 'vscode', 'vscode-insiders', 'code-oss']) {
		const sessionLink = protocol === 'agent-host-session' ? internalLink : `${protocol}://${externalPath}`;

		test(`preserves ordinary links containing ${protocol} session URLs`, async () => {
			const ordinaryLinks = [
				`https://example.com/?next=${sessionLink}`,
				`http://example.com/?next=${sessionLink}`,
				`file:///tmp/example?next=${sessionLink}`,
			];
			assert.deepStrictEqual(await detect([...ordinaryLinks, sessionLink].join(' ')), [
				...ordinaryLinks.map(text => ({ text, url: text })),
				{ text: sessionLink, url: internalLink },
			]);
		});

		test(`skips malformed ${protocol} links without losing valid session links`, async () => {
			const externalLink = `vscode://${externalPath}`;
			assert.deepStrictEqual(await detect([
				internalLink,
				`${sessionLink}?session=not-a-uri`,
				externalLink,
			].join('\n')), [
				{ text: internalLink, url: internalLink },
				{ text: externalLink, url: internalLink },
			]);
		});
	}

	test('ignores unrelated product URLs and incomplete session links', async () => {
		assert.deepStrictEqual(await detect([
			'vscode-insiders://settings/editor.fontSize',
			'vscode-insiders://agents/new',
			'vscode-insiders://agents/agent-host-session/ahp-session/',
			'agent-host-session://ahp-session/',
			'command://workbench.action.quit',
		].join('\n')), []);
	});

	test('recovers sent session links without changing the request or existing attachment references', () => {
		const externalLink = `vscode-insiders://${externalPath}`;
		const text = `See (${externalLink}),\r\n${internalLink} and #attachment:a.ts`;
		const fileStart = text.indexOf('#attachment:');
		const positions = new PositionOffsetTransformer(text);
		const fileUri = URI.file('/a.ts');
		const file: IChatRequestVariableEntry = { kind: 'file', id: 'sessionLink:5', name: 'a.ts', value: fileUri };
		const filePart = new ChatRequestDynamicVariablePart(new OffsetRange(fileStart, text.length), Range.fromPositions(positions.getPosition(fileStart), positions.getPosition(text.length)), text.slice(fileStart), file.id, undefined, file.value, undefined, undefined, true, false, undefined, true);
		const message = { text, parts: [new ChatRequestTextPart(new OffsetRange(0, fileStart), Range.fromPositions(positions.getPosition(0), positions.getPosition(fileStart)), text.slice(0, fileStart)), filePart] };
		const variables = [file];
		const result = recoverSessionLinkMentions(message, variables, new ChatInputSessionLinkDetector('code-oss', store.add(new NullLogService())));
		const attachments = getInlineRequestAttachments(result.message.parts, result.variables, text);
		assert.deepStrictEqual({
			text: result.message.text,
			originalParts: message.parts.length,
			originalVariables: variables.length,
			parts: [...attachments].map(([index, entry]) => ({
				text: result.message.parts[index].text,
				kind: entry.kind,
				value: URI.isUri(entry.value) ? entry.value.toString() : undefined,
			})),
		}, {
			text,
			originalParts: 2,
			originalVariables: 1,
			parts: [
				{ text: externalLink, kind: 'sessionLink', value: internalLink },
				{ text: internalLink, kind: 'sessionLink', value: internalLink },
				{ text: '#attachment:a.ts', kind: 'file', value: fileUri.toString() },
			],
		});
	});

	test('does not replace session links in code, authored links, images or unrelated URLs', () => {
		const text = [
			`\`${internalLink}\``,
			'```',
			internalLink,
			'```',
			`[Session](${internalLink}) ![Session](${internalLink}) <${internalLink}>`,
			`<a href="${internalLink}">Session</a>`,
			`<a href="https://example.com">${internalLink}</a> <code>${internalLink}</code>`,
			`https://example.com/?next=${internalLink}`,
			'',
			`[reference]: ${internalLink}`,
			'',
			`> [nested]: ${internalLink}`,
			'>',
			'> [nested]',
			'',
			'| Session |',
			'| --- |',
			`| \`${internalLink}\` |`,
		].join('\n');
		const positions = new PositionOffsetTransformer(text);
		const message = { text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), Range.fromPositions(positions.getPosition(0), positions.getPosition(text.length)), text)] };
		const result = recoverSessionLinkMentions(message, [], new ChatInputSessionLinkDetector('code-oss', store.add(new NullLogService())));
		assert.strictEqual(result.message, message);
	});

	test('makes the keyboard command discoverable when chat is enabled', async () => {
		await detect(internalLink);
		assert.deepStrictEqual(MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.filter(item => isIMenuItem(item) && item.command.id === 'editor.action.openLink')
			.map(item => item.when?.serialize()), ['chatIsEnabled']);
	});
});
