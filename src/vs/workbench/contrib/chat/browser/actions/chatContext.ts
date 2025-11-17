/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isElectron } from '../../../../../base/common/platform.js';
import { dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { FileEditorInput } from '../../../files/browser/editors/fileEditorInput.js';
import { NotebookEditorInput } from '../../../notebook/common/notebookEditorInput.js';
import { IChatContextPickService, IChatContextValueItem, IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPicker } from '../chatContextPickService.js';
import { IChatEditingService } from '../../common/chatEditingService.js';
import { IChatRequestToolEntry, IChatRequestToolSetEntry, IChatRequestVariableEntry, IImageVariableEntry, OmittedState, toToolSetVariableEntry, toToolVariableEntry } from '../../common/chatVariableEntries.js';
import { ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';
import { IChatWidget } from '../chat.js';
import { imageToHash, isImage } from '../chatPasteProviders.js';
import { convertBufferToScreenshotVariable } from '../contrib/screenshot.js';
import { ChatInstructionsPickerPick } from '../promptSyntax/attachInstructionsAction.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';


export class ChatContextContributions extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.contextContributions';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatContextPickService contextPickService: IChatContextPickService,
	) {
		super();

		// ###############################################################################################
		//
		// Default context picks/values which are "native" to chat. This is NOT the complete list
		// and feature area specific context, like for notebooks, problems, etc, should be contributed
		// by the feature area.
		//
		// ###############################################################################################

		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ToolsContextPickerPick)));
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ChatInstructionsPickerPick)));
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(OpenEditorContextValuePick)));
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(RelatedFilesContextPickerPick)));
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ClipboardImageContextValuePick)));
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ScreenshotContextValuePick)));
	}
}

class ToolsContextPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';
	readonly label: string = localize('chatContext.tools', 'Tools...');
	readonly icon: ThemeIcon = Codicon.tools;
	readonly ordinal = -500;

	isEnabled(widget: IChatWidget): boolean {
		return !!widget.attachmentCapabilities.supportsToolAttachments;
	}

	asPicker(widget: IChatWidget): IChatContextPicker {

		type Pick = IChatContextPickerPickItem & { toolInfo: { ordinal: number; label: string } };
		const items: Pick[] = [];

		for (const [entry, enabled] of widget.input.selectedToolsModel.entriesMap.get()) {
			if (enabled) {
				if (entry instanceof ToolSet) {
					items.push({
						toolInfo: ToolDataSource.classify(entry.source),
						label: entry.referenceName,
						description: entry.description,
						asAttachment: (): IChatRequestToolSetEntry => toToolSetVariableEntry(entry)
					});
				} else {
					items.push({
						toolInfo: ToolDataSource.classify(entry.source),
						label: entry.toolReferenceName ?? entry.displayName,
						description: entry.userDescription ?? entry.modelDescription,
						asAttachment: (): IChatRequestToolEntry => toToolVariableEntry(entry)
					});
				}
			}
		}

		items.sort((a, b) => {
			let res = a.toolInfo.ordinal - b.toolInfo.ordinal;
			if (res === 0) {
				res = a.toolInfo.label.localeCompare(b.toolInfo.label);
			}
			if (res === 0) {
				res = a.label.localeCompare(b.label);
			}
			return res;
		});

		let lastGroupLabel: string | undefined;
		const picks: (IQuickPickSeparator | Pick)[] = [];

		for (const item of items) {
			if (lastGroupLabel !== item.toolInfo.label) {
				picks.push({ type: 'separator', label: item.toolInfo.label });
				lastGroupLabel = item.toolInfo.label;
			}
			picks.push(item);
		}

		return {
			placeholder: localize('chatContext.tools.placeholder', 'Select a tool'),
			picks: Promise.resolve(picks)
		};
	}


}



class OpenEditorContextValuePick implements IChatContextValueItem {

	readonly type = 'valuePick';
	readonly label: string = localize('chatContext.editors', 'Open Editors');
	readonly icon: ThemeIcon = Codicon.file;
	readonly ordinal = 800;

	constructor(
		@IEditorService private _editorService: IEditorService,
		@ILabelService private _labelService: ILabelService,
	) { }

	isEnabled(): Promise<boolean> | boolean {
		return this._editorService.editors.filter(e => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput).length > 0;
	}

	async asAttachment(): Promise<IChatRequestVariableEntry[]> {
		const result: IChatRequestVariableEntry[] = [];
		for (const editor of this._editorService.editors) {
			if (!(editor instanceof FileEditorInput || editor instanceof DiffEditorInput || editor instanceof UntitledTextEditorInput || editor instanceof NotebookEditorInput)) {
				continue;
			}
			const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (!uri) {
				continue;
			}
			result.push({
				kind: 'file',
				id: uri.toString(),
				value: uri,
				name: this._labelService.getUriBasenameLabel(uri),
			});
		}
		return result;
	}

}

class RelatedFilesContextPickerPick implements IChatContextPickerItem {

	readonly type = 'pickerPick';

	readonly label: string = localize('chatContext.relatedFiles', 'Related Files');
	readonly icon: ThemeIcon = Codicon.sparkle;
	readonly ordinal = 300;

	constructor(
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ILabelService private readonly _labelService: ILabelService,
	) { }

	isEnabled(widget: IChatWidget): boolean {
		return this._chatEditingService.hasRelatedFilesProviders() && (Boolean(widget.getInput()) || widget.attachmentModel.fileAttachments.length > 0);
	}

	asPicker(widget: IChatWidget): IChatContextPicker {

		const picks = (async () => {
			const chatSessionResource = widget.viewModel?.sessionResource;
			if (!chatSessionResource) {
				return [];
			}
			const relatedFiles = await this._chatEditingService.getRelatedFiles(chatSessionResource, widget.getInput(), widget.attachmentModel.fileAttachments, CancellationToken.None);
			if (!relatedFiles) {
				return [];
			}
			const attachments = widget.attachmentModel.getAttachmentIDs();
			return this._chatEditingService.getRelatedFiles(chatSessionResource, widget.getInput(), widget.attachmentModel.fileAttachments, CancellationToken.None)
				.then((files) => (files ?? []).reduce<(IChatContextPickerPickItem | IQuickPickSeparator)[]>((acc, cur) => {
					acc.push({ type: 'separator', label: cur.group });
					for (const file of cur.files) {
						const label = this._labelService.getUriBasenameLabel(file.uri);
						acc.push({
							label: label,
							description: this._labelService.getUriLabel(dirname(file.uri), { relative: true }),
							disabled: attachments.has(file.uri.toString()),
							asAttachment: () => {
								return {
									kind: 'file',
									id: file.uri.toString(),
									value: file.uri,
									name: label,
									omittedState: OmittedState.NotOmitted
								};
							}
						});
					}
					return acc;
				}, []));
		})();

		return {
			placeholder: localize('relatedFiles', 'Add related files to your working set'),
			picks,
		};
	}
}


class ClipboardImageContextValuePick implements IChatContextValueItem {
	readonly type = 'valuePick';
	readonly label = localize('imageFromClipboard', 'Image from Clipboard');
	readonly icon = Codicon.fileMedia;

	constructor(
		@IClipboardService private readonly _clipboardService: IClipboardService,
	) { }

	async isEnabled(widget: IChatWidget) {
		if (!widget.attachmentCapabilities.supportsImageAttachments) {
			return false;
		}
		if (!widget.input.selectedLanguageModel?.metadata.capabilities?.vision) {
			return false;
		}
		const imageData = await this._clipboardService.readImage();
		return isImage(imageData);
	}

	async asAttachment(): Promise<IImageVariableEntry> {
		const fileBuffer = await this._clipboardService.readImage();
		return {
			id: await imageToHash(fileBuffer),
			name: localize('pastedImage', 'Pasted Image'),
			fullName: localize('pastedImage', 'Pasted Image'),
			value: fileBuffer,
			kind: 'image',
		};
	}
}

export class TerminalContext implements IChatContextValueItem {

	readonly type = 'valuePick';
	readonly icon = Codicon.terminal;
	readonly label = localize('terminal', 'Terminal');
	constructor(private readonly _resource: URI, @ITerminalService private readonly _terminalService: ITerminalService) {

	}
	isEnabled(widget: IChatWidget) {
		const terminal = this._terminalService.getInstanceFromResource(this._resource);
		return !!widget.attachmentCapabilities.supportsTerminalAttachments && terminal?.isDisposed === false;
	}
	async asAttachment(widget: IChatWidget): Promise<IChatRequestVariableEntry | undefined> {
		const terminal = this._terminalService.getInstanceFromResource(this._resource);
		if (!terminal) {
			return;
		}
		const params = new URLSearchParams(this._resource.query);
		const command = terminal.capabilities.get(TerminalCapability.CommandDetection)?.commands.find(cmd => cmd.id === params.get('command'));
		if (!command) {
			return;
		}
		const attachment: IChatRequestVariableEntry = {
			kind: 'terminalCommand',
			id: `terminalCommand:${Date.now()}}`,
			value: this.asValue(command),
			name: command.command,
			command: command.command,
			output: command.getOutput(),
			exitCode: command.exitCode,
			resource: this._resource
		};
		const cleanup = new DisposableStore();
		let disposed = false;
		const disposeCleanup = () => {
			if (disposed) {
				return;
			}
			disposed = true;
			cleanup.dispose();
		};
		cleanup.add(widget.attachmentModel.onDidChange(e => {
			if (e.deleted.includes(attachment.id)) {
				disposeCleanup();
			}
		}));
		cleanup.add(terminal.onDisposed(() => {
			widget.attachmentModel.delete(attachment.id);
			widget.refreshParsedInput();
			disposeCleanup();
		}));
		return attachment;
	}

	private asValue(command: ITerminalCommand): string {
		let value = `Command: ${command.command}`;
		const output = command.getOutput();
		if (output) {
			value += `\nOutput:\n${output}`;
		}
		if (typeof command.exitCode === 'number') {
			value += `\nExit Code: ${command.exitCode}`;
		}
		return value;
	}
}

class ScreenshotContextValuePick implements IChatContextValueItem {

	readonly type = 'valuePick';
	readonly icon = Codicon.deviceCamera;
	readonly label = (isElectron
		? localize('chatContext.attachScreenshot.labelElectron.Window', 'Screenshot Window')
		: localize('chatContext.attachScreenshot.labelWeb', 'Screenshot'));

	constructor(
		@IHostService private readonly _hostService: IHostService,
	) { }

	async isEnabled(widget: IChatWidget) {
		return !!widget.attachmentCapabilities.supportsImageAttachments && !!widget.input.selectedLanguageModel?.metadata.capabilities?.vision;
	}

	async asAttachment(): Promise<IChatRequestVariableEntry | undefined> {
		const blob = await this._hostService.getScreenshot();
		return blob && convertBufferToScreenshotVariable(blob);
	}
}
