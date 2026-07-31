/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Handler } from '../../../../editor/common/editorCommon.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const terminalCommandPasteDontAskAgainStorageKey = 'chat.terminalCommandPaste.dontAskAgain';

/**
 * Returns whether the current input `value` would be executed as a terminal
 * command, i.e. a `prefix` is advertised and the value begins with it. Chat
 * inputs use this to switch to a monospace font while a command is composed.
 */
export function isTerminalCommandInput(value: string, prefix: string | undefined): boolean {
	return !!prefix && value.startsWith(prefix);
}

/** Paste context used to detect terminal command prefixes at the start of chat input. */
interface ITerminalCommandPaste {
	readonly prefix: string;
	readonly pastedText: string;
	readonly currentValue: string;
	readonly selectionStartOffset: number;
	readonly selectionEndOffset: number;
}

/** Returns whether applying the paste would make the input start with the command prefix. */
function isTerminalCommandPaste(paste: ITerminalCommandPaste): boolean {
	const selectionStartOffset = Math.max(0, Math.min(paste.selectionStartOffset, paste.currentValue.length));
	const selectionEndOffset = Math.max(selectionStartOffset, Math.min(paste.selectionEndOffset, paste.currentValue.length));

	if (paste.currentValue.length !== 0 && selectionStartOffset !== 0) {
		return false;
	}

	const resultingText = paste.currentValue.slice(0, selectionStartOffset) + paste.pastedText + paste.currentValue.slice(selectionEndOffset);

	// Match the host-side bang parser (`parseBangCommand`): the prefix only runs
	// as a terminal command when it is at offset 0 with no leading whitespace.
	return resultingText.startsWith(paste.prefix);
}

/** Returns whether the user has globally suppressed terminal command paste warnings. */
function isTerminalCommandPasteWarningSuppressed(storageService: IStorageService): boolean {
	return storageService.getBoolean(terminalCommandPasteDontAskAgainStorageKey, StorageScope.APPLICATION, false);
}

/** Prompts for terminal command paste confirmation and persists the global suppression choice. */
async function shouldPasteTerminalCommand(
	dialogService: IDialogService,
	storageService: IStorageService,
	prefix: string,
): Promise<'paste' | 'cancel'> {
	if (isTerminalCommandPasteWarningSuppressed(storageService)) {
		return 'paste';
	}

	const { result } = await dialogService.prompt<'paste' | 'pasteAndDontAskAgain'>({
		type: 'warning',
		message: localize('terminalCommandPasteWarning', "The pasted text starts with \"{0}\", which will run the message as a terminal command when sent. Paste anyway?", prefix),
		buttons: [
			{
				label: localize('paste', "Paste"),
				run: () => 'paste',
			},
			{
				label: localize('pasteAndDontAskAgain', "Paste and Don't Ask Again"),
				run: () => 'pasteAndDontAskAgain',
			},
		],
		custom: true,
		cancelButton: true,
	});

	if (result === 'pasteAndDontAskAgain') {
		storageService.store(terminalCommandPasteDontAskAgainStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
		return 'paste';
	}

	return result === 'paste' ? 'paste' : 'cancel';
}

/**
 * Shared capture-phase paste handler for chat inputs. When the attached session
 * advertises a terminal command `prefix` and the pasted text would make the
 * input begin with that prefix (i.e. run as a command), warns the user before
 * inserting — unless they have globally suppressed the warning. On confirmation
 * the text is inserted via the editor's paste command; on cancel nothing is
 * inserted. When the paste would not become a command the event is left
 * untouched for default handling.
 *
 * This intercepts at the capture-phase DOM `paste` event — strictly before the
 * editor's own paste handling (`onWillPaste`/`CopyPasteController`) — because a
 * veto/confirmation must gate the paste before any of that runs. Register with
 * `addDisposableListener(editor.getDomNode(), EventType.PASTE, ..., true)`.
 */
export function handleTerminalCommandPaste(
	e: ClipboardEvent,
	editor: ICodeEditor,
	prefix: string | undefined,
	dialogService: IDialogService,
	storageService: IStorageService,
): void {
	if (e.defaultPrevented || !prefix) {
		return;
	}

	const pastedText = e.clipboardData?.getData('text');
	const model = editor.getModel();
	const selection = editor.getSelection();
	if (!pastedText || !model || !selection) {
		return;
	}

	const paste: ITerminalCommandPaste = {
		prefix,
		pastedText,
		currentValue: model.getValue(),
		selectionStartOffset: model.getOffsetAt(selection.getStartPosition()),
		selectionEndOffset: model.getOffsetAt(selection.getEndPosition()),
	};
	if (!isTerminalCommandPaste(paste) || isTerminalCommandPasteWarningSuppressed(storageService)) {
		return;
	}

	// Veto the default paste synchronously (before the editor's paste pipeline
	// runs), then confirm asynchronously and insert the text via the editor's
	// paste command. This inserts the raw text directly (firing `onDidPaste`
	// but not `onWillPaste`), so it does NOT re-enter this DOM handler and does
	// NOT run paste-into providers / `CopyPasteController` — intended for a chat
	// input, where a terminal command should be inserted verbatim.
	e.preventDefault();
	e.stopImmediatePropagation();

	shouldPasteTerminalCommand(dialogService, storageService, prefix).then(result => {
		if (result === 'paste') {
			editor.trigger('keyboard', Handler.Paste, { text: pastedText });
		}
	});
}

