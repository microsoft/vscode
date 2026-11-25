/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorResourceAccessor, isDiffEditorInput, SideBySideEditor } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { isGroupEditorOpenEvent } from '../../../../common/editor/editorGroupModel.js';
import { AbstractTextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { classifyCustomizationFile, CustomizationFileEcosystem, CustomizationFileKind, CustomizationFileScope, getCustomizationFileScope } from '../../common/promptSyntax/customizationFileClassification.js';

type CustomizationFileEditorKind = 'text' | 'diff' | 'custom';

type ChatCustomizationFileOpenedEvent = {
	kind: CustomizationFileKind;
	ecosystem: CustomizationFileEcosystem;
	scope: CustomizationFileScope;
	editorKind: CustomizationFileEditorKind;
};

type ChatCustomizationFileOpenedClassification = {
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded kind of AI customization file, derived from well-known file names and folders, for example skill, instructions, agentsMd or claudeMd.' };
	ecosystem: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The tool convention the file follows, derived from its configuration folder or file name, for example github, claude, agents or codex.' };
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the file is in a workspace folder, in the user home or user data folder, or elsewhere.' };
	editorKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the file opened in a text editor, a diff editor or a custom editor such as a rendered preview.' };
	owner: 'benibenj';
	comment: 'Tracks when an AI customization file (instructions, prompts, agents, skills, hooks, AGENTS.md, CLAUDE.md and similar) is opened in an editor, to understand how users look at customizations.';
};

/**
 * Sends a telemetry event when an editor opens an AI customization file. Only bounded
 * kinds are reported, never file or folder names.
 */
export class ChatCustomizationFileTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatCustomizationFileTelemetry';

	constructor(
		@IEditorService editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IPathService private readonly pathService: IPathService,
	) {
		super();

		this._register(editorService.onDidEditorsChange(({ event }) => {
			if (isGroupEditorOpenEvent(event)) {
				this.onDidOpenEditor(event.editor);
			}
		}));
	}

	private onDidOpenEditor(editor: EditorInput): void {
		const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (!resource) {
			return;
		}

		const classification = classifyCustomizationFile(resource);
		if (!classification) {
			return;
		}

		this.telemetryService.publicLog2<ChatCustomizationFileOpenedEvent, ChatCustomizationFileOpenedClassification>('chatCustomizationFileOpened', {
			kind: classification.kind,
			ecosystem: classification.ecosystem,
			scope: getCustomizationFileScope(resource, !!this.workspaceContextService.getWorkspaceFolder(resource), this.pathService.resolvedUserHome),
			editorKind: isDiffEditorInput(editor) ? 'diff' : editor instanceof AbstractTextResourceEditorInput ? 'text' : 'custom',
		});
	}
}
