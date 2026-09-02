/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { createStringDataTransferItem, VSDataTransfer } from '../../../../../base/common/dataTransfer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DocumentPasteTriggerKind, ICustomEdit } from '../../../../../editor/common/languages.js';
import { TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestCodeEditorService } from '../../../../../editor/test/browser/editorTestServices.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ChatDynamicVariableModel, dynamicVariableDecorationType } from '../../../../../workbench/contrib/chat/browser/attachments/chatDynamicVariables.js';
import { IChatPasteTarget, IChatPasteTargetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { PasteTextProvider, pastedTextArtifactDefaultMinLength } from '../../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { INewChatAttachments } from '../../browser/newChatContextAttachments.js';
import { NewChatInputPasteTarget } from '../../browser/newChatInputPasteTarget.js';

class TestAttachments extends Disposable implements INewChatAttachments {
	private readonly _onDidChangeContext = this._register(new Emitter<void>());
	readonly onDidChangeContext = this._onDidChangeContext.event;
	readonly attachments: IChatRequestVariableEntry[] = [];

	setAttachments(entries: readonly IChatRequestVariableEntry[]): void {
		this.attachments.splice(0, this.attachments.length, ...entries);
		this._onDidChangeContext.fire();
	}

	addAttachments(...entries: IChatRequestVariableEntry[]): void {
		this.attachments.push(...entries);
		this._onDidChangeContext.fire();
	}

	removeAttachment(id: string): void {
		const index = this.attachments.findIndex(entry => entry.id === id);
		if (index !== -1) {
			this.attachments.splice(index, 1);
			this._onDidChangeContext.fire();
		}
	}
}

suite('NewChatInputPasteTarget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('formats GitHub links without attaching them as context', async () => {
		const uri = URI.from({ scheme: Schemas.sessionsChatInput, path: 'paste-test' });
		const textModel = store.add(createTextModel('', null, undefined, uri));
		const codeEditorService = store.add(new TestCodeEditorService(new TestThemeService()));
		store.add(codeEditorService.registerDecorationType('test', dynamicVariableDecorationType, {
			rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		}));
		const editor = store.add(createTestCodeEditor(textModel, {
			serviceCollection: new ServiceCollection([ICodeEditorService, codeEditorService]),
		}));
		const attachments = store.add(new TestAttachments());
		const dynamicVariableModel = store.add(new ChatDynamicVariableModel({
			inputEditor: editor,
			get attachments() { return attachments.attachments; },
			onDidChangeActiveInputEditor: Event.None,
			onDidChangeAttachments: attachments.onDidChangeContext,
			refreshParsedInput: () => { },
		}, new class extends mock<ILabelService>() {
			override getUriLabel(resource: URI): string { return resource.toString(); }
		}));
		const target = new NewChatInputPasteTarget(
			editor,
			attachments,
			{ acceptCompletion: () => { }, forgetReference: () => { } },
			dynamicVariableModel,
			() => undefined,
			() => undefined,
			uri,
		);
		const pasteTargetService = new class extends mock<IChatPasteTargetService>() {
			override getTarget(resource: URI): IChatPasteTarget | undefined {
				return resource.toString() === uri.toString() ? target : undefined;
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
						? true
						: pastedTextArtifactDefaultMinLength) as T;
				}
			},
		);
		const issueUrl = 'https://github.com/microsoft/vscode/issues/334061#issuecomment-1';
		const transfer = new VSDataTransfer();
		transfer.append(Mimes.text, createStringDataTransferItem(issueUrl));
		const session = await provider.provideDocumentPasteEdits(
			textModel,
			[new Range(1, 1, 1, 1)],
			transfer,
			{ triggerKind: DocumentPasteTriggerKind.Automatic },
			CancellationToken.None,
		);
		const edit = session?.edits[0];
		assert.ok(edit);
		editor.executeEdits('test.paste', [{ range: new Range(1, 1, 1, 1), text: edit.insertText as string }]);
		await (edit.additionalEdit?.edits[0] as ICustomEdit).redo();

		const longTextTransfer = new VSDataTransfer();
		longTextTransfer.append(Mimes.text, createStringDataTransferItem(`${'x'.repeat(1200)}\n`.repeat(10)));
		const longTextSession = await provider.provideDocumentPasteEdits(
			textModel,
			[new Range(1, 1, 1, 1)],
			longTextTransfer,
			{ triggerKind: DocumentPasteTriggerKind.Automatic },
			CancellationToken.None,
		);

		assert.deepStrictEqual({
			displayText: editor.getValue(),
			promptText: dynamicVariableModel.getPromptText(editor.getValue().trim()),
			attachments: attachments.attachments,
			referenceCount: target.inlineReferences.length,
			longTextSession,
		}, {
			displayText: 'microsoft/vscode#334061 ',
			promptText: issueUrl,
			attachments: [],
			referenceCount: 1,
			longTextSession: undefined,
		});
	});
});
