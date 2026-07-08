/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';

/**
 * Editor input for the Agents window Changes tab. It wraps the session's
 * multi-diff source and exposes the resolved multi-diff view model so the
 * {@link SessionChangesEditor} can render the diffs beneath its own header.
 */
export class SessionChangesEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.agentSessions.sessionChanges';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.sessionChanges';

	private _innerInput: MultiDiffEditorInput | undefined;

	constructor(
		readonly multiDiffSource: URI,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	override get resource(): URI {
		return this.multiDiffSource;
	}

	override get typeId(): string {
		return SessionChangesEditorInput.ID;
	}

	override get editorId(): string {
		return SessionChangesEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}

	override getName(): string {
		return localize('sessionChangesEditor.name', "Changes");
	}

	override getIcon(): ThemeIcon {
		return Codicon.diffMultiple;
	}

	override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	private get innerInput(): MultiDiffEditorInput {
		if (!this._innerInput) {
			this._innerInput = this._register(MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
				multiDiffSource: this.multiDiffSource,
				label: this.getName(),
			}, this.instantiationService));
		}
		return this._innerInput;
	}

	async getViewModel(): Promise<MultiDiffEditorViewModel> {
		return this.innerInput.getViewModel();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}
		return otherInput instanceof SessionChangesEditorInput
			&& otherInput.multiDiffSource.toString() === this.multiDiffSource.toString();
	}
}

interface ISerializedSessionChangesEditorInput {
	readonly multiDiffSourceUri: string;
}

export class SessionChangesEditorSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): editorInput is SessionChangesEditorInput {
		return editorInput instanceof SessionChangesEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!this.canSerialize(editorInput)) {
			return undefined;
		}
		const data: ISerializedSessionChangesEditorInput = { multiDiffSourceUri: editorInput.multiDiffSource.toString() };
		return JSON.stringify(data);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data = JSON.parse(serializedEditor) as ISerializedSessionChangesEditorInput;
			return instantiationService.createInstance(SessionChangesEditorInput, URI.parse(data.multiDiffSourceUri));
		} catch {
			return undefined;
		}
	}
}
