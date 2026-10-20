/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { constObservable } from '../../../base/common/observable.js';
import { mock } from '../../../base/test/common/mock.js';
import { ChatSessionArchiveActionWording } from '../../../platform/chat/common/sessionArchiveActions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { getArchivedChatBannerContent, ISessionReadOnlyBannerContent, SessionReadOnlyBanner } from '../../browser/parts/sessionReadOnlyBanner.js';
import { IChat, ISession } from '../../services/sessions/common/session.js';

export default defineThemedFixtureGroup({ path: 'sessions/readOnlyBanner/' }, {
	// Generic read-only chat (e.g. a subagent transcript): message only.
	ReadOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, { message: 'This chat is read-only' }),
	}),

	// Archived session: archived-specific message plus an inline "Restore" action.
	Archived: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, {
			message: 'This session is archived and read-only.',
			action: { label: 'Restore', run: () => console.log('Restore') },
		}),
	}),

	// Archived nested chat of a session that is not archived: the same archived banner, whose Restore acts on the chat alone.
	ArchivedNestedChat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => {
			const session = new class extends mock<ISession>() { override readonly isArchived = constObservable(false); }();
			const chat = new class extends mock<IChat>() { override readonly isArchived = constObservable(true); }();
			const commandService = new class extends mock<ICommandService>() {
				override async executeCommand<R>(id: string): Promise<R | undefined> {
					console.log(id);
					return undefined;
				}
			}();
			const content = getArchivedChatBannerContent(session, chat, ChatSessionArchiveActionWording.MarkAsDone, commandService, undefined);
			if (!content) {
				throw new Error('Expected the archived banner for an archived nested chat.');
			}
			renderBanner(context, content);
		},
	}),

	Reconnecting: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, {
			icon: Codicon.sync,
			message: 'Reconnecting to WSL: Ubuntu...',
		}),
	}),

	HostNotRunning: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, {
			icon: Codicon.debugDisconnect,
			message: 'WSL: Ubuntu is not running.',
			action: { label: 'Start WSL: Ubuntu', run: () => console.log('Start') },
		}),
	}),

	HostDisconnected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, {
			icon: Codicon.debugDisconnect,
			message: 'Cannot reach WSL: Ubuntu.',
		}),
	}),
});

function renderBanner({ container, disposableStore, theme }: ComponentFixtureContext, content: ISessionReadOnlyBannerContent): void {
	container.style.width = '480px';
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const banner = disposableStore.add(instantiationService.createInstance(SessionReadOnlyBanner));
	banner.setContent(content);
	banner.setVisible(true);
	container.appendChild(banner.domNode);
}
