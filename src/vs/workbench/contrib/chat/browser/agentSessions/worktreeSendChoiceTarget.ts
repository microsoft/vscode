/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, runOnChange } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { markOnboardingTarget, resolveOnboardingTarget } from '../../../onboarding/browser/spotlight/onboardingTarget.js';

/**
 * What asks where a new chat works as its first request is sent, in a callout on the worktree control of that chat: by the
 * chat's resource, holding no UI. The controls mark themselves as the callout's target ({@link markWorktreeSendChoiceTarget}).
 */
export interface IWorktreeSendChoiceAsker {
	/** The onboarding target id that the callout anchors on. */
	readonly targetId: string;
	/** The chat asked about now, until it has the answer. */
	readonly pendingSendChoice: IObservable<URI | undefined>;
	/** Fires with the chat asked about each time its callout shows, also again on another control once the one it showed on is gone. */
	readonly onDidShowSendChoice: Event<URI>;
	/** Ends the question about the chat of `resource` unanswered, where it asks about it. */
	cancelSendChoice(resource: URI): void;
}

/**
 * Marks `element`, the worktree control of the chat `resource` shows, as the target of `asker`'s callout while it asks about
 * that chat (and while `isOffered` tells, where given, such as while the control is where the chat offers New Worktree).
 *
 * The callout keeps the element it shows on. While `element` is that element, the question ends unanswered once it shows
 * another chat, rather than staying on the other chat's control. Once it goes, the callout shows again on another control of
 * the same chat, such as one rendered in its place, else the question ends. Other controls, such as one in another window,
 * never end it.
 */
export function markWorktreeSendChoiceTarget(element: HTMLElement, asker: IWorktreeSendChoiceAsker, resource: IObservable<URI | undefined>, isOffered?: () => boolean): IDisposable {
	const store = new DisposableStore();
	const isEqual = (a: URI | undefined, b: URI | undefined) => !!a && !!b && extUriBiasedIgnorePathCase.isEqual(a, b);

	// The chat asked about while the callout shows on `element`
	let anchoredFor: URI | undefined;
	store.add(asker.onDidShowSendChoice(asked => {
		// As the callout shows, it anchors on the target that resolves now in the window onboarding presents in, the main
		// window, whatever window this control is in
		anchoredFor = resolveOnboardingTarget(mainWindow, asker.targetId)?.element === element ? asked : undefined;
	}));
	store.add(autorun(reader => {
		// Answered or ended meanwhile
		const pending = asker.pendingSendChoice.read(reader);
		if (anchoredFor && !isEqual(anchoredFor, pending)) {
			anchoredFor = undefined;
		}
	}));
	store.add(runOnChange(resource, shown => {
		if (anchoredFor && !isEqual(anchoredFor, shown)) {
			const asked = anchoredFor;
			anchoredFor = undefined;
			asker.cancelSendChoice(asked);
		}
	}));
	store.add(toDisposable(() => {
		const asked = anchoredFor;
		if (asked) {
			// Once its marker is gone too, and a control of the chat rendered in its place meanwhile marked itself
			queueMicrotask(() => {
				if (!resolveOnboardingTarget(mainWindow, asker.targetId)) {
					asker.cancelSendChoice(asked);
				}
			});
		}
	}));
	// A callout run has no scope: it matches only the control of the chat it asks about, and every other control is out of scope
	store.add(markOnboardingTarget(element, asker.targetId, {
		scope: () => {
			const shown = resource.get();
			return isEqual(shown, asker.pendingSendChoice.get()) && (isOffered?.() ?? true) ? undefined : (shown?.toString() ?? '');
		},
	}));
	return store;
}
