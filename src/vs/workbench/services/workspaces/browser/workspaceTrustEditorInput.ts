/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Schemas } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { EditorInputCapabilities, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

const WorkspaceTrustEditorIcon = registerIcon('workspace-trust-editor-label-icon', Codicon.shield, localize('workspaceTrustEditorLabelIcon', 'Icon of the workspace trust editor label.'));

export class WorkspaceTrustEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.workspaceTrust';

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	override get typeId(): string {
		return WorkspaceTrustEditorInput.ID;
	}

	readonly resource: URI = URI.from({
		scheme: Schemas.vscodeWorkspaceTrust,
		path: `workspaceTrustEditor`
	});

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof WorkspaceTrustEditorInput;
	}

	override getName(): string {
		return localize('workspaceTrustEditorInputName', "Workspace Trust");
	}

	override getIcon(): ThemeIcon {
		return WorkspaceTrustEditorIcon;
	}
}
