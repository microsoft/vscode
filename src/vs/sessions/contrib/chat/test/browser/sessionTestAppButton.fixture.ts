/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { toAction } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, ChatPillsRow, ChatPillsWidget } from '../../../../../workbench/browser/chatPills.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatResponseFileChangesService } from '../../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { ChatInputPart } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { IChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { ChatModeKind } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { renderChatWidget } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionTestAppButton } from '../../browser/sessionTestAppButton.js';
import '../../browser/media/chatView.css';

async function render(context: ComponentFixtureContext, width: number, appFile = 'index.html', retest = false): Promise<void> {
	let renderedInput: ChatInputPart | undefined;
	await renderChatWidget(context, {
		width, height: 360, listHeight: 180, verbose: false, agentHostSession: true,
		persistentContentHeight: CHAT_INPUT_PILLS_ROW_HEIGHT,
		messages: [{
			user: 'Create an app',
			assistant: [{ kind: 'markdown', text: 'Implemented the app.' }],
			fileChanges: [{ name: appFile, added: 24, removed: 0, created: true }],
		}],
		additionalServices: registration => {
			registration.defineInstance(IStorageService, context.disposableStore.add(new InMemoryStorageService()));
		},
		onRendered: ({ instantiationService, inputPart, viewModel, model }) => {
			renderedInput = inputPart;
			const row = $('.session-input-toolbar-row');
			inputPart.persistentContentContainerElement.appendChild(row);
			inputPart.persistentContentContainerElement.classList.add('chat-persistent-content-visible');
			const pillsRow = context.disposableStore.add(new ChatPillsRow('testApp.fixture'));
			pillsRow.element.classList.add('session-chat-input-toolbar');
			const pills = context.disposableStore.add(instantiationService.createInstance(ChatPillsWidget, {
				pills: constObservable([
					{ action: toAction({ id: 'files', label: '12 Files', class: ThemeIcon.asClassName(Codicon.diffMultiple), run: () => { } }) },
					{ action: toAction({ id: 'artifacts', label: '2 Artifacts', class: ThemeIcon.asClassName(Codicon.package), run: () => { } }) },
					{ action: toAction({ id: 'references', label: '1 Reference', class: ThemeIcon.asClassName(Codicon.bookmark), run: () => { } }) },
				]),
			}, { ariaLabel: 'Chat status' }));
			pillsRow.content.appendChild(pills.element);
			row.appendChild(pillsRow.element);
			const button = context.disposableStore.add(new SessionTestAppButton(
				upcastPartial<IChatWidget>({
					onDidChangeViewModel: Event.None, viewModel,
					input: upcastPartial<ChatInputPart>({ currentModeObs: constObservable(upcastPartial<IChatMode>({ kind: ChatModeKind.Agent })) }),
					focusInput: () => inputPart.focus(),
					acceptInput: async (prompt, options) => {
						options?.onRequestAccepted?.();
						inputPart.setValue(prompt ?? '', true);
						return model.lastRequest?.response;
					},
				}), constObservable(true), constObservable(undefined),
				instantiationService.get(IChatResponseFileChangesService),
				upcastPartial<IChatEntitlementService>({ sentimentObs: constObservable({ hidden: false }) }),
				instantiationService.get(INotificationService),
				instantiationService.get(IFileService), instantiationService.get(ILogService), instantiationService.get(IStorageService)));
			row.appendChild(button.element);
			pillsRow.observe(pills.element);
		},
	});
	if (retest) {
		context.container.querySelector<HTMLElement>('.session-test-app .monaco-text-button')!.click();
		await timeout(0);
		renderedInput!.setValue('', true);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/testApp/' }, {
	AboveComposer: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 720),
	}),
	Narrow: defineComponentFixture({ render: context => render(context, 360) }),
	Retest: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, 720, 'index.html', true),
	}),
	RetestNarrow: defineComponentFixture({ render: context => render(context, 360, 'index.html', true) }),
	Script: defineComponentFixture({ render: context => render(context, 720, 'script.py') }),
});
