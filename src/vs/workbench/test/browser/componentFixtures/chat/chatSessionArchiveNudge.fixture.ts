/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, ChatPillsRow, ChatPillsWidget } from '../../../../browser/chatPills.js';
import { CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT, CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT } from '../../../../contrib/chat/browser/widget/input/chatSessionArchiveNudge.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

function renderArchiveNudge(context: ComponentFixtureContext, options: {
	readonly hasWorktree: boolean;
	readonly pullRequestCount?: number;
	readonly width?: number;
	readonly withPills?: boolean;
	readonly title?: string;
	readonly icon?: string;
}): Promise<void> {
	return renderChatWidget(context, {
		width: options.width,
		height: 640,
		hostLayoutMode: 'listOnly',
		persistentContentHeight: options.withPills ? CHAT_INPUT_PILLS_ROW_HEIGHT : undefined,
		messages: [{
			user: 'Improve the session list layout.',
			assistant: [{ kind: 'markdown', text: 'The session list layout is updated and the changes have been merged.' }],
		}],
		additionalServices: registration => {
			const treatments = new Map<string, string | undefined>([
				[CHAT_SESSION_ARCHIVE_NUDGE_TITLE_TREATMENT, options.title],
				[CHAT_SESSION_ARCHIVE_NUDGE_ICON_TREATMENT, options.icon],
			]);
			registration.defineInstance(IWorkbenchAssignmentService, new class extends NullWorkbenchAssignmentService {
				override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
					return treatments.get(name) as T | undefined;
				}
			}());
		},
		decorateInputPart: (inputPart, instantiationService) => {
			if (options.withPills) {
				const row = context.disposableStore.add(new ChatPillsRow('ChatSessionArchiveNudge.fixture', {
					compact: 'auto',
					targetWindow: getWindow(inputPart.element),
				}));
				const pills = context.disposableStore.add(instantiationService.createInstance(ChatPillsWidget, {
					pills: constObservable([
						{ action: toAction({ id: 'fixture.pullRequest', label: '#3171', class: ThemeIcon.asClassName(Codicon.gitMerge), run: () => { } }) },
						{ action: toAction({ id: 'fixture.changes', label: '2 files changed', class: ThemeIcon.asClassName(Codicon.diff), run: () => { } }) },
					]),
				}, { ariaLabel: 'Session status' }));
				const persistentContent = inputPart.persistentContentContainerElement;
				persistentContent.appendChild(row.element);
				persistentContent.classList.add('chat-persistent-content-visible');
				row.content.appendChild(pills.element);
				row.observe(persistentContent);
				row.observe(pills.element);
			}

			inputPart.setSessionArchiveNudge({
				hasWorktree: options.hasWorktree,
				pullRequestCount: options.pullRequestCount ?? 1,
				onArchive: async () => inputPart.setSessionArchiveNudge(undefined),
				onDismiss: () => { },
			});
		},
	});
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Folder: defineComponentFixture({
		render: context => renderArchiveNudge(context, { hasWorktree: false }),
	}),
	Worktree: defineComponentFixture({
		render: context => renderArchiveNudge(context, { hasWorktree: true }),
	}),
	Narrow: defineComponentFixture({
		render: context => renderArchiveNudge(context, { hasWorktree: true, pullRequestCount: 2, width: 360 }),
	}),
	WithSessionPills: defineComponentFixture({
		render: context => renderArchiveNudge(context, { hasWorktree: false, withPills: true }),
	}),
	ExperimentalTitleAndIcon: defineComponentFixture({
		render: context => renderArchiveNudge(context, {
			hasWorktree: true,
			width: 360,
			title: 'All done? Make room for what comes next.',
			icon: 'archive',
		}),
	}),
});
