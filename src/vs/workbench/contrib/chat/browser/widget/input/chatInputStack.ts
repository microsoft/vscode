/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../../../base/browser/dom.js';
import './media/chatInputStack.css';

/**
 * A regularly spaced column of standalone surfaces around the docked chat input
 * stack. The stack owns the space between members so cards do not compound it
 * with component-specific margins.
 */
export const chatInputSurfaceStackClass = 'chat-input-surface-stack';

/** Marks a dynamic member of the surface stack, which disappears while empty. */
export const chatInputSurfaceStackSlotClass = 'chat-input-surface-stack-slot';

/**
 * A column of surfaces above a chat input - notices, the goal banner, the todo
 * list, artifacts, the working set - plus the input itself.
 *
 * A docked surface leaves its bottom edge open, and whatever follows it squares
 * its top corners, so a run of them looks like one surface. The stack works that
 * out, so no member needs to know which of its neighbours are on screen.
 */
export const chatInputStackClass = 'chat-input-stack';

/**
 * Marks an element as a slot the stack manages. Slots are hidden while they
 * show nothing, so a producer does not need its own rule for that. Members that
 * are always present - the input, a workspace picker - are left unmarked.
 */
export const chatInputStackSlotClass = 'chat-input-stack-slot';

/** What a slot is showing. This is all a slot has to report. */
export const enum ChatInputStackSlot {
	/** Nothing. Ignored, so a hidden slot can sit anywhere in the order. */
	Empty,
	/** Content that joins the surface below, which continues the run. */
	Docked,
	/**
	 * Content that closes its own box - an onboarding card, the composer - so the
	 * run stops here. It can still join a run above it.
	 */
	Standalone,
}

const dockedClass = 'chat-input-stack-docked';
const standaloneClass = 'chat-input-stack-standalone';
/** Set by the stack, not by slots: this slot continues the run above it. */
const continuesClass = 'chat-input-stack-continues';
/** Set from the input: what its frame is doing, for the run above to match. */
const inputFocusedClass = 'chat-input-stack-input-focused';
const inputWorkingClass = 'chat-input-stack-input-working';

/**
 * Report what a slot is showing.
 *
 * Does not touch `display`; hosts do that in their own CSS using these classes.
 * Setting it here would blank the element when passed something that is not a
 * slot.
 */
export function setChatInputStackSlot(slot: HTMLElement | null | undefined, state: ChatInputStackSlot): void {
	if (!slot) {
		return;
	}
	slot.classList.toggle(dockedClass, state === ChatInputStackSlot.Docked);
	slot.classList.toggle(standaloneClass, state === ChatInputStackSlot.Standalone);

	refreshChatInputStack(slot.parentElement);
}

/** Whether a slot is showing anything. */
export function isChatInputStackSlotShowing(slot: HTMLElement): boolean {
	return slot.classList.contains(dockedClass) || slot.classList.contains(standaloneClass);
}

/**
 * Report the input's focus to the stack, so a surface docked to it carries the
 * focus ring across the join.
 *
 * Reported up rather than read back down with `:has()`. The stack contains
 * every surface above the input, and that is where notices, todos and artifacts
 * render, so a selector that inspects the subtree is re-evaluated far more
 * often than this state actually changes.
 */
export function setChatInputStackInputFocused(input: HTMLElement, focused: boolean): void {
	setChatInputStackInputState(input, inputFocusedClass, focused);
}

/** Report the input's progress border, which dims the focus ring it shares. */
export function setChatInputStackInputWorking(input: HTMLElement, working: boolean): void {
	setChatInputStackInputState(input, inputWorkingClass, working);
}

/**
 * Recompute a stack after its children change. Slots report for themselves, but
 * nothing reports for a child being added, and hosts often dock a notice before
 * rendering the surface it docks to.
 */
export function refreshChatInputStack(stack: HTMLElement | null | undefined): void {
	if (stack?.classList.contains(chatInputStackClass)) {
		updateChatInputStack(stack);
	}
}

/**
 * Mark the slots that continue a run.
 *
 * A scan rather than a CSS sibling selector, because what matters is the nearest
 * non-empty slot above and `~` matches any of them - it would reach past a
 * standalone card. Splitting that across rules ties on specificity, which broke
 * two earlier attempts.
 */
function updateChatInputStack(stack: HTMLElement): void {
	// Seeded from the stack's own state so nested stacks join the outer run.
	let docked = stack.classList.contains(continuesClass);

	for (const slot of stack.children) {
		if (!isHTMLElement(slot)) {
			continue;
		}
		slot.classList.toggle(continuesClass, docked);

		if (slot.classList.contains(dockedClass)) {
			docked = true;
		} else if (slot.classList.contains(standaloneClass)) {
			docked = false;
		}

		if (slot.classList.contains(chatInputStackClass)) {
			updateChatInputStack(slot);
		}
	}
}

function setChatInputStackInputState(input: HTMLElement, stateClass: string, enabled: boolean): void {
	input.closest(`.${chatInputStackClass}`)?.classList.toggle(stateClass, enabled);
}
