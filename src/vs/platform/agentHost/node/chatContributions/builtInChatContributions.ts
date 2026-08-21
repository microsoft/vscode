/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
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

/** Registers all built-in chat contributions through the supplied instantiation service. */
export function registerBuiltInChatContributions(
	contributions: IAgentHostChatContributions,
	instantiationService: IInstantiationService,
): IDisposable {
	const registrations = new DisposableStore();
	registrations.add(contributions.registerContribution(instantiationService.createInstance(PersistedTurnUsageContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(WorktreeAnnouncementContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(CheckpointAndChangesetContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(QueueDrainContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(GitRefreshContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(TitleRefinementContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(MarkUnreadContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(MarkdownPlanRichLinksContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(ArtifactToolsContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(ChatSurfaceContribution)));
	registrations.add(contributions.registerContribution(instantiationService.createInstance(RenameInstructionContribution)));
	return registrations;
}
