/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { DockedEditorInput } from '../../../common/dockedEditorInput.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';

export class EmptyFileEditorInput extends DockedEditorInput {

	static readonly ID = 'workbench.editors.agentSessions.emptyFile';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.emptyFile';
	static readonly ICON = Codicon.files;

	constructor(
		private _workspace: ISessionWorkspace | undefined,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._register(layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.EDITOR_PART) {
				this._onDidChangeLabel.fire();
				this._onDidChangeCapabilities.fire();
			}
		}));
	}

	override get resource(): URI | undefined {
		// TODO: Multi-root sessions need a workspace-level breadcrumb that exposes every root.
		const workspaceFolderResource = this._workspace?.folders[0]?.workingDirectory;
		return this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) ? workspaceFolderResource : undefined;
	}

	get workspace(): ISessionWorkspace | undefined {
		return this._workspace;
	}

	setWorkspace(workspace: ISessionWorkspace | undefined): void {
		if (this._workspace !== workspace) {
			this._workspace = workspace;
			this._onDidChangeLabel.fire();
		}
	}

	override get typeId(): string {
		return EmptyFileEditorInput.ID;
	}

	override get editorId(): string {
		return EmptyFileEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		const capabilities = super.capabilities | EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal;
		return this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) ? capabilities : capabilities | EditorInputCapabilities.CannotClose;
	}

	override getName(): string {
		return localize('emptyFileEditor.name', "Files");
	}

	override getIcon(): ThemeIcon {
		return EmptyFileEditorInput.ICON;
	}

	override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	override canReopen(): boolean {
		return true;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof EmptyFileEditorInput;
	}
}

export class EmptyFileEditorSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): editorInput is EmptyFileEditorInput {
		return editorInput instanceof EmptyFileEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!this.canSerialize(editorInput)) {
			return undefined;
		}
		const workspace = editorInput.workspace;
		if (!workspace) {
			return '';
		}
		return JSON.stringify({
			uri: workspace.uri.toString(),
			label: workspace.label,
			description: workspace.description,
			group: workspace.group,
			folders: workspace.folders.map(folder => ({
				root: folder.root.toString(),
				workingDirectory: folder.workingDirectory.toString(),
				name: folder.name,
				description: folder.description,
			})),
			requiresWorkspaceTrust: workspace.requiresWorkspaceTrust,
			isVirtualWorkspace: workspace.isVirtualWorkspace,
		});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		if (!serializedEditor) {
			return instantiationService.createInstance(EmptyFileEditorInput, undefined);
		}
		try {
			const data = JSON.parse(serializedEditor) as ISerializedEmptyFileEditorWorkspace;
			const workspace: ISessionWorkspace = {
				...data,
				uri: URI.parse(data.uri),
				icon: Codicon.repo,
				folders: data.folders.map(folder => ({
					...folder,
					root: URI.parse(folder.root),
					workingDirectory: URI.parse(folder.workingDirectory),
				})),
			};
			return instantiationService.createInstance(EmptyFileEditorInput, workspace);
		} catch {
			return undefined;
		}
	}
}

interface ISerializedEmptyFileEditorWorkspace {
	readonly uri: string;
	readonly label: string;
	readonly description?: string;
	readonly group?: string;
	readonly folders: readonly {
		readonly root: string;
		readonly workingDirectory: string;
		readonly name: string;
		readonly description: string | undefined;
	}[];
	readonly requiresWorkspaceTrust: boolean;
	readonly isVirtualWorkspace: boolean;
}
