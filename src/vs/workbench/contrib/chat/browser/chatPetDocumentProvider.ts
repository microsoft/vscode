/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { createFileSystemProviderError, FileChangeType, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileService, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat, IWatchOptions } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CHAT_PET_DOCUMENT_SCHEME, CHAT_PET_DOCUMENT_URI, findChatPetDocumentMoveLine, IChatPetOpenDocumentArgs, parseChatPetDocument, serializeChatPetDocument } from './chatPetDocument.js';
import { serializeChatPetMove } from './chatPetMoves.js';
import { IChatPetService } from './chatPetService.js';
import { IChatPetWidgetService } from './widget/chatPetWidgetService.js';

/**
 * Serves `pets.md` from what the pet knows, and teaches the pet what is saved to it. The file
 * changes whenever the pet learns something, from any window or agent, so an open editor
 * reloads, and a save over changes it hasn't seen gets the usual conflict handling. A save with
 * mistakes fails with them listed, and teaches nothing until they are fixed.
 */
export class ChatPetDocumentFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities = Event.None;
	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile = this._onDidChangeFile.event;
	private mtime = Date.now();

	constructor(
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatPetWidgetService private readonly chatPetWidgetService: IChatPetWidgetService,
	) {
		super();
		this._register(autorun(reader => {
			this.chatPetService.moves.read(reader);
			this.chatPetService.reactions.read(reader);
			// Every change gets a later mtime, so editors reload and stale saves are caught.
			this.mtime = Math.max(Date.now(), this.mtime + 1);
			this._onDidChangeFile.fire([{ type: FileChangeType.UPDATED, resource: CHAT_PET_DOCUMENT_URI }]);
		}));
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	private get text(): string {
		return serializeChatPetDocument(this.chatPetService.moves.get(), this.chatPetService.reactions.get());
	}

	private isRoot(resource: URI): boolean {
		return resource.path === '/' || resource.path === '';
	}

	private assertDocument(resource: URI): void {
		if (!isEqual(resource, CHAT_PET_DOCUMENT_URI)) {
			throw createFileSystemProviderError(localize('chatPet.document.notFound', "The VS Code pet has no file called {0}; its moves and reactions are in pets.md.", resource.path), FileSystemProviderErrorCode.FileNotFound);
		}
	}

	async stat(resource: URI): Promise<IStat> {
		if (this.isRoot(resource)) {
			return { type: FileType.Directory, ctime: 0, mtime: this.mtime, size: 0 };
		}
		this.assertDocument(resource);
		return { type: FileType.File, ctime: 0, mtime: this.mtime, size: VSBuffer.fromString(this.text).byteLength };
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		if (!this.isRoot(resource)) {
			throw createFileSystemProviderError(localize('chatPet.document.notADirectory', "{0} is not a directory.", resource.path), FileSystemProviderErrorCode.FileNotADirectory);
		}
		return [[CHAT_PET_DOCUMENT_URI.path.slice(1), FileType.File]];
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		this.assertDocument(resource);
		return VSBuffer.fromString(this.text).buffer;
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		this.assertDocument(resource);
		const document = parseChatPetDocument(VSBuffer.wrap(content).toString());
		if (document.errors.length) {
			throw createFileSystemProviderError(localize('chatPet.document.invalid', "The pet learned nothing from pets.md; fix these first:\n{0}", document.errors.join('\n')), FileSystemProviderErrorCode.Unknown);
		}
		const before = new Map(this.chatPetService.moves.get().map(move => [move.name, serializeChatPetMove(move)]));
		this.chatPetService.replaceTaught(document.moves, document.reactions);
		// Saving shows the work: the pet plays the last move that is new or changed, as it does when an agent teaches one.
		const changed = document.moves.filter(move => before.get(move.name) !== serializeChatPetMove(move));
		const play = changed.at(-1);
		if (play) {
			this.chatPetWidgetService.playReaction(play.name);
		}
	}

	async mkdir(): Promise<void> {
		throw this.readOnlyStructureError();
	}

	async delete(): Promise<void> {
		throw this.readOnlyStructureError();
	}

	async rename(): Promise<void> {
		throw this.readOnlyStructureError();
	}

	private readOnlyStructureError() {
		return createFileSystemProviderError(localize('chatPet.document.noPermissions', "The VS Code pet keeps only pets.md; it can't be renamed, deleted or given company."), FileSystemProviderErrorCode.NoPermissions);
	}
}

/** Registers the `pets.md` provider, and labels its scheme so the editor shows just the file name. */
export class ChatPetDocumentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPetDocument';

	constructor(
		@IFileService fileService: IFileService,
		@ILabelService labelService: ILabelService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(fileService.registerProvider(CHAT_PET_DOCUMENT_SCHEME, this._register(instantiationService.createInstance(ChatPetDocumentFileSystemProvider))));
		this._register(labelService.registerFormatter({
			scheme: CHAT_PET_DOCUMENT_SCHEME,
			formatting: { label: '${path}', separator: '/', stripPathStartingSeparator: true },
		}));
	}
}

/**
 * Opens `pets.md` in a text editor: at a move's block, or with a new block for a move inserted
 * and selected but not saved, so nothing is taught until the user saves.
 */
export async function openChatPetDocument(editorService: IEditorService, args: IChatPetOpenDocumentArgs = {}): Promise<void> {
	const pane = await editorService.openEditor({ resource: CHAT_PET_DOCUMENT_URI, options: { pinned: true, revealIfOpened: true } });
	const editor = pane?.getControl();
	if (!isCodeEditor(editor)) {
		return;
	}
	const model = editor.getModel();
	if (!model) {
		return;
	}
	if (args.insertMove) {
		const lastLine = model.getLineCount();
		const endsWithNewline = model.getLineContent(lastLine) === '';
		const block = `${endsWithNewline ? '' : '\n'}\n\`\`\`pet\n${args.insertMove.replace(/\n$/, '')}\n\`\`\`\n`;
		const end = new Range(lastLine, model.getLineMaxColumn(lastLine), lastLine, model.getLineMaxColumn(lastLine));
		editor.executeEdits('chatPet', [{ range: end, text: block }]);
		// The name is selected, as the first thing to change in a new move.
		const nameLine = lastLine + (endsWithNewline ? 2 : 3);
		const nameContent = model.getLineContent(nameLine);
		const nameStart = nameContent.indexOf(':') + 2;
		editor.setSelection(new Range(nameLine, Math.min(nameStart + 1, nameContent.length + 1), nameLine, nameContent.length + 1));
		editor.revealLineInCenter(nameLine);
	} else if (args.revealMove) {
		const line = findChatPetDocumentMoveLine(model.getValue(), args.revealMove);
		if (line !== undefined) {
			editor.setSelection(new Range(line, 1, line, model.getLineMaxColumn(line)));
			editor.revealLineInCenter(line);
		}
	}
	editor.focus();
}
