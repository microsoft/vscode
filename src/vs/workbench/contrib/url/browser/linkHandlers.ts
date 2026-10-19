/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { EditorOpenSource, ITextEditorOptions, ITextEditorSelection } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { extractSelection, ILinkHandler, ILinkHandlerProvider, IOpenerService, OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorCommandsContext } from '../../../common/editor.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

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
