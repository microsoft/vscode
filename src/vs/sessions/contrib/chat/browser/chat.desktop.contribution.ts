/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DefaultChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chat/defaultChatViewFactory.js';
import { IChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import '../../../../workbench/contrib/chat/browser/chatDefaultPresentation.contribution.js';
import './chatBackground.contribution.js';
import { SessionsChatPetAchievementContribution } from './chatPetAchievements.js';
import { RegisterDefaultSessionTaskRunnersContribution } from './registerDefaultSessionTaskRunners.js';
import { RunScriptContribution } from './runScriptAction.js';
import { WorktreeCreatedTaskDispatcher } from './worktreeCreatedTaskDispatcher.js';
import { SessionsChatAccessibilityHelp } from './sessionsChatAccessibilityHelp.js';

// Chat contributions that need the desktop (and desktop-web) workbench: running
// scripts and tasks in a terminal, chat backgrounds, and the chat pet. The shared registrations
// live in chat.contribution.ts; the phone bundle imports that file but not this one.

registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(RegisterDefaultSessionTaskRunnersContribution.ID, RegisterDefaultSessionTaskRunnersContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorktreeCreatedTaskDispatcher.ID, WorktreeCreatedTaskDispatcher, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsChatPetAchievementContribution.ID, SessionsChatPetAchievementContribution, WorkbenchPhase.AfterRestored);
registerSingleton(IChatViewFactory, DefaultChatViewFactory, InstantiationType.Delayed);
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp());
