/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IObservable } from '../../../../base/common/observable.js';
import { normalizePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorOpenSource } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { extractSelection, IExternalOpener, IExternalUriResolver, IOpener, IOpenerService, IResolvedExternalUri, IValidator, OpenExternalOptions, OpenInternalOptions, OpenOptions, ResolveExternalUriOptions } from '../../../../platform/opener/common/opener.js';
import { IEditorGroup, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../changes/common/sessionChangesService.js';

/**
 * The opener of a chat window: what its chat opens as an editor, such as a file of a link in a response, opens in the
 * active group of the window's editor area (`editorArea`, whose own editor service is `editorService`), which shows
 * (`showEditor`) if hidden, whichever window has focus; also when it is open in the main window, which is not revealed
 * instead, or already in the hidden editor area. Anything else, such as web links and commands, opens as anywhere.
 */
export class ChatWindowOpenerService implements IOpenerService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _openerService: IOpenerService,
		private readonly _editorService: IEditorService,
		private readonly _editorArea: IEditorPart,
		private readonly _showEditor: () => void,
		private readonly _fileService: IFileService,
	) { }

	async open(target: URI | string, openOptions?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
		const options = openOptions as OpenOptions | undefined;
		const resource = typeof target === 'string' ? URI.parse(target) : target;
		if (options?.openExternal || resource.scheme === Schemas.command || !this._fileService.hasProvider(resource)) {
			return this._openerService.open(target, openOptions);
		}
		// As the workbench's editor opener opens it, in the group of the window, as without one the group of the focused
		// window would be found, also to the side, which would be beside the focused window's group.
		const { selection, uri } = extractSelection(resource);
		await this._editorService.openEditor({
			resource: uri.scheme === Schemas.file ? normalizePath(uri) : uri,
			options: { selection, source: options?.fromUserGesture ? EditorOpenSource.USER : EditorOpenSource.API, ...options?.editorOptions },
		}, this._editorArea.activeGroup);
		this._showEditor();
		return true;
	}

	registerOpener(opener: IOpener): IDisposable { return this._openerService.registerOpener(opener); }
	registerValidator(validator: IValidator): IDisposable { return this._openerService.registerValidator(validator); }
	registerExternalUriResolver(resolver: IExternalUriResolver): IDisposable { return this._openerService.registerExternalUriResolver(resolver); }
	setDefaultExternalOpener(opener: IExternalOpener): void { this._openerService.setDefaultExternalOpener(opener); }
	registerExternalOpener(opener: IExternalOpener): IDisposable { return this._openerService.registerExternalOpener(opener); }
	resolveExternalUri(resource: URI, options?: ResolveExternalUriOptions): Promise<IResolvedExternalUri> { return this._openerService.resolveExternalUri(resource, options); }
}

/**
 * The changes of a chat window: its chat's Changes editor, such as from its changes pill, opens in the window's editor
 * area (in `getGroup()`, its active group, unless a group is given), which shows (`showEditor`) if hidden, whichever
 * window has focus.
 */
export class ChatWindowSessionChangesService implements ISessionChangesService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _sessionChangesService: ISessionChangesService,
		private readonly _getGroup: () => IEditorGroup,
		private readonly _showEditor: () => void,
	) { }

	get activeSessionUncommittedChangesCountObs(): IObservable<number | undefined> { return this._sessionChangesService.activeSessionUncommittedChangesCountObs; }

	getChangesEditorResource(sessionResource: URI, chatResource?: URI): URI { return this._sessionChangesService.getChangesEditorResource(sessionResource, chatResource); }
	getSessionResource(editorResource: URI): URI | undefined { return this._sessionChangesService.getSessionResource(editorResource); }
	getScopedChatResource(editorResource: URI): URI | undefined { return this._sessionChangesService.getScopedChatResource(editorResource); }

	async openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions, group?: PreferredGroup): Promise<IEditorGroup | undefined> {
		const openedIn = await this._sessionChangesService.openChangesEditor(sessionResource, options, group ?? this._getGroup());
		if (openedIn) {
			this._showEditor();
		}
		return openedIn;
	}
}

/**
 * Sets the services of a chat window through which what its chat opens, such as files of links in its responses and its
 * Changes editor, opens in the window's editor area (`editorArea`, whose own editor service is `editorService`), which
 * shows (`showEditor`): by the window that hosts the chat, not by the one with focus.
 */
export function setChatWindowOpenServices(services: ServiceCollection, editorArea: IEditorPart, editorService: IEditorService, showEditor: () => void, openerService: IOpenerService, fileService: IFileService, sessionChangesService: ISessionChangesService): void {
	services.set(IOpenerService, new ChatWindowOpenerService(openerService, editorService, editorArea, showEditor, fileService));
	services.set(ISessionChangesService, new ChatWindowSessionChangesService(sessionChangesService, () => editorArea.activeGroup, showEditor));
}
