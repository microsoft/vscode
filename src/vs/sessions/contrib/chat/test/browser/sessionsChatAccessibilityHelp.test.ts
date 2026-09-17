/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SESSION_ARCHIVE_NUDGE_SETTING } from '../../browser/sessionArchiveNudge.js';
import { SessionsChatAccessibilityHelp } from '../../browser/sessionsChatAccessibilityHelp.js';

suite('SessionsChatAccessibilityHelp', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const enabled of [false, true]) {
		test(`workflow discovery and explicit start help respects enablement (${enabled})`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({ 'chat.workflows.enabled': enabled });
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent();
			assert.deepStrictEqual({
				discovery: content.includes('Workflow picker beside the workspace controls'),
				deferredInputs: content.includes('provide missing inputs in the checkpoint that needs them'),
				explicitStart: content.includes('Selecting a workflow does not start it'),
				apply: content.includes('Moving the stopping point requires Apply'),
				messageDetails: content.includes('Expanding a message does not start or continue work'),
				agentMessage: content.includes('Tab to Agent Message'),
				sidebar: content.includes('checkpoint sidebar beside the chat, or below it in a narrow view, without covering messages'),
				closeSidebar: content.includes('press Escape in the sidebar to close it and return focus'),
			}, { discovery: enabled, deferredInputs: enabled, explicitStart: enabled, apply: enabled, messageDetails: enabled, agentMessage: enabled, sidebar: enabled, closeSidebar: enabled });
		});
	}

	for (const { wording, action, dismiss } of [
		{ wording: ChatSessionArchiveActionWording.Archive, action: 'Archive', dismiss: 'Dismiss Archive Suggestion' },
		{ wording: ChatSessionArchiveActionWording.MarkAsDone, action: 'Mark as Done', dismiss: 'Dismiss Mark as Done Suggestion' },
	]) {
		test(`describes the actual dismiss control and Escape for ${action}`, () => {
			const instantiationService = store.add(new TestInstantiationService());
			const configuration = new TestConfigurationService({
				[SESSION_ARCHIVE_NUDGE_SETTING]: true,
				[ChatSessionArchiveActionWordingSettingId]: wording,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			instantiationService.stub(IConfigurationService, configuration);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() { }());
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer: mainWindow.document.createElement('div') });
			const provider = store.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			const content = provider.provideContent();
			const nudgeHelp = content.split('\n').find(line => line.includes('suggestion may appear'));

			assert.deepStrictEqual({
				controls: nudgeHelp?.includes(`Use Tab or Shift+Tab to reach ${action}, Configure Automatic Cleanup, or ${dismiss}, then Enter or Space to activate it.`),
				cleanupSettings: nudgeHelp?.includes('Configure Automatic Cleanup opens the settings for automatically archiving inactive merged sessions and permanently deleting automatically archived merged sessions.'),
				escape: nudgeHelp?.includes(`${dismiss}, or Escape while the suggestion is focused, hides the suggestion`),
				focus: nudgeHelp?.includes('returns focus to the chat input'),
				close: nudgeHelp?.includes('Close'),
				onboarding: content.includes('The action waits until you activate the highlighted action, activate Understood, or press Escape to end the spotlight.'),
			}, { controls: true, cleanupSettings: true, escape: true, focus: true, close: false, onboarding: true });
		});
	}
});
