/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileOperation, IFileService } from '../../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorResourceAccessor, EditorsOrder, GroupIdentifier, isDiffEditorInput, SideBySideEditor } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { isGroupEditorOpenEvent } from '../../../../common/editor/editorGroupModel.js';
import { AbstractTextResourceEditorInput } from '../../../../common/editor/textResourceEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { classifyCustomizationFile, CustomizationFileEcosystem, CustomizationFileKind, CustomizationFileScope, getCustomizationFileScope } from '../../common/promptSyntax/customizationFileClassification.js';

type CustomizationFileEditorKind = 'text' | 'diff' | 'custom';

/**
 * How long after a file move or rename an editor opened for the new location is treated as
 * the replacement of the already open editor.
 */
const MOVED_EDITOR_REPLACEMENT_WINDOW = 2000;

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

	private recentMoves: { readonly target: URI; readonly time: number }[] = [];

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IFileService fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IPathService private readonly pathService: IPathService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();

		// Renaming or moving an open file replaces its editor, which isn't a new open
		this._register(fileService.onDidRunOperation(e => {
			if (e.isOperation(FileOperation.MOVE) && this.editorService.editors.some(editor => {
				const resource = getEditorResource(editor);
				return !!resource && this.uriIdentityService.extUri.isEqualOrParent(resource, e.resource);
			})) {
				this.recentMoves.push({ target: e.target.resource, time: Date.now() });
			}
		}));

		this._register(editorService.onDidEditorsChange(({ groupId, event }) => {
			if (isGroupEditorOpenEvent(event)) {
				this.onDidOpenEditor(groupId, event.editor).catch(onUnexpectedError);
			}
		}));
	}

	private async onDidOpenEditor(groupId: GroupIdentifier, editor: EditorInput): Promise<void> {
		const resource = getEditorResource(editor);
		if (!resource) {
			return;
		}

		const classification = classifyCustomizationFile(resource);
		if (!classification) {
			return;
		}

		const now = Date.now();
		this.recentMoves = this.recentMoves.filter(move => now - move.time < MOVED_EDITOR_REPLACEMENT_WINDOW);
		if (this.recentMoves.some(move => this.uriIdentityService.extUri.isEqualOrParent(resource, move.target))) {
			return;
		}

		// Moving, copying or splitting an editor opens it in another group while it is still open
		const editorKind = getEditorKind(editor);
		const isAlreadyOpen = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).some(other =>
			(other.groupId !== groupId || other.editor !== editor) &&
			getEditorKind(other.editor) === editorKind &&
			this.uriIdentityService.extUri.isEqual(getEditorResource(other.editor), resource)
		);
		if (isAlreadyOpen) {
			return;
		}

		// Snapshots such as staged changes (`git:`) keep the file's path but not its location
		const location = resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote || resource.scheme === Schemas.vscodeUserData
			? resource
			: resource.with({ scheme: this.pathService.defaultUriScheme, query: '', fragment: '' });
		const userHome = location.scheme === Schemas.file ? this.pathService.userHome({ preferLocal: true }) : await this.pathService.userHome();

		this.telemetryService.publicLog2<ChatCustomizationFileOpenedEvent, ChatCustomizationFileOpenedClassification>('chatCustomizationFileOpened', {
			kind: classification.kind,
			ecosystem: classification.ecosystem,
			scope: getCustomizationFileScope(location, !!this.workspaceContextService.getWorkspaceFolder(location), userHome, this.uriIdentityService.extUri),
			editorKind,
		});
	}
}

function getEditorResource(editor: EditorInput): URI | undefined {
	return EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
}

function getEditorKind(editor: EditorInput): CustomizationFileEditorKind {
	return isDiffEditorInput(editor) ? 'diff' : editor instanceof AbstractTextResourceEditorInput ? 'text' : 'custom';
}
