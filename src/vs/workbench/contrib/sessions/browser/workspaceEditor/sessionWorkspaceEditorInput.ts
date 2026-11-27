/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { extUri } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IRecentSessionWorkspace } from '../../common/sessionWorkspaces.js';

/** What the Workspace editor edits: an existing workspace, or a new one that it creates. */
export type SessionWorkspaceEditorTarget =
	| { readonly kind: 'edit'; readonly workspace: IRecentSessionWorkspace }
	| { readonly kind: 'new' };

/**
 * The input of the Workspace editor, which always opens in a modal that fits its content. Its name is the workspace's
 * name, which the editor updates as the user types it. A new workspace becomes the workspace that the editor created.
 */
export class SessionWorkspaceEditorInput extends EditorInput implements IModalEditorOptionsProvider {

	static readonly ID = 'sessions.input.workspace';

	readonly resource = undefined;

	private _target: SessionWorkspaceEditorTarget;
	private _name: string;
	private readonly _closed = new DeferredPromise<IRecentSessionWorkspace | undefined>();
	private _pendingApply: Promise<unknown> = Promise.resolve();

	constructor(target: SessionWorkspaceEditorTarget) {
		super();
		this._target = target;
		this._name = target.kind === 'edit' ? target.workspace.name : '';
	}

	get target(): SessionWorkspaceEditorTarget { return this._target; }

	/** The workspace that the editor edits: the one it was opened on, or the one it created. */
	get workspace(): IRecentSessionWorkspace | undefined { return this._target.kind === 'edit' ? this._target.workspace : undefined; }

	override get typeId(): string {
		return SessionWorkspaceEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.RequiresModal;
	}

	override getName(): string {
		return this._name || localize('workspaceEditor.newTitle', "New Workspace");
	}

	override getIcon(): ThemeIcon {
		return Codicon.folderLibrary;
	}

	/** Sets the name that titles the editor, as the user types it. */
	setName(name: string): void {
		if (name !== this._name) {
			this._name = name;
			this._onDidChangeLabel.fire();
		}
	}

	/** Records the workspace as the editor saved it, which a new workspace becomes. */
	didApply(workspace: IRecentSessionWorkspace): void {
		this._target = { kind: 'edit', workspace };
		this.setName(workspace.name);
	}

	/** Resolves once the editor closed and saved pending changes, with the workspace, or `undefined` if none was created. */
	whenClosed(): Promise<IRecentSessionWorkspace | undefined> {
		return this._closed.p;
	}

	/** Tracks a save that the editor still makes after it let go of this input, which {@link whenClosed} waits for. */
	trackApply(apply: Promise<unknown>): void {
		this._pendingApply = Promise.all([this._pendingApply, apply.catch(() => undefined)]);
	}

	override dispose(): void {
		if (!this._closed.isSettled) {
			void this._pendingApply.finally(() => this._closed.complete(this.workspace));
		}
		super.dispose();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}
		if (!(otherInput instanceof SessionWorkspaceEditorInput)) {
			return false;
		}
		// A new workspace is only edited by the editor that creates it
		const workspace = this.workspace;
		const other = otherInput.workspace;
		return !!workspace && !!other && isSameWorkspace(workspace, other.uri);
	}

	/**
	 * A modal that fits its content, as a dialog does, and stays a modal: it cannot be maximized, moved into the editor
	 * area or dragged out. Its compact header shows the workspace's name and Close.
	 */
	getModalEditorOptions(): IModalEditorOptions {
		return {
			alwaysModal: true,
			canMoveToEditorArea: false,
			canMaximize: false,
			compactHeader: true,
			fitToContent: true,
		};
	}
}

/** Whether `uri` is the workspace's file, or one that the workspace had before a rename. */
export function isSameWorkspace(workspace: IRecentSessionWorkspace, uri: URI): boolean {
	return extUri.isEqual(workspace.uri, uri) || !!workspace.previousUris?.some(previous => extUri.isEqual(previous, uri));
}
