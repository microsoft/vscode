/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostContentUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { buildSemanticDiffContentUri, getSemanticDiffGroupFiles, ISemanticDiffGroupFile } from '../../../../../../platform/agentHost/common/semanticDiffContent.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IResourceMultiDiffEditorInput } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ISemanticDiffCardActionContext, OpenSemanticDiffGroupChangesCommandId } from '../../../common/semanticDiffCard.js';

/**
 * Builds a multi-file diff editor for one semantic group. Each file compares
 * its version at the comparison's base with that version plus only the
 * group's hunks, which the agent host computes when the editor reads them.
 */
export function createSemanticDiffGroupEditorInput(context: ISemanticDiffCardActionContext, backendSession: URI, connectionAuthority: string): IResourceMultiDiffEditorInput | undefined {
	const { analysis } = context.report;
	const group = analysis.groups.find(candidate => candidate.id === context.groupId);
	if (!group) {
		return undefined;
	}
	const { comparison, baseRevision, targetRevision } = analysis.source;
	const contentUri = ({ file, hunks }: ISemanticDiffGroupFile, side: 'original' | 'modified') => toAgentHostContentUri(buildSemanticDiffContentUri({
		sessionUri: backendSession.toString(),
		comparison,
		baseRevision,
		targetRevision,
		side,
		path: file.path,
		oldPath: file.oldPath,
		status: file.status,
		hunks,
	}, `/${side === 'original' ? file.oldPath ?? file.path : file.path}`), connectionAuthority);
	return {
		multiDiffSource: URI.from({ scheme: 'multi-diff-editor', path: `/semantic-diff/${context.toolCallId}/${group.id}`, query: context.sessionResource.toString() }),
		label: group.title,
		resources: getSemanticDiffGroupFiles(analysis, group.id).map(groupFile => ({
			original: { resource: groupFile.file.status === 'added' ? undefined : contentUri(groupFile, 'original') },
			modified: { resource: groupFile.file.status === 'deleted' ? undefined : contentUri(groupFile, 'modified') },
		})),
	};
}

CommandsRegistry.registerCommand(OpenSemanticDiffGroupChangesCommandId, async (accessor, context?: ISemanticDiffCardActionContext) => {
	if (!context) {
		return;
	}
	const identity = accessor.get(IAgentHostConnectionsService).resolveSessionResourceIdentity(context.sessionResource);
	const input = identity && createSemanticDiffGroupEditorInput(context, identity.backendSession, identity.connectionAuthority);
	if (!input) {
		accessor.get(INotificationService).error(localize('semanticDiff.openChangesUnavailable', "The changes of this group cannot be opened because its agent session is unavailable."));
		return;
	}
	await accessor.get(IEditorService).openEditor(input);
});
