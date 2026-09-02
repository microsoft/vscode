/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
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
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../../../platform/log/common/log.js';
import { IChatPasteTarget, IChatPasteTargetService } from '../../../../../browser/chat.js';
import { IChatSessionsService } from '../../../../../common/chatSessionsService.js';
import { CHAT_ATTACHMENT_MIME_TYPE, createPastedTextArtifact, pastedTextArtifactDefaultMinLength, PasteTextProvider } from '../../../../../browser/widget/input/editor/chatPasteProviders.js';
import { ChatPasteAttachmentMetadata, IChatRequestVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable } from '../../../../../common/attachments/chatVariables.js';
import { ChatConfiguration, isSupportedChatFileScheme } from '../../../../../common/constants.js';
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
		const inlineReferences: IDynamicVariable[] = [];
		const restoredReferences: { expectedText: string | undefined; expectedRangeOffset: number | undefined }[] = [];
		let isTerminalCommandPaste = false;
		const target: IChatPasteTarget = {
			sessionResource: URI.parse('chat-session:/test'),
			get attachments() { return attachments; },
			get inlineReferences() { return inlineReferences; },
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
			addInlineReference: (reference, expectedText, expectedRangeOffset) => {
				inlineReferences.push(reference);
				if (expectedText !== undefined || expectedRangeOffset !== undefined) {
					restoredReferences.push({ expectedText, expectedRangeOffset });
				}
			},
			removeInlineReference: reference => {
				const index = inlineReferences.findIndex(candidate =>
					candidate.id === reference.id && Range.equalsRange(candidate.range, reference.range));
				if (index >= 0) {
					inlineReferences.splice(index, 1);
				}
			},
			isTerminalCommandPaste: () => isTerminalCommandPaste,
		};
		const modelUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'paste-test' });
		const sessionsModelUri = URI.from({ scheme: Schemas.sessionsChatInput, path: 'paste-test' });
		let pasteGitHubLinksAsReferences = true;
		const pasteTargetService = new class extends mock<IChatPasteTargetService>() {
			override getTarget(uri: URI): IChatPasteTarget | undefined {
				return uri === modelUri || uri === sessionsModelUri ? target : undefined;
			}
		};
		const provider = new PasteTextProvider(
			pasteTargetService,
			new class extends mock<IModelService>() { },
			new class extends mock<ILogService>() { },
			new class extends mock<IConfigurationService>() {
				override getValue<T>(): T;
				override getValue<T>(section: string): T;
				override getValue<T>(overrides: IConfigurationOverrides): T;
				override getValue<T>(section: string, overrides: IConfigurationOverrides): T;
				override getValue<T>(sectionOrOverrides?: string | IConfigurationOverrides): T {
					return (sectionOrOverrides === ChatConfiguration.PasteGitHubLinksAsReferences
						? pasteGitHubLinksAsReferences
						: pastedTextArtifactDefaultMinLength) as T;
				}
			},
		);
		const model = upcastPartial<ITextModel>({
			uri: modelUri,
			getOffsetAt: position => position.column - 1,
			getValueInRange: range => range.startLineNumber === 2 ? 'microsoft/vscode#333953' : 'microsoft/vscode#334061',
		});
		const sessionsModel = upcastPartial<ITextModel>({ uri: sessionsModelUri });
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
		const githubIssueSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/issues/334061',
			[Mimes.uriList]: 'https://github.com/microsoft/vscode/issues/334061',
		}));
		const githubPullRequestSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/pull/333953#issuecomment-123',
		}), [new Range(2, 5, 2, 5)]);
		const invalidGithubIssueSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/issues/0',
		}));
		const paddedGithubIssueSession = await pasteInto(transferOf({
			[Mimes.text]: ' https://github.com/microsoft/vscode/issues/334061\n',
		}));
		pasteGitHubLinksAsReferences = false;
		const disabledGithubIssueSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/issues/334061',
		}));
		pasteGitHubLinksAsReferences = true;
		const sessionsGithubIssueSession = await provider.provideDocumentPasteEdits(
			sessionsModel,
			[new Range(1, 1, 1, 1)],
			transferOf({ [Mimes.text]: 'https://github.com/microsoft/vscode/issues/334061' }),
			{ triggerKind: DocumentPasteTriggerKind.Automatic },
			CancellationToken.None
		);
		const sessionsLongTextSession = await provider.provideDocumentPasteEdits(
			sessionsModel,
			[new Range(1, 1, 1, 1)],
			transferOf({ [Mimes.text]: longText }),
			{ triggerKind: DocumentPasteTriggerKind.Automatic },
			CancellationToken.None
		);
		await (githubIssueSession?.edits[0]?.additionalEdit?.edits[0] as ICustomEdit | undefined)?.redo();
		await (githubPullRequestSession?.edits[0]?.additionalEdit?.edits[0] as ICustomEdit | undefined)?.redo();
		const pasteInsideReferenceSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/issues/334062',
		}), [new Range(1, 2, 1, 2)]);
		const pasteAcrossReferencesSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/issues/334062',
		}), [new Range(1, 1, 2, 28)]);
		const replacementPullRequestSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://github.com/microsoft/vscode/pull/333954#issuecomment-456',
		}), [new Range(2, 1, 2, 32)]);
		const replacementEdit = replacementPullRequestSession?.edits[0]?.additionalEdit?.edits[0] as ICustomEdit | undefined;
		const originalPullRequestReference = inlineReferences.find(reference => reference.id.includes('/pull/333953'));
		assert.ok(originalPullRequestReference);
		target.removeInlineReference(originalPullRequestReference);
		await replacementEdit?.redo();
		const referencesAfterReplacement = inlineReferences.map(reference => reference.id);
		await replacementEdit?.undo();
		const referencesAfterUndo = inlineReferences.map(reference => reference.id);
		const restoredPullRequestReference = inlineReferences.find(reference => reference.id.includes('/pull/333953'));
		assert.ok(restoredPullRequestReference);
		target.removeInlineReference(restoredPullRequestReference);
		await replacementEdit?.redo();
		const nonGitHubSession = await pasteInto(transferOf({
			[Mimes.text]: 'https://example.com/microsoft/vscode/issues/334061',
		}));
		const multiCursorSession = await pasteInto(plainText, [new Range(1, 1, 1, 1), new Range(1, 2, 1, 2)]);
		isTerminalCommandPaste = true;
		const terminalCommandSession = await pasteInto(plainText);

		assert.deepStrictEqual({
			handlesPlainText: provider.pasteMimeTypes.includes(Mimes.text),
			longHtmlStillBecomesAnArtifact: htmlSession?.edits[0]?.title,
			leavesShortHtmlToHtmlPaste: shortHtmlSession,
			leavesCopiedChatAttachmentsToAttachmentPaste: attachmentSession,
			githubIssue: {
				insertText: githubIssueSession?.edits[0]?.insertText,
				title: githubIssueSession?.edits[0]?.title,
				kind: githubIssueSession?.edits[0]?.kind,
				handledMimeType: githubIssueSession?.edits[0]?.handledMimeType,
				hasAdditionalEdit: !!githubIssueSession?.edits[0]?.additionalEdit,
			},
			githubPullRequest: {
				insertText: githubPullRequestSession?.edits[0]?.insertText,
				title: githubPullRequestSession?.edits[0]?.title,
				kind: githubPullRequestSession?.edits[0]?.kind,
				handledMimeType: githubPullRequestSession?.edits[0]?.handledMimeType,
				hasAdditionalEdit: !!githubPullRequestSession?.edits[0]?.additionalEdit,
			},
			leavesInvalidGitHubUrlsToDefaultPaste: invalidGithubIssueSession,
			leavesPaddedGitHubUrlsToDefaultPaste: paddedGithubIssueSession,
			leavesGitHubUrlsToDefaultPasteWhenDisabled: disabledGithubIssueSession,
			formatsSessionsComposerGitHubUrls: sessionsGithubIssueSession?.edits[0]?.insertText,
			leavesSessionsComposerLongTextInline: sessionsLongTextSession,
			leavesPasteInsideReferenceToDefaultPaste: pasteInsideReferenceSession,
			leavesPasteAcrossReferencesToDefaultPaste: pasteAcrossReferencesSession,
			referencesAfterReplacement,
			referencesAfterUndo,
			restoredReferences,
			githubReferences: inlineReferences.map(reference => ({
				id: reference.id,
				fullName: reference.fullName,
				icon: reference.icon?.id,
				range: reference.range,
				data: reference.data,
				isAttachmentReference: reference.isAttachmentReference,
				metadata: reference._meta,
				promptText: reference.promptText,
			})),
			leavesOtherUrlsToDefaultPaste: nonGitHubSession,
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
			githubIssue: {
				insertText: 'microsoft/vscode#334061 ',
				title: 'Paste GitHub Link',
				kind: provider.kind,
				handledMimeType: Mimes.text,
				hasAdditionalEdit: true,
			},
			githubPullRequest: {
				insertText: 'microsoft/vscode#333953 ',
				title: 'Paste GitHub Link',
				kind: provider.kind,
				handledMimeType: Mimes.text,
				hasAdditionalEdit: true,
			},
			leavesInvalidGitHubUrlsToDefaultPaste: undefined,
			leavesPaddedGitHubUrlsToDefaultPaste: undefined,
			leavesGitHubUrlsToDefaultPasteWhenDisabled: undefined,
			formatsSessionsComposerGitHubUrls: 'microsoft/vscode#334061 ',
			leavesSessionsComposerLongTextInline: undefined,
			leavesPasteInsideReferenceToDefaultPaste: undefined,
			leavesPasteAcrossReferencesToDefaultPaste: undefined,
			referencesAfterReplacement: [
				'https://github.com/microsoft/vscode/issues/334061',
				'https://github.com/microsoft/vscode/pull/333954#issuecomment-456',
			],
			referencesAfterUndo: [
				'https://github.com/microsoft/vscode/issues/334061',
				'https://github.com/microsoft/vscode/pull/333953#issuecomment-123',
			],
			restoredReferences: [{
				expectedText: 'microsoft/vscode#333953',
				expectedRangeOffset: 4,
			}],
			githubReferences: [{
				id: 'https://github.com/microsoft/vscode/issues/334061',
				fullName: 'microsoft/vscode#334061',
				icon: Codicon.issues.id,
				range: new Range(1, 1, 1, 24),
				data: URI.parse('https://github.com/microsoft/vscode/issues/334061'),
				isAttachmentReference: true,
				metadata: { chatPasteLink: true },
				promptText: 'https://github.com/microsoft/vscode/issues/334061',
			}, {
				id: 'https://github.com/microsoft/vscode/pull/333954#issuecomment-456',
				fullName: 'microsoft/vscode#333954',
				icon: Codicon.gitPullRequest.id,
				range: new Range(2, 1, 2, 24),
				data: URI.parse('https://github.com/microsoft/vscode/pull/333954#issuecomment-456'),
				isAttachmentReference: true,
				metadata: { chatPasteLink: true },
				promptText: 'https://github.com/microsoft/vscode/pull/333954#issuecomment-456',
			}],
			leavesOtherUrlsToDefaultPaste: undefined,
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
