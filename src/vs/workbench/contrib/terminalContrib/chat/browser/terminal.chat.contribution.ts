/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

import 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TerminalInlineChatAccessibleViewContribution } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatAccessibleView';
import { TerminalInlineChatAccessibilityHelpContribution } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatAccessibilityHelp';
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(TerminalInlineChatAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(TerminalInlineChatAccessibilityHelpContribution, LifecyclePhase.Eventually);
