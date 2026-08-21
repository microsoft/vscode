/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { ArtifactToolsContribution } from './artifactTools/artifactToolsContribution.js';
import { ChatSurfaceContribution } from './chatSurface/chatSurfaceContribution.js';
import { CheckpointAndChangesetContribution } from './checkpointAndChangeset/checkpointAndChangesetContribution.js';
import { GitRefreshContribution } from './gitRefresh/gitRefreshContribution.js';
import { MarkdownPlanRichLinksContribution } from './markdownPlanRichLinks/markdownPlanRichLinksContribution.js';
import { MarkUnreadContribution } from './markUnread/markUnreadContribution.js';
import { PersistedTurnUsageContribution } from './persistedTurnUsage/persistedTurnUsageContribution.js';
import { QueueDrainContribution } from './queueDrain/queueDrainContribution.js';
import { RenameInstructionContribution } from './renameInstruction/renameInstructionContribution.js';
import { TitleRefinementContribution } from './titleRefinement/titleRefinementContribution.js';
import { WorktreeAnnouncementContribution } from './worktreeAnnouncement/worktreeAnnouncementContribution.js';

/** Registers all built-in chat contribution constructors. */
export function registerBuiltInChatContributions(
	contributions: IAgentHostChatContributions,
): IDisposable {
	const registrations = new DisposableStore();
	registrations.add(contributions.registerContribution(PersistedTurnUsageContribution));
	registrations.add(contributions.registerContribution(WorktreeAnnouncementContribution));
	registrations.add(contributions.registerContribution(CheckpointAndChangesetContribution));
	registrations.add(contributions.registerContribution(QueueDrainContribution));
	registrations.add(contributions.registerContribution(GitRefreshContribution));
	registrations.add(contributions.registerContribution(TitleRefinementContribution));
	registrations.add(contributions.registerContribution(MarkUnreadContribution));
	registrations.add(contributions.registerContribution(MarkdownPlanRichLinksContribution));
	registrations.add(contributions.registerContribution(ArtifactToolsContribution));
	registrations.add(contributions.registerContribution(ChatSurfaceContribution));
	registrations.add(contributions.registerContribution(RenameInstructionContribution));
	return registrations;
}
