/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { decodeKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { OS } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { EditorOpenSource, IEditorOptions, ITextEditorOptions, ITextEditorSelection } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { extractSelection, ILinkHandler, ILinkHandlerProvider, IOpenerService, OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorCommandsContext } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

/**
 * Shows the handlers that can open a link and opens the link with the picked one.
 * Takes an {@link IOpenLinkWithArgs} argument.
 */
export const OPEN_LINK_WITH_COMMAND_ID = 'workbench.action.openLinkWith';

export interface IOpenLinkWithArgs {
	readonly link: string;
	readonly openToSide?: boolean;
	readonly editorOptions?: IEditorOptions;
}

interface ILinkHandlerPick extends IQuickPickItem {
	readonly handler: ILinkHandler;
}

interface IPickedLinkHandler {
	readonly handler: ILinkHandler;
	readonly openToSide: boolean;
	readonly inBackground: boolean;
}

CommandsRegistry.registerCommand(OPEN_LINK_WITH_COMMAND_ID, async (accessor, args: IOpenLinkWithArgs) => {
	const openerService = accessor.get(IOpenerService);
	const quickInputService = accessor.get(IQuickInputService);
	const notificationService = accessor.get(INotificationService);
	const keybindingService = accessor.get(IKeybindingService);

	const openToSideKeybinding = keybindingService.resolveKeybinding(decodeKeybinding(KeyMod.Alt | KeyCode.Enter, OS)!).at(0)?.getLabel();
	const openToSideButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.splitHorizontal),
		tooltip: localize({ key: 'openLinkWith.openToSide', comment: ['{0} is a keyboard shortcut, such as Alt+Enter'] }, "Open to the Side ({0})", openToSideKeybinding),
	};
	const setAsDefaultButton: IQuickInputButton = {
		iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
		tooltip: localize('openLinkWith.setAsDefault', "Set as Default and Open"),
	};

	const store = new DisposableStore();
	try {
		const cancellation = store.add(new CancellationTokenSource());
		const picker = store.add(quickInputService.createQuickPick<ILinkHandlerPick>());
		picker.placeholder = localize('openLinkWith.placeholder', "Select how to open '{0}'", args.link);
		picker.canAcceptInBackground = true;
		picker.busy = true;

		const picked = await new Promise<IPickedLinkHandler | undefined>(resolve => {
			store.add(picker.onDidHide(() => {
				cancellation.cancel();
				resolve(undefined);
			}));
			store.add(picker.onDidAccept(e => {
				const item = picker.selectedItems.at(0);
				if (item) {
					resolve({ handler: item.handler, openToSide: picker.keyMods.alt, inBackground: e.inBackground });
				}
			}));
			store.add(picker.onDidTriggerItemButton(async e => {
				if (e.button === setAsDefaultButton) {
					await e.item.handler.setAsDefault?.();
				}
				resolve({ handler: e.item.handler, openToSide: e.button === openToSideButton, inBackground: false });
			}));

			picker.show();
			openerService.getLinkHandlers(args.link, cancellation.token).then(handlers => {
				if (handlers.length === 0) {
					picker.hide();
					notificationService.info(localize('openLinkWith.noHandlers', "No handler can open '{0}'.", args.link));
					return;
				}

				const items = handlers.map((handler): ILinkHandlerPick => ({
					handler,
					label: handler.label,
					description: handler.isDefault ? localize('openLinkWith.default', "Default") : undefined,
					detail: handler.detail,
					buttons: handler.setAsDefault ? [openToSideButton, setAsDefaultButton] : [openToSideButton],
				}));
				picker.items = items;
				picker.busy = false;
			}, error => {
				picker.hide();
				notificationService.error(error);
			});
		});
		picker.hide();

		if (!picked) {
			return false;
		}

		const opened = await picked.handler.open({
			fromUserGesture: true,
			openToSide: args.openToSide || picked.openToSide,
			editorOptions: {
				...args.editorOptions,
				preserveFocus: picked.inBackground || args.editorOptions?.preserveFocus,
			},
		});
		if (!opened) {
			notificationService.warn(localize('openLinkWith.notOpened', "The link could not be opened with {0}.", picked.handler.label));
		}
		return opened;
	} finally {
		store.dispose();
	}
});

/**
 * Offers the editor types that can show a resource as link handlers.
 */
export class EditorLinkHandlerProvider extends Disposable implements IWorkbenchContribution, ILinkHandlerProvider {

	static readonly ID = 'workbench.contrib.editorLinkHandlers';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IFileService private readonly _fileService: IFileService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
		this._register(openerService.registerLinkHandlerProvider(this));
	}

	async provideLinkHandlers(target: URI): Promise<readonly ILinkHandler[]> {
		const { selection, uri: resource } = extractSelection(target);
		if (resource.scheme === Schemas.http || resource.scheme === Schemas.https || !this._fileService.hasProvider(resource)) {
			return [];
		}

		// Make sure editors contributed by extensions are included
		await this._extensionService.whenInstalledExtensionsRegistered();

		const editorMatches = this._editorResolverService.getEditorMatches(resource);
		const defaultEditorId = editorMatches.defaultRule.editor.id;
		return editorMatches.matches.map(({ editor }): ILinkHandler => ({
			id: editor.id,
			label: editor.label,
			detail: editor.detail,
			isDefault: editor.id === defaultEditorId,
			open: async options => {
				await this._open(resource, selection, editor.id, options);
				return true;
			},
			setAsDefault: async () => this._editorResolverService.setDefaultEditor(resource, editor.id),
		}));
	}

	private async _open(resource: URI, selection: ITextEditorSelection | undefined, editorId: string, options: OpenInternalOptions | undefined): Promise<void> {
		const editorOptions: ITextEditorOptions = {
			selection,
			source: options?.fromUserGesture ? EditorOpenSource.USER : EditorOpenSource.API,
			...options?.editorOptions,
			override: editorId,
		};
		if (options?.openToSide) {
			await this._editorService.openEditor({ resource, options: editorOptions }, SIDE_GROUP);
			return;
		}

		// Switch an editor that already shows the resource to the picked editor type instead of adding another one
		const group = this._editorGroupsService.activeGroup;
		const editors = group.findEditors(resource);
		if (editors.length > 0 && !editors.some(editor => (editor.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id) === editorId)) {
			const editor = group.activeEditor && editors.includes(group.activeEditor) ? group.activeEditor : editors[0];
			const context: IEditorCommandsContext = { groupId: group.id, editorIndex: group.getIndexOfEditor(editor) };
			await this._commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, editorId, context);
		}
		await this._editorService.openEditor({ resource, options: editorOptions }, group);
	}
}
