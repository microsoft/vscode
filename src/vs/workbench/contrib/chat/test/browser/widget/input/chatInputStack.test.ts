/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { chatInputStackClass, ChatInputStackSlot, refreshChatInputStack, setChatInputStackInputFocused, setChatInputStackInputWorking, setChatInputStackSlot } from '../../../../browser/widget/input/chatInputStack.js';

suite('chat input stack', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** Build a stack of slots and report which of them continue the run above. */
	function stack(...states: readonly ChatInputStackSlot[]) {
		const root = dom.$(`.${chatInputStackClass}`);
		const slots = states.map(state => {
			const slot = dom.append(root, dom.$('div'));
			setChatInputStackSlot(slot, state);
			return slot;
		});
		return {
			root,
			slots,
			continues: () => slots.map(slot => slot.classList.contains('chat-input-stack-continues')),
			set: (index: number, state: ChatInputStackSlot) => setChatInputStackSlot(slots[index], state),
		};
	}

	const Empty = ChatInputStackSlot.Empty;
	const Docked = ChatInputStackSlot.Docked;
	const Standalone = ChatInputStackSlot.Standalone;

	test('a docked slot squares everything below it, and nothing above', () => {
		const { continues } = stack(Empty, Docked, Empty, Empty);

		assert.deepStrictEqual(continues(), [false, false, true, true]);
	});

	test('an empty slot is transparent, so hidden slots can sit anywhere in the order', () => {
		const { continues } = stack(Docked, Empty, Empty);

		assert.deepStrictEqual(continues(), [false, true, true]);
	});

	test('a standalone slot breaks the run rather than passing it on', () => {
		// The card closes its own box, so the input below keeps its own frame.
		const { continues } = stack(Docked, Standalone, Empty);

		assert.deepStrictEqual(continues(), [false, true, false]);
	});

	test('a standalone slot still joins a run it sits inside', () => {
		// Squaring its own top and closing its own bottom are separate questions.
		const { continues } = stack(Docked, Standalone, Docked, Empty);

		assert.deepStrictEqual(continues(), [false, true, false, true]);
	});

	test('the run follows the slot that changes, without the others being told', () => {
		const s = stack(Docked, Empty, Empty);

		const before = s.continues();
		s.set(0, ChatInputStackSlot.Empty);
		const cleared = s.continues();
		s.set(1, ChatInputStackSlot.Docked);
		const moved = s.continues();

		assert.deepStrictEqual({ before, cleared, moved }, {
			before: [false, true, true],
			cleared: [false, false, false],
			moved: [false, false, true],
		});
	});

	test('a nested stack continues the run its container is in', () => {
		// The sub-session tip docks above the whole composer and has to reach the
		// input inside it. Inner members are added after the outer notice docks,
		// which is the real ordering.
		const outer = stack(Docked, Empty);
		const inner = outer.slots[1];
		inner.classList.add(chatInputStackClass);
		const first = dom.append(inner, dom.$('div'));
		setChatInputStackSlot(first, ChatInputStackSlot.Empty);
		const second = dom.append(inner, dom.$('div'));
		refreshChatInputStack(outer.root);

		const seeded = [first, second].map(s => s.classList.contains('chat-input-stack-continues'));
		// Standing the outer notice down has to reach through into the inner stack.
		outer.set(0, ChatInputStackSlot.Empty);
		const afterStandDown = [first, second].map(s => s.classList.contains('chat-input-stack-continues'));

		assert.deepStrictEqual({ seeded, afterStandDown }, {
			seeded: [true, true],
			afterStandDown: [false, false],
		});
	});

	test('a slot outside a stack keeps its own frame and marks nothing', () => {
		const orphan = dom.$('div');

		setChatInputStackSlot(orphan, ChatInputStackSlot.Docked);

		assert.deepStrictEqual(
			{ docked: orphan.classList.contains('chat-input-stack-docked'), continues: orphan.classList.contains('chat-input-stack-continues') },
			{ docked: true, continues: false });
	});

	test('a slot appended after another has docked still joins the run', () => {
		// Hosts dock a notice before rendering the surface it docks to, and nothing
		// reports for a child being added.
		const s = stack(Docked);

		const late = dom.append(s.root, dom.$('div'));
		const beforeRefresh = late.classList.contains('chat-input-stack-continues');
		refreshChatInputStack(s.root);

		assert.deepStrictEqual(
			{ beforeRefresh, afterRefresh: late.classList.contains('chat-input-stack-continues') },
			{ beforeRefresh: false, afterRefresh: true });
	});

	test('a standalone slot ends the run, so nothing below it is squared', () => {
		// The composer joins a notice above it, but the controls row below keeps
		// its own spacing.
		const s = stack(Docked, Standalone);
		const below = dom.append(s.root, dom.$('div'));
		refreshChatInputStack(s.root);

		assert.deepStrictEqual(
			{ composer: s.continues()[1], below: below.classList.contains('chat-input-stack-continues') },
			{ composer: true, below: false });
	});

	test('a docked slot removed without standing down leaves the run stale', () => {
		// The one rule a slot owner must follow: report Empty before detaching.
		const s = stack(Docked, Empty);

		s.slots[0].remove();
		const afterBareRemoval = s.continues();
		setChatInputStackSlot(s.slots[0], ChatInputStackSlot.Empty);
		refreshChatInputStack(s.root);

		assert.deepStrictEqual(
			{ afterBareRemoval: afterBareRemoval[1], afterStandDown: s.slots[1].classList.contains('chat-input-stack-continues') },
			{ afterBareRemoval: true, afterStandDown: false });
	});

	test('the input reports focus and progress to the stack independently', () => {
		// Two bits on one element, written from two different places, so setting
		// one must not clear the other.
		const s = stack(Docked);
		const input = dom.append(s.root, dom.$('.interactive-input-and-side-toolbar', undefined, dom.$('.chat-input-container')));
		const inner = input.firstElementChild as HTMLElement;
		const state = () => ({
			focused: s.root.classList.contains('chat-input-stack-input-focused'),
			working: s.root.classList.contains('chat-input-stack-input-working'),
		});

		setChatInputStackInputFocused(inner, true);
		const focused = state();
		setChatInputStackInputWorking(inner, true);
		const alsoWorking = state();
		setChatInputStackInputFocused(inner, false);
		const blurred = state();

		assert.deepStrictEqual({ focused, alsoWorking, blurred }, {
			focused: { focused: true, working: false },
			alsoWorking: { focused: true, working: true },
			blurred: { focused: false, working: true },
		});
	});

	test('an input outside a stack reports nothing', () => {
		const orphan = dom.$('.chat-input-container');

		assert.doesNotThrow(() => setChatInputStackInputFocused(orphan, true));
	});
});
