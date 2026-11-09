/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { defineThemedFixtureGroup, z } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { defineSessionsListFixture } from './sessionsListFixtureUtils.js';
import { SessionsGrouping } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { ARCHIVE_SESSION_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';

const motionInput = z.object({
	action: z.enum(['reset', 'complete', 'fail']).default('reset'),
	variant: z.enum(['success', 'failure']).default('success'),
	sequence: z.number().default(0),
	paused: z.boolean().default(false),
	reduced: z.boolean().default(false),
});
const inputSchema = z.object({ motion: motionInput.default({ action: 'reset', variant: 'success', sequence: 0, paused: false, reduced: false }) });

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	MotionCommit: defineSessionsListFixture({
		menuActions: [ARCHIVE_SESSION_COMMAND_ID],
		archiveDelayMs: 1000,
		notifications: true,
		sessions: [
			{ id: 'done', title: 'Improve keyboard navigation', workspace: 'vscode', minutesAgo: 2 },
			{ id: 'remaining', title: 'Review parser changes', workspace: 'vscode', minutesAgo: 12 },
		],
		view: { width: 448, height: 208, compact: true, grouping: SessionsGrouping.Date, showArchived: false, reducedMotion: false },
		settings: { [ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone, [SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: true },
	}, {
		virtualTime: { enabled: false },
		inputSchema,
		afterRender: (fixture, context) => {
			context.container.classList.add('monaco-workbench');
			context.container.style.margin = '0 auto';
			context.container.style.padding = 'var(--vscode-spacing-size160)';
			context.container.style.boxSizing = 'border-box';
			context.container.style.width = 'min(480px, 100vw)';
			context.container.style.height = '240px';
			context.container.style.maxWidth = '100%';
			const targetWindow = dom.getWindow(context.container);
			const layout = () => fixture.list.layout(208, fixture.listHost.clientWidth);
			const resize = context.disposableStore.add(new dom.DisposableResizeObserver('motionFixture.sessions', layout, targetWindow));
			context.disposableStore.add(resize.observe(fixture.listHost));
			layout();
			const reveal = context.disposableStore.add(new MutableDisposable());
			const frame = context.disposableStore.add(new MutableDisposable());
			const target = fixture.sessions.get('done')!;
			reveal.value = fixture.list.revealArchiveAction(target.session);
			let input = inputSchema.parse(context.input).motion;
			let sequence = -1;
			let completing = false;
			const post = (type: 'started' | 'ended') => targetWindow.parent.postMessage({ type: `vscode-motion-preview:${type}`, sequence: input.sequence }, '*');
			const updatePlayback = () => {
				const animations = context.container.getAnimations({ subtree: true });
				for (const animation of animations) {
					if (input.paused && animation.playState === 'running') { animation.pause(); }
					else if (!input.paused && animation.playState === 'paused') { animation.play(); }
				}
				return animations;
			};
			const check = () => {
				if (!completing) { return; }
				const animations = updatePlayback();
				if (context.container.querySelector('[aria-busy="true"]') || animations.some(animation => animation.playState === 'running' || animation.playState === 'paused')) {
					frame.value = dom.scheduleAtNextAnimationFrame(targetWindow, check);
				} else {
					completing = false;
					post('ended');
				}
			};
			context.disposableStore.add(fixture.instantiationService.get(ISessionsManagementService).onDidArchiveSession(() => {
				reveal.clear();
				completing = true;
				frame.value = dom.scheduleAtNextAnimationFrame(targetWindow, check);
			}));
			const start = (event: MouseEvent | KeyboardEvent) => {
				if (!dom.isHTMLElement(event.target) || !event.target.closest('.action-label[aria-label^="Mark as Done"]')) { return; }
				if (context.container.querySelector('[aria-busy="true"]')) { return; }
				post('started');
				completing = true;
				frame.value = dom.scheduleAtNextAnimationFrame(targetWindow, check);
			};
			context.disposableStore.add(dom.addDisposableListener(context.container, 'click', start, true));
			context.disposableStore.add(dom.addDisposableListener(context.container, 'keydown', event => {
				if (event.key === 'Enter' || event.key === ' ') { start(event); }
			}, true));
			const update = () => {
				const reduced = input.reduced || targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
				context.container.classList.toggle('monaco-reduce-motion', reduced);
				context.container.classList.toggle('monaco-enable-motion', !reduced);
				fixture.setReducedMotion(reduced);
				fixture.setArchiveOutcome(input.action === 'fail' || input.variant === 'failure' ? 'error' : 'success');
				updatePlayback();
				if (input.sequence !== sequence) {
					sequence = input.sequence;
					if (input.action === 'reset') {
						fixture.cancelPendingArchives();
						fixture.clearNotifications();
						completing = false;
						frame.clear();
						for (const overlay of context.container.querySelectorAll('.animation-overlay')) { overlay.remove(); }
						for (const session of fixture.sessions.values()) { session.isArchived.set(false, undefined); }
						fixture.list.refresh();
						reveal.value = fixture.list.revealArchiveAction(target.session);
					} else if (!context.container.querySelector('[aria-busy="true"]')) {
						if (target.isArchived.get()) {
							target.isArchived.set(false, undefined);
							fixture.list.refresh();
							reveal.value = fixture.list.revealArchiveAction(target.session);
						}
						const action = fixture.container.querySelector<HTMLElement>('[aria-label^="Mark as Done"]');
						if (!action) { throw new Error('Missing session archive action'); }
						action.click();
					}
				}
				if (completing) { frame.value = dom.scheduleAtNextAnimationFrame(targetWindow, check); }
			};
			context.disposableStore.add(context.watchInput('motion', value => { input = motionInput.parse(value); update(); }));
			update();
		},
	}),
});
