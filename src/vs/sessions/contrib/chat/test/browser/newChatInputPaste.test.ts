/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createStringDataTransferItem, VSDataTransfer } from '../../../../../base/common/dataTransfer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { Schemas } from '../../../../../base/common/network.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DocumentPasteTriggerKind, ICustomEdit } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatPasteTarget, IChatPasteTargetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { PasteTextProvider } from '../../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { IChatRequestVariableEntry, isPastedTextArtifact } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { AgentHostInputCompletionHandler } from '../../browser/agentHostInputCompletions.js';
import { INewChatAttachments } from '../../browser/newChatContextAttachments.js';
import { NewChatInputPasteTarget } from '../../browser/newChatInputPasteTarget.js';

/** Minimal stand-in for the composer's attachment store, without the pill UI. */
class TestAttachments implements INewChatAttachments {

	private readonly _onDidChangeContext = new Emitter<void>();
	readonly onDidChangeContext = this._onDidChangeContext.event;

	private readonly _attachments: IChatRequestVariableEntry[] = [];

	get attachments(): readonly IChatRequestVariableEntry[] {
		return this._attachments;
	}

	setAttachments(entries: readonly IChatRequestVariableEntry[]): void {
		this._attachments.length = 0;
		this._attachments.push(...entries);
		this._onDidChangeContext.fire();
	}

	addAttachments(...entries: IChatRequestVariableEntry[]): void {
		for (const entry of entries) {
			if (!this._attachments.some(e => e.id === entry.id)) {
				this._attachments.push(entry);
			}
		}
		this._onDidChangeContext.fire();
	}

	removeAttachment(id: string): void {
		const index = this._attachments.findIndex(e => e.id === id);
		if (index >= 0) {
			this._attachments.splice(index, 1);
			this._onDidChangeContext.fire();
		}
	}

	dispose(): void {
		this._onDidChangeContext.dispose();
	}
}

suite('NewChatInputPasteTarget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Drives one long paste through the shared paste pipeline against the Agents
	 * composer and returns a snapshot after each stage of the edit's lifecycle.
	 *
	 * The paste edit is applied the way the bulk edit service applies it: the
	 * inserted text is one undo element and the attachment is a second, so undo
	 * runs the custom edit first and the text edit second, and redo the reverse.
	 */
	async function runPasteLifecycle(pastedText: string, act?: (attachments: INewChatAttachments) => void) {
		const snapshots: { stage: string; value: string; attachments: string[]; code: string | undefined; sent: { name: string; text: string }[] }[] = [];

		const model = store.add(createTextModel('', null, undefined, URI.from({ scheme: Schemas.sessionsChatInput, path: 'input-test' })));
		const services = new ServiceCollection(
			[ISessionContext, { _serviceBrand: undefined, session: observableValue<IActiveSession | undefined>('session', undefined) }],
			[IChatSessionsService, new class extends mock<IChatSessionsService>() { }],
		);
		await withTestCodeEditor(model, { serviceCollection: services }, async (editor, _viewModel, instantiationService) => {
			const local = new DisposableStore();
			try {
				const attachments = local.add(new TestAttachments());
				const completionHandler = local.add(instantiationService.createInstance(AgentHostInputCompletionHandler, editor, attachments));
				const target = new NewChatInputPasteTarget(
					editor,
					attachments,
					completionHandler,
					() => undefined,
					() => undefined,
					model.uri,
				);
				const pasteTargetService = new class extends mock<IChatPasteTargetService>() {
					override getTarget(uri: URI): IChatPasteTarget | undefined {
						return uri.toString() === model.uri.toString() ? target : undefined;
					}
				};
				const provider = new PasteTextProvider(
					pasteTargetService,
					new class extends mock<IModelService>() { },
					new class extends mock<ILogService>() { },
				);

				const transfer = new VSDataTransfer();
				transfer.append(Mimes.text, createStringDataTransferItem(pastedText));
				const session = await provider.provideDocumentPasteEdits(
					model, [new Range(1, 1, 1, 1)], transfer, { triggerKind: DocumentPasteTriggerKind.Automatic }, CancellationToken.None);
				const edit = session?.edits[0];
				const customEdit = edit?.additionalEdit?.edits[0] as ICustomEdit | undefined;
				assert.ok(edit && customEdit, 'a long paste should produce an attachment edit');

				const snapshot = (stage: string) => {
					const attachment = attachments.attachments.at(0);
					// What `_send` collects: the trimmed message plus the attachments
					// resolved against it, so the range each one reports is the slice
					// of the outgoing message its reference occupies.
					const rawValue = model.getValue();
					const message = rawValue.trim();
					const sent = completionHandler.getAttachmentsForSend(message, rawValue.length - rawValue.trimStart().length);
					snapshots.push({
						stage,
						value: rawValue,
						attachments: attachments.attachments.map(a => a.name),
						code: attachment && isPastedTextArtifact(attachment) ? attachment.code : undefined,
						sent: sent.map(entry => ({
							name: entry.name,
							text: entry.range ? message.slice(entry.range.start, entry.range.endExclusive) : '',
						})),
					});
				};

				editor.executeEdits('test.paste', [{ range: new Range(1, 1, 1, 1), text: edit.insertText as string }]);
				model.pushStackElement();
				await customEdit.redo();
				snapshot('paste');

				await customEdit.undo();
				model.undo();
				snapshot('undo');

				model.redo();
				await customEdit.redo();
				snapshot('redo');

				act?.(attachments);
				snapshot('afterAct');
			} finally {
				local.dispose();
			}
		});

		return snapshots;
	}

	test('keeps the attachment and its inline reference consistent across undo and redo', async () => {
		const pastedText = 'x'.repeat(1200);
		const snapshots = await runPasteLifecycle(pastedText);

		const attached = { attachments: ['Pasted text #1'], codeIsPreserved: true, sent: [{ name: 'Pasted text #1', text: '#attachment:Pasted text #1' }] };
		const detached = { attachments: [], codeIsPreserved: undefined, sent: [] };

		assert.deepStrictEqual(snapshots.map(({ stage, value, attachments, code, sent }) => ({
			stage,
			value,
			attachments,
			codeIsPreserved: code === undefined ? undefined : code === pastedText,
			sent,
		})), [
			{ stage: 'paste', value: '#attachment:Pasted text #1 ', ...attached },
			{ stage: 'undo', value: '', ...detached },
			{ stage: 'redo', value: '#attachment:Pasted text #1 ', ...attached },
			{ stage: 'afterAct', value: '#attachment:Pasted text #1 ', ...attached },
		]);
	});

	test('removing the attachment takes its inline reference out of the input', async () => {
		const pastedText = 'x'.repeat(1200);
		const snapshots = await runPasteLifecycle(pastedText, attachments => {
			attachments.removeAttachment(attachments.attachments[0].id);
		});

		assert.deepStrictEqual(snapshots.at(-1), {
			stage: 'afterAct',
			value: '',
			attachments: [],
			code: undefined,
			sent: [],
		});
	});
});
