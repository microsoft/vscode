/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Action } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getDurationString } from '../../../../base/common/date.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import type { IChatPillEntry, IChatPillSection } from '../../../browser/chatPills.js';
import { createChatPillHoverElement } from '../../../browser/chatPillHover.js';
import type { ChatBackgroundShellOutput, IChatBackgroundShell } from '../common/sessionChatPills.js';
import { BackgroundShellCommandView, BackgroundShellOutputView } from './sessionBackgroundShellOutputView.js';
import './media/sessionBackgroundShells.css';

/** A chat whose active background shells the Background Shells pill lists. */
export interface IChatBackgroundShellsSource {
	readonly backgroundShells?: IObservable<readonly IChatBackgroundShell[]>;
}

/** Describes the Background Shells pill in a chat's accessibility help. */
export function getBackgroundShellsPillAccessibilityHelp(): string {
	return localize('backgroundShells.accessibilityHelp', "The Background Shells pill opens a picker above the chat input, including for a single shell. Each entry includes its elapsed time, and is marked Detached when the shell runs independently of the agent. Use the arrow keys to choose a shell, then Enter or Right Arrow to open its live command details beside the picker. Left Arrow or Escape returns to the list; Escape from the list returns focus to the pill. Elapsed time continues updating while details are open, and a shell disappears when it finishes. The details start with the shell's full description, unless it only repeats the command, followed by the command and its status. When a shell's output is available, a read-only terminal below the command streams it. A shell that can be stopped shows a Stop Shell button beside its command. Press Tab to move through the details to the output, then use Open Accessible View{0} to read the command, its status, and its output as text.", '<keybinding:editor.action.accessibleView>');
}

function getShellName(shell: IChatBackgroundShell): string {
	return shell.description.trim() || shell.command;
}

interface IShellDetails {
	readonly element: HTMLElement;
	/** The shell's full description, which its picker row can truncate. */
	readonly title: HTMLElement;
	/** Stops {@link shell}; shown beside the command. */
	readonly stopAction: Action;
	/** The command with its status, and its live output when available; exists only while the details are shown. */
	readonly view: MutableDisposable<BackgroundShellOutputView | BackgroundShellCommandView>;
	/** Closes the view; the picker may release it more than once. */
	readonly releaseView: IDisposable;
	/** Owns the Stop action and the view. */
	readonly store: DisposableStore;
	outputSource: IObservable<ChatBackgroundShellOutput> | undefined;
	/** Whether the view was built with the Stop action. */
	viewStoppable: boolean;
	/** The shell as last listed. */
	shell: IChatBackgroundShell | undefined;
}

export class SessionBackgroundShellsControl extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;
	// Stable detail nodes let the picker preserve the open panel across clock ticks.
	private readonly _details = new Map<string, IShellDetails>();
	private _currentChat: IChatBackgroundShellsSource | undefined;

	constructor(
		chat: IObservable<IChatBackgroundShellsSource | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
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
				this._clearDetails();
			}
			const shells = currentChat?.backgroundShells?.read(reader) ?? [];
			const shellIds = new Set(shells.map(shell => shell.id));
			for (const [id, details] of this._details) {
				if (!shellIds.has(id)) {
					details.store.dispose();
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
		const description = shell.description.trim();
		const name = getShellName(shell);
		// Attached is the common case, so only detached shells carry a label.
		const attachment = shell.attachmentMode === 'detached'
			? localize('backgroundShells.detached', "Detached")
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
		const content = this._details.get(shell.id) ?? this._createDetails();
		this._details.set(shell.id, content);
		content.shell = shell;
		if (content.title.textContent !== description) {
			content.title.textContent = description;
		}
		// The description titles the details above the command, unless the command already names the shell.
		content.title.hidden = !description || description === shell.command;
		const output = shell.output;
		const stoppable = !!shell.stop;
		if (content.outputSource !== output || content.viewStoppable !== stoppable) {
			// A different output source means a different execution; never show stale output.
			// The view's actions are fixed, so it's also rebuilt when Stop comes or goes.
			content.view.clear();
			content.outputSource = output;
			content.viewStoppable = stoppable;
		}
		return {
			id: shell.id,
			label: name,
			icon: Codicon.terminal,
			badge,
			ariaLabel: localize('backgroundShells.showDetails', "Show details for background shell {0}", name),
			ariaDescription: detail,
			hover: {
				// The view is only built when the details open, and the picker releases it on close.
				content: () => this._showDetails(content, shell.command, output),
				disposeContent: () => content.view.clear(),
				disposable: content.releaseView,
				expandable: true,
				alignToParentBottom: true,
				panelClassName: 'chat-pill-hover-panel',
				contentOwnsPadding: true,
			},
			open: () => { },
		};
	}

	private _createDetails(): IShellDetails {
		const store = new DisposableStore();
		const element = createChatPillHoverElement('chat-pill-location-hover', 'compact');
		const view = store.add(new MutableDisposable<BackgroundShellOutputView | BackgroundShellCommandView>());
		const details: IShellDetails = {
			element,
			title: append(element, $('.chat-background-shell-title')),
			stopAction: store.add(new Action('chat.backgroundShells.stop', localize('backgroundShells.stop', "Stop Shell"), ThemeIcon.asClassName(Codicon.debugStop), true, () => this._stop(details))),
			view,
			releaseView: { dispose: () => view.clear() },
			store,
			outputSource: undefined,
			viewStoppable: false,
			shell: undefined,
		};
		return details;
	}

	private async _stop(details: IShellDetails): Promise<void> {
		const shell = details.shell;
		if (!shell?.stop) {
			return;
		}
		const name = getShellName(shell);
		// Stay disabled once stopped: the shell leaves the list when the agent reports it.
		details.stopAction.enabled = false;
		try {
			status(await shell.stop()
				? localize('backgroundShells.stopped', "Stopped {0}.", name)
				: localize('backgroundShells.alreadyFinished', "{0} had already finished.", name));
		} catch (error) {
			details.stopAction.enabled = true;
			this._notificationService.error(localize('backgroundShells.stopFailed', "Could not stop {0}: {1}", name, toErrorMessage(error)));
		}
	}

	private _showDetails(details: IShellDetails, command: string, output: IObservable<ChatBackgroundShellOutput> | undefined): HTMLElement {
		if (!details.view.value) {
			const actions = details.viewStoppable ? [details.stopAction] : [];
			const view = output
				? this._instantiationService.createInstance(BackgroundShellOutputView, command, output, actions)
				: this._instantiationService.createInstance(BackgroundShellCommandView, command, actions);
			details.view.value = view;
			details.element.appendChild(view.element);
		}
		return details.element;
	}

	private _clearDetails(): void {
		for (const details of this._details.values()) {
			details.store.dispose();
		}
		this._details.clear();
	}

	override dispose(): void {
		this._clearDetails();
		this._currentChat = undefined;
		super.dispose();
	}
}
