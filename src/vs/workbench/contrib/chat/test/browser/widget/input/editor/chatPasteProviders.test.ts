/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { createStringDataTransferItem, VSDataTransfer } from '../../../../../../../../base/common/dataTransfer.js';
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
import { ILogService } from '../../../../../../../../platform/log/common/log.js';
import { IChatPasteTarget, IChatPasteTargetService } from '../../../../../browser/chat.js';
import { IChatSessionsService } from '../../../../../common/chatSessionsService.js';
import { CHAT_ATTACHMENT_MIME_TYPE, createPastedTextArtifact, pastedTextArtifactDefaultMinLength, PasteTextProvider } from '../../../../../browser/widget/input/editor/chatPasteProviders.js';
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

	test('creates sequential artifacts only for long pasted text', () => {
		const longText = `${'x'.repeat(10000)}\n`.repeat(10);
		const first = createPastedTextArtifact(longText, []);
		assert.ok(first);
		const second = createPastedTextArtifact(`${longText}\nsecond line`, [first.attachment]);
		assert.ok(second);

		assert.deepStrictEqual({
			belowLengthThreshold: createPastedTextArtifact(`${'x'.repeat(100)}\n`.repeat(10), []),
			belowLineThreshold: createPastedTextArtifact('x'.repeat(20000), []),
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
			belowLineThreshold: undefined,
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

	test('replaces a long plain-text paste with an inline attachment reference', async () => {
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
		const longText = `${'x'.repeat(10000)}\n`.repeat(10);
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
