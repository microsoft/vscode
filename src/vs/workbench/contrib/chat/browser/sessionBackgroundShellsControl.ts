/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getDurationString } from '../../../../base/common/date.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import type { IChatPillEntry, IChatPillSection } from '../../../browser/chatPills.js';
import type { ChatBackgroundShellOutput, IChatBackgroundShell } from '../common/sessionChatPills.js';
import { BackgroundShellOutputView } from './sessionBackgroundShellOutputView.js';

/** A chat whose active background shells the Background Shells pill lists. */
export interface IChatBackgroundShellsSource {
	readonly backgroundShells?: IObservable<readonly IChatBackgroundShell[]>;
}

/** Describes the Background Shells pill in a chat's accessibility help. */
export function getBackgroundShellsPillAccessibilityHelp(): string {
	return localize('backgroundShells.accessibilityHelp', "The Background Shells pill opens a picker above the chat input, including for a single shell. Each entry includes its elapsed time, and is marked Detached when the shell runs independently of the agent. Use the arrow keys to choose a shell, then Enter or Right Arrow to open its live command details beside the picker. Left Arrow or Escape returns to the list; Escape from the list returns focus to the pill. Elapsed time continues updating while details are open, and a shell disappears when it finishes. When a shell's output is available, its details show the command and its status above a read-only terminal that streams the output. Press Tab to move to the output, then use Open Accessible View{0} to read the command, its status, and its output as text. This list does not stop commands.", '<keybinding:editor.action.accessibleView>');
}

interface IShellDetails {
	readonly element: HTMLElement;
	readonly summary: HTMLElement;
	readonly command: HTMLElement;
	readonly shellId: HTMLElement;
	readonly startedAt: HTMLElement;
	/** The live output terminal, which exists only while the details are shown. */
	readonly output: MutableDisposable<BackgroundShellOutputView>;
	/** Closes the live output terminal; the picker may release it more than once. */
	readonly releaseOutput: IDisposable;
	outputSource: IObservable<ChatBackgroundShellOutput> | undefined;
}

function createShellDetails(): IShellDetails {
	const element = $('.chat-pill-location-hover');
	const output = new MutableDisposable<BackgroundShellOutputView>();
	return {
		element,
		summary: append(element, $('div')),
		command: append(element, $('div')),
		shellId: append(element, $('div')),
		startedAt: append(element, $('div')),
		output,
		releaseOutput: { dispose: () => output.clear() },
		outputSource: undefined,
	};
}

export class SessionBackgroundShellsControl extends Disposable {

	readonly sections: IObservable<readonly IChatPillSection[]>;
	// Stable detail nodes let the picker preserve the open panel across clock ticks.
	private readonly _details = new Map<string, IShellDetails>();
	private _currentChat: IChatBackgroundShellsSource | undefined;

	constructor(
		chat: IObservable<IChatBackgroundShellsSource | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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
					details.output.dispose();
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
		const output = shell.output;
		// The live output view shows the command above its output.
		content.command.hidden = !!output;
		if (content.outputSource !== output) {
			// A different output source means a different execution; never show stale output.
			content.output.clear();
			content.outputSource = output;
		}
		return {
			id: shell.id,
			label: name,
			icon: Codicon.terminal,
			badge,
			ariaLabel: localize('backgroundShells.showDetails', "Show details for background shell {0}", name),
			ariaDescription: detail,
			hover: {
				// The output terminal is only built when the details open, and the picker releases it on close.
				content: output ? () => this._showOutput(content, shell.command, output) : content.element,
				disposeContent: output ? () => content.output.clear() : undefined,
				disposable: output ? content.releaseOutput : undefined,
				expandable: true,
				alignToParentBottom: true,
				panelClassName: 'chat-pill-location-hover-panel',
			},
			open: () => { },
		};
	}

	private _showOutput(details: IShellDetails, command: string, output: IObservable<ChatBackgroundShellOutput>): HTMLElement {
		if (!details.output.value) {
			const view = this._instantiationService.createInstance(BackgroundShellOutputView, command, output);
			details.output.value = view;
			details.element.appendChild(view.element);
		}
		return details.element;
	}

	private _clearDetails(): void {
		for (const details of this._details.values()) {
			details.output.dispose();
		}
		this._details.clear();
	}

	override dispose(): void {
		this._clearDetails();
		this._currentChat = undefined;
		super.dispose();
	}
}
