/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Importing this module registers all built-in chat contributions with the
// AgentHostChatContributionRegistry (via each contribution module's bottom-of-file
// `register(...)` side effect). Import it wherever the registry must be populated
// so adding a new contribution is just a subfolder plus an import here. Each
// contribution has its own subfolder so it can grow without path churn.
import './markUnread/markUnreadContribution.js';
import './checkpointAndChangeset/checkpointAndChangesetContribution.js';
import './queueDrain/queueDrainContribution.js';
import './gitRefresh/gitRefreshContribution.js';
import './titleRefinement/titleRefinementContribution.js';
import './markdownPlanRichLinks/markdownPlanRichLinksContribution.js';
import './artifactTools/artifactToolsContribution.js';
import './chatSurface/chatSurfaceContribution.js';
import './renameInstruction/renameInstructionContribution.js';
