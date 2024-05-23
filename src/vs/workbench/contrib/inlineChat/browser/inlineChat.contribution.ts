/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import * as InlineChatActions from 'vs/workbench/contrib/inlineChat/browser/inlineChatActions';
import { INLINE_CHAT_ID } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { InlineChatNotebookContribution } from 'vs/workbench/contrib/inlineChat/browser/inlineChatNotebook';
import { IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { InlineChatSavingServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingServiceImpl';
import { InlineChatAccessibleView } from 'vs/workbench/contrib/inlineChat/browser/inlineChatAccessibleView';
import { IInlineChatSavingService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSavingService';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { InlineChatEnabler, InlineChatSessionServiceImpl } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionServiceImpl';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';


// --- browser

registerSingleton(IInlineChatSessionService, InlineChatSessionServiceImpl, InstantiationType.Delayed);
registerSingleton(IInlineChatSavingService, InlineChatSavingServiceImpl, InstantiationType.Delayed);

registerEditorContribution(INLINE_CHAT_ID, InlineChatController, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors


registerAction2(InlineChatActions.StartSessionAction);
registerAction2(InlineChatActions.CloseAction);
registerAction2(InlineChatActions.ConfigureInlineChatAction);
registerAction2(InlineChatActions.UnstashSessionAction);
registerAction2(InlineChatActions.DiscardHunkAction);
registerAction2(InlineChatActions.DiscardAction);
registerAction2(InlineChatActions.RerunAction);
registerAction2(InlineChatActions.CancelSessionAction);
registerAction2(InlineChatActions.MoveToNextHunk);
registerAction2(InlineChatActions.MoveToPreviousHunk);

registerAction2(InlineChatActions.ArrowOutUpAction);
registerAction2(InlineChatActions.ArrowOutDownAction);
registerAction2(InlineChatActions.FocusInlineChat);
registerAction2(InlineChatActions.ViewInChatAction);

registerAction2(InlineChatActions.ToggleDiffForChange);
registerAction2(InlineChatActions.AcceptChanges);

registerAction2(InlineChatActions.CopyRecordings);

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InlineChatNotebookContribution, LifecyclePhase.Restored);

registerWorkbenchContribution2(InlineChatEnabler.Id, InlineChatEnabler, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register(new InlineChatAccessibleView());
