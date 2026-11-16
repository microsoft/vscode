/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatScheduledRequest } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ICustomizationHarnessService } from '../../../../contrib/chat/common/customizationHarnessService.js';
import { IPromptsService } from '../../../../contrib/chat/common/promptSyntax/service/promptsService.js';
import { ILanguageModelToolsService } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { MockLanguageModelToolsService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsService.js';
import { ScheduledChatEditor, ScheduledChatEditorInput } from '../../../../contrib/sessions/browser/scheduledChatEditor.js';
import { registerChatFixtureServices } from '../chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureDomCondition } from '../fixtureUtils.js';
import '../../../../contrib/sessions/browser/chat/media/chatView.css';

async function renderScheduledChatEditor({ container, disposableStore, theme }: ComponentFixtureContext, completed: boolean): Promise<void> {
	container.classList.add('agent-sessions-workbench');
	container.style.width = '800px';
	container.style.height = '450px';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(ILanguageModelToolsService, disposableStore.add(new MockLanguageModelToolsService()));
			reg.definePartialInstance(IPromptsService, { listAgentInstructions: async () => [] });
			reg.definePartialInstance(ICustomizationHarnessService, { onDidChangeSlashCommands: Event.None });
			reg.defineInstance(IConfigurationService, new TestConfigurationService({
				chat: { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'off' } },
				editor: { fontFamily: 'monospace', fontLigatures: false },
			}));
		},
	});
	const item = observableValue<IChatScheduledRequest | undefined>('scheduled request', {
		id: 'scheduled-preview',
		text: 'Review the latest build results and summarize any failures.',
		description: 'Scheduled for tomorrow morning',
		runAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
		attachments: ['build-notes.md'],
		actions: [
			toAction({ id: 'edit', label: 'Edit as Draft', class: ThemeIcon.asClassName(Codicon.edit), run: () => { } }),
			toAction({ id: 'send', label: 'Send Now', class: ThemeIcon.asClassName(Codicon.newLine), run: () => { } }),
			toAction({ id: 'reschedule', label: 'Reschedule', class: ThemeIcon.asClassName(Codicon.clock), run: () => { } }),
			toAction({ id: 'cancel', label: 'Cancel Schedule', class: ThemeIcon.asClassName(Codicon.close), run: () => { } }),
		],
	});
	const input = disposableStore.add(new ScheduledChatEditorInput('scheduled-preview', item, 'Review build results'));
	const view = disposableStore.add(instantiationService.createInstance(ScheduledChatEditor, input));
	container.appendChild(view.element);
	view.layout(800, 450);
	view.setVisible(true);
	await waitForFixtureDomCondition(container, () => !!container.querySelector('.scheduled-request-text'), disposableStore);
	if (completed) {
		item.set(undefined, undefined);
		await waitForFixtureDomCondition(container, () => !container.querySelector('.scheduled-request-text') && !!container.querySelector('.chat-transcript-progress [role="status"]')?.getAttribute('aria-label')?.includes('no longer scheduled'), disposableStore);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	ScheduledRequest: defineComponentFixture({ render: context => renderScheduledChatEditor(context, false) }),
	NoLongerScheduled: defineComponentFixture({ render: context => renderScheduledChatEditor(context, true) }),
});
