/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { DockedEditorInput } from '../../../common/dockedEditorInput.js';

export class AgentDiagnosticsEditorInput extends DockedEditorInput {

	static readonly ID = 'workbench.input.agentSessions.agentDiagnostics';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.agentDiagnostics';
	override readonly reserveEditorHeaderSpace = false;

	override get resource(): undefined {
		return undefined;
	}

	override get typeId(): string {
		return AgentDiagnosticsEditorInput.ID;
	}

	override get editorId(): string {
		return AgentDiagnosticsEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal;
	}

	override getName(): string {
		return localize('agentDiagnosticsEditor.name', "Diagnostics");
	}

	override getIcon(): ThemeIcon {
		return Codicon.pulse;
	}

	override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	override canReopen(): boolean {
		return true;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof AgentDiagnosticsEditorInput;
	}
}

export class AgentDiagnosticsEditorSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): editorInput is AgentDiagnosticsEditorInput {
		return editorInput instanceof AgentDiagnosticsEditorInput;
	}

	serialize(): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): AgentDiagnosticsEditorInput {
		return instantiationService.createInstance(AgentDiagnosticsEditorInput);
	}
}
