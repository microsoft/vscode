/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatWindowComposerInit } from '../chatEditor/chatWindowComposer.js';

/** The folders new-session composers create sessions in, besides the folder each aims at, and how they show them. */
export type IEditorWindowComposerFolderOptions = Pick<IChatWindowComposerInit, 'allowedFolders' | 'getFolderPresentation'>;

export const IEditorWindowComposerFoldersService = createDecorator<IEditorWindowComposerFoldersService>('editorWindowComposerFoldersService');

/**
 * The folders that the new-session composers of an editor window offer, such as those of the chat part and of the Chat
 * view's sessions: the window's folders, unless a feature offers others, such as the worktrees of the window's folder.
 * Reading them shows nothing, unlike the chat part, whose creation shows its chat as the window's.
 */
export interface IEditorWindowComposerFoldersService {
	readonly _serviceBrand: undefined;

	/** The folders its composers create sessions in, and how their workspace pickers show them. */
	getComposerFolderOptions(): IEditorWindowComposerFolderOptions;

	/** Has the composers offer the folders `provider` gives until the returned disposable is disposed; the one set last applies. */
	setComposerFolderOptions(provider: () => IEditorWindowComposerFolderOptions): IDisposable;
}

export class EditorWindowComposerFoldersService implements IEditorWindowComposerFoldersService {

	declare readonly _serviceBrand: undefined;

	/** One per call of {@link setComposerFolderOptions}, also of the same provider. */
	private readonly _providers: { readonly provider: () => IEditorWindowComposerFolderOptions }[] = [];
	private readonly _windowFolders: IObservable<readonly URI[]>;

	constructor(@IWorkspaceContextService workspaceContextService: IWorkspaceContextService) {
		this._windowFolders = observableFromEvent(this, workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.map(folder => folder.uri));
	}

	getComposerFolderOptions(): IEditorWindowComposerFolderOptions {
		return this._providers.at(-1)?.provider() ?? { allowedFolders: this._windowFolders };
	}

	setComposerFolderOptions(provider: () => IEditorWindowComposerFolderOptions): IDisposable {
		const registration = { provider };
		this._providers.push(registration);
		return toDisposable(() => {
			const index = this._providers.indexOf(registration);
			if (index >= 0) {
				this._providers.splice(index, 1);
			}
		});
	}
}
