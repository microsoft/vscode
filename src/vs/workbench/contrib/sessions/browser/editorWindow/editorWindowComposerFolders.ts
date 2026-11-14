/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatWindowComposerInit } from '../chatEditor/chatWindowComposer.js';

/** The folders new-session composers create sessions in, besides the folder each aims at, and how they show them. */
export type IEditorWindowComposerFolderOptions = Pick<IChatWindowComposerInit, 'allowedFolders' | 'getFolderPresentation'>;

/** A new-session composer that follows its host to another folder (see `ChatWindowComposerModel.retargetFolder`). */
export interface IEditorWindowRetargetableComposer {
	retargetFolder(folderUri: URI, from?: URI): boolean;
}

export const IEditorWindowComposerFoldersService = createDecorator<IEditorWindowComposerFoldersService>('editorWindowComposerFoldersService');

/**
 * The folders that the new-session composers of an editor window offer, such as those of the chat part and of the Chat
 * view's sessions: the window's folders, unless a feature offers others, such as the worktrees of the window's folder.
 * Reading them shows nothing, unlike the chat part, whose creation shows its chat as the window's.
 */
export interface IEditorWindowComposerFoldersService {
	readonly _serviceBrand: undefined;

	/**
	 * The folders its composers create sessions in, and how their workspace pickers show them. Live: a composer that took
	 * them follows the provider set later and the window's folders again once no provider is set.
	 */
	getComposerFolderOptions(): IEditorWindowComposerFolderOptions;

	/** Has the composers offer the folders `provider` gives until the returned disposable is disposed; the one set last applies. */
	setComposerFolderOptions(provider: () => IEditorWindowComposerFolderOptions): IDisposable;

	/** Counts `composer` among the window's composers that follow their host to another folder, until the returned disposable is disposed. */
	registerComposer(composer: IEditorWindowRetargetableComposer): IDisposable;

	/**
	 * Aims every registered composer still aimed at `from`, as its host aimed it, at `to`, such as the location the window's
	 * folder moved to: those of the chat part and of the Chat view alike. Not those aiming at a folder the user picked, nor
	 * those that send.
	 */
	retargetComposerFolders(to: URI, from: URI): void;
}

export class EditorWindowComposerFoldersService implements IEditorWindowComposerFoldersService {

	declare readonly _serviceBrand: undefined;

	private readonly _composers = new Set<{ readonly composer: IEditorWindowRetargetableComposer }>();

	/** One per call of {@link setComposerFolderOptions}, also of the same provider. */
	private readonly _providers = observableValue<readonly { readonly provider: () => IEditorWindowComposerFolderOptions }[]>(this, []);
	/** The options of the provider set last, if any. */
	private readonly _providedOptions: IObservable<IEditorWindowComposerFolderOptions | undefined>;
	private readonly _options: IEditorWindowComposerFolderOptions;

	constructor(@IWorkspaceContextService workspaceContextService: IWorkspaceContextService) {
		const windowFolders = observableFromEvent(this, workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.map(folder => folder.uri));
		this._providedOptions = derived(this, reader => this._providers.read(reader).at(-1)?.provider());
		this._options = {
			// A provider without folders lets its composers create sessions anywhere, as a window without folders does
			allowedFolders: derived(this, reader => {
				const provided = this._providedOptions.read(reader);
				return provided ? provided.allowedFolders?.read(reader) ?? [] : windowFolders.read(reader);
			}),
			getFolderPresentation: folderUri => this._providedOptions.get()?.getFolderPresentation?.(folderUri),
		};
	}

	getComposerFolderOptions(): IEditorWindowComposerFolderOptions {
		return this._options;
	}

	registerComposer(composer: IEditorWindowRetargetableComposer): IDisposable {
		const registration = { composer };
		this._composers.add(registration);
		return toDisposable(() => this._composers.delete(registration));
	}

	retargetComposerFolders(to: URI, from: URI): void {
		for (const { composer } of [...this._composers]) {
			composer.retargetFolder(to, from);
		}
	}

	setComposerFolderOptions(provider: () => IEditorWindowComposerFolderOptions): IDisposable {
		const registration = { provider };
		this._providers.set([...this._providers.get(), registration], undefined);
		return toDisposable(() => this._providers.set(this._providers.get().filter(candidate => candidate !== registration), undefined));
	}
}
