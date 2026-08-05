/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DockedEditorInput } from '../../../common/dockedEditorInput.js';

export class EmptyFileEditorInput extends DockedEditorInput {

	static readonly ID = 'workbench.editors.agentSessions.emptyFile';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.emptyFile';
	static readonly ICON = Codicon.files;

	constructor(
		private workspaceFolderResource: URI | undefined = undefined,
	) {
		super();
	}

	override get resource(): URI | undefined {
		return this.workspaceFolderResource;
	}

	setWorkspaceFolderResource(resource: URI | undefined): void {
		if (!isEqual(this.workspaceFolderResource, resource)) {
			this.workspaceFolderResource = resource;
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
		return super.capabilities | EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal;
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
		return editorInput.resource ? JSON.stringify({ workspaceFolder: editorInput.resource.toString() }) : '';
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		if (!serializedEditor) {
			return instantiationService.createInstance(EmptyFileEditorInput);
		}
		try {
			const data = JSON.parse(serializedEditor) as { workspaceFolder?: string };
			const workspaceFolderResource = data.workspaceFolder ? URI.parse(data.workspaceFolder) : undefined;
			return instantiationService.createInstance(EmptyFileEditorInput, workspaceFolderResource);
		} catch {
			return undefined;
		}
	}
}
