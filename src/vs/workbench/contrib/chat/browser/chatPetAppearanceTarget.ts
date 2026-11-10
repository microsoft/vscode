/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, ISettableObservable } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ChatPetAccessoryId } from './chatPetAchievements.js';
import { ChatPetColor } from './chatPetColors.js';
import { ChatPetAppearanceTarget, ChatPetWindowKind, getChatPetAppearanceTargetWindows, IChatPetService } from './chatPetService.js';

const chatPetAppearanceTargets: readonly ChatPetAppearanceTarget[] = ['both', 'editor', 'agents'];

/**
 * Which targeted windows use an appearance option: `'all'` when every targeted window uses it,
 * the window kind when only one of the targeted windows uses it, or `undefined` when none do.
 */
export type ChatPetAppearanceSelection = 'all' | ChatPetWindowKind | undefined;

export function getChatPetAppearanceSelection<T>(target: ChatPetAppearanceTarget, getWindowValue: (windowKind: ChatPetWindowKind) => T, option: T): ChatPetAppearanceSelection {
	const targetWindows = getChatPetAppearanceTargetWindows(target);
	const selectingWindows = targetWindows.filter(windowKind => getWindowValue(windowKind) === option);
	if (selectingWindows.length === 0) {
		return undefined;
	}
	return selectingWindows.length === targetWindows.length ? 'all' : selectingWindows[0];
}

/** An option used by only some of the targeted windows is partially pressed. */
export function getChatPetAppearanceSelectionPressedState(selection: ChatPetAppearanceSelection): 'true' | 'mixed' | 'false' {
	return selection === 'all' ? 'true' : selection ? 'mixed' : 'false';
}

/** The color that represents the target: the targeted window's color, or the current window's color for both. */
export function getChatPetTargetColor(chatPetService: IChatPetService, target: ChatPetAppearanceTarget): IObservable<ChatPetColor> {
	return target === 'both' ? chatPetService.color : chatPetService.getWindowColor(target);
}

/** The hat that represents the target: the targeted window's hat, or the current window's hat for both. */
export function getChatPetTargetAccessory(chatPetService: IChatPetService, target: ChatPetAppearanceTarget): IObservable<ChatPetAccessoryId | undefined> {
	return target === 'both' ? chatPetService.selectedAccessory : chatPetService.getWindowAccessory(target);
}

function getChatPetAppearanceTargetLabel(target: ChatPetAppearanceTarget): string {
	switch (target) {
		case 'both':
			return localize('chatPet.appearanceTarget.both', "Both Windows");
		case 'editor':
			return localize('chatPet.appearanceTarget.editor', "Editor Window");
		case 'agents':
			return localize('chatPet.appearanceTarget.agents', "Agents Window");
	}
}

/** Renders the choice of windows that Blobby's color and hat changes apply to. */
export function renderChatPetAppearanceTargetPicker(parent: HTMLElement, target: ISettableObservable<ChatPetAppearanceTarget>, onDidRequestClose: () => void): IDisposable {
	const store = new DisposableStore();
	const container = DOM.append(parent, DOM.$('.chat-pet-appearance-target'));
	const label = DOM.append(container, DOM.$('span.chat-pet-appearance-target-label', { id: generateUuid() }));
	label.textContent = localize('chatPet.appearanceTarget.label', "Apply to");
	const radio = store.add(new Radio({
		className: 'segmented',
		items: chatPetAppearanceTargets.map(candidate => ({
			text: getChatPetAppearanceTargetLabel(candidate),
			isActive: candidate === target.get(),
		})),
	}));
	radio.domNode.setAttribute('aria-labelledby', label.id);
	container.appendChild(radio.domNode);
	store.add(radio.onDidSelect(index => target.set(chatPetAppearanceTargets[index], undefined)));
	store.add(autorun(reader => radio.setActiveItem(chatPetAppearanceTargets.indexOf(target.read(reader)))));
	// The option buttons consume Escape, so close the page before they receive it.
	store.add(DOM.addDisposableListener(radio.domNode, DOM.EventType.KEY_DOWN, e => {
		if (new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
			DOM.EventHelper.stop(e, true);
			onDidRequestClose();
		}
	}, true));
	return store;
}
