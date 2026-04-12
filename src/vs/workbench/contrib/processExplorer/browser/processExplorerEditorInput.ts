/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

const processExplorerEditorIcon = registerIcon('process-explorer-editor-label-icon', Codicon.serverProcess, localize('processExplorerEditorLabelIcon', 'Icon of the process explorer editor label.'));

export class ProcessExplorerEditorInput extends EditorInput {

	static readonly ID = 'workbench.editor.processExplorer';

	static readonly RESOURCE = URI.from({
		scheme: 'process-explorer',
		path: 'default'
	});

	private static _instance: ProcessExplorerEditorInput;
	static get instance() {
		if (!ProcessExplorerEditorInput._instance || ProcessExplorerEditorInput._instance.isDisposed()) {
			ProcessExplorerEditorInput._instance = new ProcessExplorerEditorInput();
		}

		return ProcessExplorerEditorInput._instance;
	}

	override get typeId(): string { return ProcessExplorerEditorInput.ID; }

	override get editorId(): string | undefined { return ProcessExplorerEditorInput.ID; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }

	readonly resource = ProcessExplorerEditorInput.RESOURCE;

	override getName(): string {
		return localize('processExplorerInputName', "Process Explorer");
	}

	override getIcon(): ThemeIcon {
		return processExplorerEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof ProcessExplorerEditorInput;
	}
}
