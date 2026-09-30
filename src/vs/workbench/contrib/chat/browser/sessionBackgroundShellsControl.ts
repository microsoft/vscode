/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getDurationString } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import type { IChatPillEntry, IChatPillSection } from '../../../browser/chatPills.js';
import type { IChatBackgroundShell } from '../common/sessionChatPills.js';

/** A chat whose active background shells the Background Shells pill lists. */
export interface IChatBackgroundShellsSource {
	readonly backgroundShells?: IObservable<readonly IChatBackgroundShell[]>;
}

/** Describes the Background Shells pill in a chat's accessibility help. */
export function getBackgroundShellsPillAccessibilityHelp(): string {
	return localize('backgroundShells.accessibilityHelp', "The Background Shells pill opens a picker above the chat input, including for a single shell. Each entry includes its attached or detached mode when the agent reports it, and its elapsed time. Use the arrow keys to choose a shell, then Enter or Right Arrow to open its live command details beside the picker. Left Arrow or Escape returns to the list; Escape from the list returns focus to the pill. Elapsed time continues updating while details are open, and a shell disappears when it finishes. This list does not stop commands or stream their output.");
}

function createShellDetails() {
	const element = $('.chat-pill-location-hover');
	return {
		element,
		summary: append(element, $('div')),
		command: append(element, $('div')),
		shellId: append(element, $('div')),
		startedAt: append(element, $('div')),
	};
}

export class SessionBackgroundShellsControl extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;
	// Stable detail nodes let the picker preserve the open panel across clock ticks.
	private readonly _details = new Map<string, ReturnType<typeof createShellDetails>>();
	private _currentChat: IChatBackgroundShellsSource | undefined;

	constructor(
		chat: IObservable<IChatBackgroundShellsSource | undefined>,
	) {
		super();
		const now = observableFromEvent(this, listener => {
			const scheduler = new RunOnceScheduler(() => {
				scheduler.schedule();
				listener(undefined);
			}, 1000);
			scheduler.schedule();
			return scheduler;
		}, () => Date.now());

		this.sections = derived(this, reader => {
			const currentChat = chat.read(reader);
			if (currentChat !== this._currentChat) {
				this._currentChat = currentChat;
				this._details.clear();
			}
			const shells = currentChat?.backgroundShells?.read(reader) ?? [];
			const shellIds = new Set(shells.map(shell => shell.id));
			for (const id of this._details.keys()) {
				if (!shellIds.has(id)) {
					this._details.delete(id);
				}
			}
			if (shells.length === 0) {
				return [];
			}
			const timestamp = now.read(reader);
			return [{
				title: localize('backgroundShells.active', "Active background shells"),
				entries: shells.map(shell => this._entry(shell, timestamp)),
			}];
		});
	}

	private _entry(shell: IChatBackgroundShell, now: number): IChatPillEntry {
		const name = shell.description.trim() || shell.command;
		const attachment = shell.attachmentMode === 'detached'
			? localize('backgroundShells.detached', "Detached")
			: shell.attachmentMode === 'attached'
				? localize('backgroundShells.attached', "Attached")
				: undefined;
		const startedAt = Date.parse(shell.startedAt);
		const duration = Number.isFinite(startedAt) ? getDurationString(Math.max(0, Math.floor((now - startedAt) / 1000) * 1000)) : undefined;
		const badge = attachment && duration
			? localize('backgroundShells.attachmentWithDuration', "{0}, {1}", attachment, duration)
			: attachment ?? duration;
		const facts = shell.shellId !== undefined
			? localize('backgroundShells.facts', "Command: {0}\nShell ID: {1}\nStarted: {2}", shell.command, shell.shellId, shell.startedAt)
			: localize('backgroundShells.factsWithoutId', "Command: {0}\nStarted: {1}", shell.command, shell.startedAt);
		const detail = badge ? localize('backgroundShells.details', "{0}\n\n{1}", badge, facts) : facts;
		const content = this._details.get(shell.id) ?? createShellDetails();
		this._details.set(shell.id, content);
		for (const [element, text] of [
			[content.summary, badge ?? ''],
			[content.command, localize('backgroundShells.command', "Command: {0}", shell.command)],
			[content.shellId, shell.shellId !== undefined ? localize('backgroundShells.id', "Shell ID: {0}", shell.shellId) : ''],
			[content.startedAt, localize('backgroundShells.startedAt', "Started: {0}", shell.startedAt)],
		] as const) {
			if (element.textContent !== text) {
				element.textContent = text;
			}
		}
		content.shellId.hidden = shell.shellId === undefined;
		return {
			id: shell.id,
			label: name,
			icon: Codicon.terminal,
			badge,
			ariaLabel: localize('backgroundShells.showDetails', "Show details for background shell {0}", name),
			ariaDescription: detail,
			hover: {
				content: content.element,
				expandable: true,
				alignToParentBottom: true,
				panelClassName: 'chat-pill-location-hover-panel',
			},
			open: () => { },
		};
	}

	override dispose(): void {
		this._details.clear();
		this._currentChat = undefined;
		super.dispose();
	}
}
