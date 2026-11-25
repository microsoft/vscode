/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64 } from '../../../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { createFileDataTransferItem, createStringDataTransferItem, IDataTransferFile, VSDataTransfer } from '../../../../../../../../base/common/dataTransfer.js';
import { Mimes } from '../../../../../../../../base/common/mime.js';
import { Schemas } from '../../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../../../../editor/common/core/range.js';
import { DocumentPasteTriggerKind, ICustomEdit } from '../../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../../../editor/common/services/model.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../../../../platform/environment/common/environment.js';
import { IExtensionDescription } from '../../../../../../../../platform/extensions/common/extensions.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../../../../platform/files/common/files.js';
import { ILogService, NullLogService } from '../../../../../../../../platform/log/common/log.js';
import { IExtensionService } from '../../../../../../../services/extensions/common/extensions.js';
import { IChatPasteTarget, IChatPasteTargetService } from '../../../../../browser/chat.js';
import { IChatUserImageAttachmentEvent, IChatUserImageAttachmentService } from '../../../../../browser/attachments/chatUserImageAttachments.js';
import { IChatSessionsService } from '../../../../../common/chatSessionsService.js';
import { CHAT_ATTACHMENT_MIME_TYPE, createPastedTextArtifact, getGitHubIssueOrPullRequestAttachments, getPastedImageName, PasteImageProvider, pastedTextArtifactDefaultMinLength, PasteTextProvider } from '../../../../../browser/widget/input/editor/chatPasteProviders.js';
import { ChatPasteAttachmentMetadata, IChatRequestVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { isSupportedChatFileScheme } from '../../../../../common/constants.js';
import { ChatResponseResource } from '../../../../../common/model/chatModel.js';

suite('Chat Paste Providers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not offer an opened artifact back as attachable context', () => {
		// Opening an artifact makes it the active editor; offering it as context
		// would re-attach text the attachment already carries.
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
			override getContentProviderSchemes(): string[] { return []; }
		});

		assert.strictEqual(
			instantiationService.invokeFunction(accessor => isSupportedChatFileScheme(accessor, ChatResponseResource.scheme)),
			false);
	});

	test('names pasted images after their file and keeps the names unique', () => {
		// Mirrors toVSDataTransfer, which parses the native path of a pasted file into the uri
		const fromDisk: IDataTransferFile = { id: '1', name: 'diagram #1.png', uri: URI.parse('C:\\Screenshots\\diagram #1.png'), data: async () => new Uint8Array() };
		const rawBitmap: IDataTransferFile = { id: '2', name: 'image.png', uri: undefined, data: async () => new Uint8Array() };
		assert.deepStrictEqual({
			fromFile: getPastedImageName(fromDisk, []),
			fromFileTaken: getPastedImageName(fromDisk, ['diagram #1.png', 'diagram #1 2.png']),
			rawBitmap: getPastedImageName(rawBitmap, []),
			rawBitmapTaken: getPastedImageName(rawBitmap, ['Pasted Image']),
		}, {
			fromFile: 'diagram #1.png',
			fromFileTaken: 'diagram #1 3.png',
			rawBitmap: 'Pasted Image',
			rawBitmapTaken: 'Pasted Image 2',
		});
	});

	test('creates sequential artifacts only for long pasted text', () => {
		const longText = `${'x'.repeat(10000)}\n`.repeat(10);
		const first = createPastedTextArtifact(longText, []);
		assert.ok(first);
		const second = createPastedTextArtifact(`${longText}\nsecond line`, [first.attachment]);
		assert.ok(second);

		assert.deepStrictEqual({
			belowLengthThreshold: createPastedTextArtifact(`${'x'.repeat(100)}\n`.repeat(10), []),
			respectsConfiguredThreshold: !!createPastedTextArtifact(`${'x'.repeat(10)}\n`.repeat(10), [], { minLength: 100 }),
			first: {
				name: first.attachment.name,
				referenceText: first.referenceText,
				codeIsPreserved: first.attachment.code === longText,
				language: first.attachment.language,
				fileName: first.attachment.fileName,
				pastedLines: first.attachment.pastedLines,
				metadataKind: first.attachment._meta?.[ChatPasteAttachmentMetadata.Kind],
				isTextArtifact: first.attachment._meta?.[ChatPasteAttachmentMetadata.TextArtifact],
			},
			second: {
				name: second.attachment.name,
				referenceText: second.referenceText,
				pastedLines: second.attachment.pastedLines,
			},
		}, {
			belowLengthThreshold: undefined,
			respectsConfiguredThreshold: true,
			first: {
				name: 'Pasted text #1',
				referenceText: '#attachment:Pasted text #1',
				codeIsPreserved: true,
				language: 'plaintext',
				fileName: 'Pasted text #1',
				pastedLines: '11 lines',
				metadataKind: 'paste',
				isTextArtifact: true,
			},
			second: {
				name: 'Pasted text #2',
				referenceText: '#attachment:Pasted text #2',
				pastedLines: '12 lines',
			},
		});
	});

	test('creates pasted text artifacts based on character count regardless of line count', () => {
		const threshold = pastedTextArtifactDefaultMinLength;
		const twoLines = `${'x'.repeat(threshold)}\nsecond line`;

		assert.deepStrictEqual({
			belowThreshold: createPastedTextArtifact('x'.repeat(threshold - 1), []),
			atThreshold: createPastedTextArtifact('x'.repeat(threshold), [])?.attachment.pastedLines,
			aboveThreshold: createPastedTextArtifact('x'.repeat(threshold + 1), [])?.attachment.pastedLines,
			twoLines: createPastedTextArtifact(twoLines, [])?.attachment.pastedLines,
			customThreshold: createPastedTextArtifact('abc', [], { minLength: 2 })?.attachment.pastedLines,
			belowCustomThreshold: createPastedTextArtifact('a', [], { minLength: 2 }),
			highThreshold: createPastedTextArtifact(twoLines, [], { minLength: Number.MAX_SAFE_INTEGER }),
			zeroThreshold: createPastedTextArtifact('x', [], { minLength: 0 })?.attachment.pastedLines,
			empty: createPastedTextArtifact('', [], { minLength: 0 }),
			whitespaceOnly: createPastedTextArtifact(' \t\r\n', [], { minLength: 0 }),
			trimmedLength: createPastedTextArtifact(' x ', [], { minLength: 2 }),
		}, {
			belowThreshold: undefined,
			atThreshold: '1 line',
			aboveThreshold: '1 line',
			twoLines: '2 lines',
			customThreshold: '1 line',
			belowCustomThreshold: undefined,
			highThreshold: undefined,
			zeroThreshold: '1 line',
			empty: undefined,
			whitespaceOnly: undefined,
			trimmedLength: undefined,
		});
	});

	test('attaches pasted GitHub issue and pull request URLs while preserving prompt text', async () => {
		const attachments: IChatRequestVariableEntry[] = [];
		const target: IChatPasteTarget = {
			sessionResource: URI.parse('chat-session:/test'),
			get attachments() { return attachments; },
			get inlineReferences() { return []; },
			addAttachments: entries => attachments.push(...entries),
			removeAttachments: ids => {
				for (const id of ids) {
					const index = attachments.findIndex(attachment => attachment.id === id);
					if (index >= 0) {
						attachments.splice(index, 1);
					}
				}
			},
			addInlineAttachment: () => { },
			addInlineReference: () => { },
			isTerminalCommandPaste: () => false,
		};
		const modelUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'github-paste-test' });
		const pasteTargetService = new class extends mock<IChatPasteTargetService>() {
			override getTarget(uri: URI): IChatPasteTarget | undefined {
				return uri === modelUri ? target : undefined;
			}
		};
		const provider = new PasteTextProvider(
			pasteTargetService,
			new class extends mock<IModelService>() { },
			new class extends mock<ILogService>() { },
			new class extends mock<IConfigurationService>() {
				override getValue<T>(): T { return pastedTextArtifactDefaultMinLength as T; }
			},
		);
		const model = upcastPartial<ITextModel>({ uri: modelUri });
		const text = 'Fix https://github.com/microsoft/vscode/issues/334548 and review https://www.github.com/microsoft/vscode/pull/334544#discussion.';
		const transfer = new VSDataTransfer();
		transfer.append(Mimes.text, createStringDataTransferItem(text));

		const session = await provider.provideDocumentPasteEdits(model, [new Range(1, 1, 1, 1)], transfer, { triggerKind: DocumentPasteTriggerKind.Automatic }, CancellationToken.None);
		const edit = session?.edits[0];
		const customEdit = edit?.additionalEdit?.edits[0] as ICustomEdit | undefined;
		await customEdit?.redo();
		const attached = attachments.map(attachment => ({
			id: attachment.id,
			kind: attachment.kind,
			name: attachment.name,
			icon: attachment.icon?.id,
			value: attachment.value,
		}));
		await customEdit?.undo();

		assert.deepStrictEqual({
			insertText: edit?.insertText,
			title: edit?.title,
			attached,
			attachmentsAfterUndo: attachments,
			parsedInvalidLinks: [
				'https://github.com/microsoft/vscode/discussions/1',
				'https://github.com/microsoft/vscode/issues/333845-not-an-issue',
				'https://github.com/microsoft/vscode/pull/123invalid',
				'https://github.com/microsoft/vscode/pull/123_invalid',
			].flatMap(link => getGitHubIssueOrPullRequestAttachments(link)),
		}, {
			insertText: text,
			title: 'Paste GitHub Context',
			attached: [
				{
					id: 'github-context:https://github.com/microsoft/vscode/issues/334548',
					kind: 'generic',
					name: 'microsoft/vscode#334548',
					icon: 'issues',
					value: 'GitHub context: https://github.com/microsoft/vscode/issues/334548',
				},
				{
					id: 'github-context:https://github.com/microsoft/vscode/pull/334544',
					kind: 'generic',
					name: 'microsoft/vscode#334544',
					icon: 'git-pull-request',
					value: 'GitHub context: https://github.com/microsoft/vscode/pull/334544',
				},
			],
			attachmentsAfterUndo: [],
			parsedInvalidLinks: [],
		});
	});

	test('reports the images that a paste attaches once, not when an undo and redo put them back', async () => {
		const attachments: IChatRequestVariableEntry[] = [];
		const target: IChatPasteTarget = {
			sessionResource: URI.parse('chat-session:/test'),
			get attachments() { return attachments; },
			get inlineReferences() { return []; },
			addAttachments: entries => attachments.push(...entries),
			removeAttachments: ids => attachments.splice(0, attachments.length, ...attachments.filter(attachment => !ids.includes(attachment.id))),
			addInlineAttachment: () => { },
			addInlineReference: () => { },
			isTerminalCommandPaste: () => false,
		};
		const modelUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'image-paste-test' });
		const pasteTargetService = new class extends mock<IChatPasteTargetService>() {
			override getTarget(uri: URI): IChatPasteTarget | undefined {
				return uri === modelUri ? target : undefined;
			}
		};
		const events: IChatUserImageAttachmentEvent[] = [];
		const provider = new PasteImageProvider(
			pasteTargetService,
			new class extends mock<IExtensionService>() {
				override readonly extensions = [upcastPartial<IExtensionDescription>({ enabledApiProposals: ['chatReferenceBinaryData'] })];
			},
			new class extends mock<IChatUserImageAttachmentService>() {
				override didAttachImages(event: IChatUserImageAttachmentEvent): void { events.push(event); }
			},
			new class extends mock<IFileService>() {
				override async exists(): Promise<boolean> { return true; }
				override async resolve(): Promise<IFileStatWithMetadata> { return upcastPartial<IFileStatWithMetadata>({ children: [] }); }
				override async writeFile(): Promise<IFileStatWithMetadata> { return upcastPartial<IFileStatWithMetadata>({}); }
			},
			new class extends mock<IEnvironmentService>() {
				override readonly workspaceStorageHome = URI.file('/workspaceStorage');
			},
			new NullLogService(),
		);
		const model = upcastPartial<ITextModel>({ uri: modelUri });
		// A PNG of one pixel.
		const png = decodeBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==').buffer;
		const paste = async () => {
			const transfer = new VSDataTransfer();
			transfer.append('image/png', createFileDataTransferItem('image.png', undefined, async () => png));
			const session = await provider.provideDocumentPasteEdits(model, [new Range(1, 1, 1, 1)], transfer, { triggerKind: DocumentPasteTriggerKind.Automatic }, CancellationToken.None);
			return session?.edits[0]?.additionalEdit?.edits[0] as ICustomEdit | undefined;
		};

		const first = await paste();
		await first?.redo();
		const imageId = attachments[0]?.id;
		const pasteOfAttachedImage = await paste();
		await first?.undo();
		await first?.redo();
		await first?.undo();
		const second = await paste();
		await second?.redo();

		assert.deepStrictEqual({
			pasteOfAttachedImage,
			events: events.map(event => ({ inputUri: event.inputUri.toString(), attachmentIds: event.attachmentIds, gesture: event.gesture })),
		}, {
			pasteOfAttachedImage: undefined,
			events: [
				{ inputUri: modelUri.toString(), attachmentIds: [imageId], gesture: 'paste' },
				{ inputUri: modelUri.toString(), attachmentIds: [imageId], gesture: 'paste' },
			],
		});
	});

	test('replaces a long single-line plain-text paste with an inline attachment reference', async () => {
		const attachments: IChatRequestVariableEntry[] = [];
		const inlineAttachments: { entry: IChatRequestVariableEntry; text: string; range: IRange }[] = [];
		let isTerminalCommandPaste = false;
		const target: IChatPasteTarget = {
			sessionResource: URI.parse('chat-session:/test'),
			get attachments() { return attachments; },
			get inlineReferences() { return []; },
			addAttachments: entries => attachments.push(...entries),
			removeAttachments: ids => {
				for (const id of ids) {
					const index = attachments.findIndex(attachment => attachment.id === id);
					if (index >= 0) {
						attachments.splice(index, 1);
					}
				}
			},
			addInlineAttachment: (entry, text, range) => {
				attachments.push(entry);
				inlineAttachments.push({ entry, text, range });
			},
			addInlineReference: () => { },
			isTerminalCommandPaste: () => isTerminalCommandPaste,
		};
		const modelUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'paste-test' });
		const pasteTargetService = new class extends mock<IChatPasteTargetService>() {
			override getTarget(uri: URI): IChatPasteTarget | undefined {
				return uri === modelUri ? target : undefined;
			}
		};
		const provider = new PasteTextProvider(
			pasteTargetService,
			new class extends mock<IModelService>() { },
			new class extends mock<ILogService>() { },
			new class extends mock<IConfigurationService>() {
				override getValue<T>(): T { return pastedTextArtifactDefaultMinLength as T; }
			},
		);
		const model = upcastPartial<ITextModel>({
			uri: modelUri,
			getOffsetAt: position => position.column - 1,
		});
		const longText = 'x'.repeat(pastedTextArtifactDefaultMinLength + 1);
		const transferOf = (entries: Record<string, string>) => {
			const transfer = new VSDataTransfer();
			for (const [mime, value] of Object.entries(entries)) {
				transfer.append(mime, createStringDataTransferItem(value));
			}
			return transfer;
		};
		const pasteInto = (transfer: VSDataTransfer, ranges: readonly IRange[] = [new Range(1, 1, 1, 1)]) =>
			provider.provideDocumentPasteEdits(model, ranges, transfer, { triggerKind: DocumentPasteTriggerKind.Automatic }, CancellationToken.None);

		const plainText = transferOf({ [Mimes.text]: longText });
		const session = await pasteInto(plainText, [new Range(1, 8, 1, 8)]);
		const edit = session?.edits[0];
		const customEdit = edit?.additionalEdit?.edits[0] as ICustomEdit | undefined;
		await customEdit?.redo();

		const htmlSession = await pasteInto(transferOf({ [Mimes.text]: longText, [Mimes.html]: `<strong>${longText}</strong>` }));
		const shortHtmlSession = await pasteInto(transferOf({ [Mimes.text]: 'hi', [Mimes.html]: '<strong>hi</strong>' }));
		const attachmentSession = await pasteInto(transferOf({ [Mimes.text]: longText, [CHAT_ATTACHMENT_MIME_TYPE]: '{}' }));
		const multiCursorSession = await pasteInto(plainText, [new Range(1, 1, 1, 1), new Range(1, 2, 1, 2)]);
		isTerminalCommandPaste = true;
		const terminalCommandSession = await pasteInto(plainText);

		assert.deepStrictEqual({
			handlesPlainText: provider.pasteMimeTypes.includes(Mimes.text),
			longHtmlStillBecomesAnArtifact: htmlSession?.edits[0]?.title,
			leavesShortHtmlToHtmlPaste: shortHtmlSession,
			leavesCopiedChatAttachmentsToAttachmentPaste: attachmentSession,
			leavesMultipleCursorsToPlainTextPaste: multiCursorSession,
			leavesTerminalCommandsAsText: terminalCommandSession,
			insertText: edit?.insertText,
			title: edit?.title,
			attachment: attachments.map(attachment => ({
				name: attachment.name,
				kind: attachment.kind,
				valueIsPreserved: attachment.value === longText,
			})),
			references: inlineAttachments.map(inline => ({
				idMatchesAttachment: inline.entry.id === attachments[0]?.id,
				name: inline.entry.name,
				text: inline.text,
				range: inline.range,
			})),
		}, {
			handlesPlainText: true,
			longHtmlStillBecomesAnArtifact: 'Pasted Text Attachment',
			leavesShortHtmlToHtmlPaste: undefined,
			leavesCopiedChatAttachmentsToAttachmentPaste: undefined,
			leavesMultipleCursorsToPlainTextPaste: undefined,
			leavesTerminalCommandsAsText: undefined,
			insertText: '#attachment:Pasted text #1 ',
			title: 'Pasted Text Attachment',
			attachment: [{
				name: 'Pasted text #1',
				kind: 'paste',
				valueIsPreserved: true,
			}],
			references: [{
				idMatchesAttachment: true,
				name: 'Pasted text #1',
				text: '#attachment:Pasted text #1',
				range: new Range(1, 8, 1, 34),
			}],
		});
	});
});
