/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableWindowInterval, getWindow } from '../../../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { PlaceholderTextContribution } from '../../../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';

/**
 * Friendly placeholders shared by empty Agents window and agent host chat inputs.
 */
export const CHAT_INPUT_ROTATING_PLACEHOLDERS: readonly string[] = [
	localize('chatInput.placeholder.whatAreYouBuilding', "What are you building?"),
	localize('chatInput.placeholder.whatWillYouShipToday', "What will you ship today?"),
	localize('chatInput.placeholder.describeWhatYouWantToBuild', "Describe what you want to build"),
	localize('chatInput.placeholder.whatsYourNextMilestone', "What's your next milestone?"),
	localize('chatInput.placeholder.whatAreYouTryingToAchieve', "What are you trying to achieve?"),
	localize('chatInput.placeholder.pitchYourIdea', "Pitch your idea"),
	localize('chatInput.placeholder.whatsTheGoal', "What's the goal?"),
	localize('chatInput.placeholder.whatWillYouCreate', "What will you create?"),
	localize('chatInput.placeholder.whatFeatureAreYouDreamingUp', "What feature are you dreaming up?"),
	localize('chatInput.placeholder.describeTheOutcome', "Describe the outcome you want"),
	localize('chatInput.placeholder.whatProblemAreYouSolving', "What problem are you solving?"),
	localize('chatInput.placeholder.whatsNextOnYourRoadmap', "What's next on your roadmap?"),
	localize('chatInput.placeholder.whatWouldYouLikeToAutomate', "What would you like to automate?"),
	localize('chatInput.placeholder.whatWillYouLaunch', "What will you launch?"),
	localize('chatInput.placeholder.describeYourMission', "Describe your mission"),
];

const DEFAULT_ROTATION_INTERVAL_MS = 5000;

let lastPlaceholderIndex = -1;

/** Pick a random placeholder without immediately repeating the previous pick. */
export function getRandomChatInputPlaceholder(placeholders: readonly string[] = CHAT_INPUT_ROTATING_PLACEHOLDERS): string {
	let index = Math.floor(Math.random() * placeholders.length);
	if (index === lastPlaceholderIndex) {
		index = (index + 1) % placeholders.length;
	}
	lastPlaceholderIndex = index;
	return placeholders[index];
}

export interface IRotatingPlaceholderOptions {
	/** The placeholders to cycle through. Defaults to {@link CHAT_INPUT_ROTATING_PLACEHOLDERS}. */
	readonly placeholders?: readonly string[];
	/** How often to rotate, in milliseconds. Defaults to 5000. */
	readonly intervalMs?: number;
}

/** Rotate an editor's placeholder until the returned disposable is disposed. */
export function installRotatingChatPlaceholder(editor: ICodeEditor, options?: IRotatingPlaceholderOptions): IDisposable {
	const placeholders = options?.placeholders ?? CHAT_INPUT_ROTATING_PLACEHOLDERS;
	const intervalMs = options?.intervalMs ?? DEFAULT_ROTATION_INTERVAL_MS;
	if (placeholders.length === 0) {
		return toDisposable(() => { });
	}

	const store = new DisposableStore();

	const placeholderContribution = PlaceholderTextContribution.get(editor);
	store.add(toDisposable(() => PlaceholderTextContribution.get(editor)?.setAnimateTransitions(false)));

	const currentPlaceholder = editor.getOption(EditorOption.placeholder);
	let expectedPlaceholder = currentPlaceholder;
	let index = placeholders.indexOf(currentPlaceholder);
	if (index === -1) {
		index = Math.floor(Math.random() * placeholders.length);
	}
	store.add(disposableWindowInterval(getWindow(editor.getDomNode()), () => {
		if (editor.getOption(EditorOption.placeholder) !== expectedPlaceholder) {
			return;
		}

		index = (index + 1) % placeholders.length;
		expectedPlaceholder = placeholders[index];
		placeholderContribution?.setAnimateTransitions(true);
		try {
			editor.updateOptions({ placeholder: expectedPlaceholder });
		} finally {
			placeholderContribution?.setAnimateTransitions(false);
		}
	}, intervalMs));

	return store;
}
