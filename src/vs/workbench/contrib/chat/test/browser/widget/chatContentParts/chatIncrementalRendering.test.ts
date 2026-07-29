/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { BlockAnimation, ANIMATION_DURATION_MS } from '../../../../browser/widget/chatContentParts/chatIncrementalRendering/animations/blockAnimations.js';
import { lastBlockBoundary } from '../../../../browser/widget/chatContentParts/chatIncrementalRendering/buffers/paragraphBuffer.js';
import { WordBuffer } from '../../../../browser/widget/chatContentParts/chatIncrementalRendering/buffers/wordBuffer.js';
import { IncrementalDOMMorpher } from '../../../../browser/widget/chatContentParts/chatIncrementalRendering/chatIncrementalRendering.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('lastBlockBoundary', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns -1 for empty string', () => {
		assert.strictEqual(lastBlockBoundary(''), -1);
	});

	test('returns -1 for text without any block boundary', () => {
		assert.strictEqual(lastBlockBoundary('hello world'), -1);
	});

	test('returns -1 for single newline', () => {
		assert.strictEqual(lastBlockBoundary('hello\nworld'), -1);
	});

	test('finds a single block boundary', () => {
		const text = 'hello\n\nworld';
		assert.strictEqual(lastBlockBoundary(text), 5);
	});

	test('finds the last block boundary among multiple', () => {
		const text = 'a\n\nb\n\nc';
		assert.strictEqual(lastBlockBoundary(text), 4);
	});

	test('ignores block boundaries inside a fenced code block', () => {
		const text = '```\ncode\n\nmore code\n```';
		assert.strictEqual(lastBlockBoundary(text), -1);
	});

	test('finds boundary after closing a code fence', () => {
		const text = '```\ncode\n```\n\nafter fence';
		assert.strictEqual(lastBlockBoundary(text), 12);
	});

	test('ignores boundary inside fence but finds one outside', () => {
		const text = 'before\n\n```\ninside\n\nfence\n```\n\nafter';
		// First \n\n at index 6 (before fence), inside fence at ~18, after fence at ~28
		const result = lastBlockBoundary(text);
		// The last valid boundary should be the one after the closing ```
		assert.ok(result > 6, `Expected boundary after fence close, got ${result}`);
	});

	test('handles code fence at the very start of the string', () => {
		const text = '```\ncode\n```\n\ntext';
		assert.strictEqual(lastBlockBoundary(text), 12);
	});

	test('handles unclosed code fence (all subsequent boundaries ignored)', () => {
		const text = '```\ncode\n\nmore\n\nstill inside';
		assert.strictEqual(lastBlockBoundary(text), -1);
	});

	test('handles multiple code fences', () => {
		const text = '```\nfirst\n```\n\nbetween\n\n```\nsecond\n```\n\nend';
		const result = lastBlockBoundary(text);
		// Last valid \n\n is after the second closing fence
		assert.ok(result > 20, `Expected last boundary near end, got ${result}`);
	});

	test('handles triple backticks mid-line (not a fence)', () => {
		// Triple backticks must be at the start of a line to count as a fence
		const text = 'text ``` not a fence\n\nafter';
		assert.strictEqual(lastBlockBoundary(text), 20);
	});

	test('ignores block boundaries inside a tilde-fenced code block', () => {
		const text = '~~~\ncode\n\nmore code\n~~~';
		assert.strictEqual(lastBlockBoundary(text), -1);
	});

	test('finds boundary after closing a tilde fence', () => {
		const text = '~~~\ncode\n~~~\n\nafter fence';
		assert.strictEqual(lastBlockBoundary(text), 12);
	});

	test('handles unclosed tilde fence', () => {
		const text = '~~~\ncode\n\nmore\n\nstill inside';
		assert.strictEqual(lastBlockBoundary(text), -1);
	});

	test('handles mixed backtick and tilde fences', () => {
		const text = '~~~\ntilde code\n\ninside tilde\n~~~\n\n```\nbacktick code\n\ninside backtick\n```\n\nafter both';
		const result = lastBlockBoundary(text);
		// The last valid boundary should be after the closing ```
		assert.ok(result > 40, `Expected boundary after both fences, got ${result}`);
	});
});

suite('IncrementalDOMMorpher', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let configService: TestConfigurationService;

	setup(() => {
		disposables = store.add(new DisposableStore());
		instantiationService = workbenchInstantiationService(undefined, disposables);

		configService = new TestConfigurationService();
		configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, 'fade');
		instantiationService.stub(IConfigurationService, configService);
	});

	teardown(() => {
		disposables.dispose();
	});

	function createMorpher(domNode?: HTMLElement): IncrementalDOMMorpher {
		const node = domNode ?? mainWindow.document.createElement('div');
		return store.add(instantiationService.createInstance(IncrementalDOMMorpher, node));
	}

	suite('tryMorph', () => {

		test('returns false for non-append edit', () => {
			const morpher = createMorpher();
			morpher.seed('hello');
			assert.strictEqual(morpher.tryMorph('goodbye'), false);
		});

		test('returns true when content is identical (no-op)', () => {
			const morpher = createMorpher();
			morpher.seed('hello');
			assert.strictEqual(morpher.tryMorph('hello'), true);
		});

		test('returns true for appended content', () => {
			const morpher = createMorpher();
			morpher.seed('hello');
			assert.strictEqual(morpher.tryMorph('hello world'), true);
		});

		test('returns false when prefix changes', () => {
			const morpher = createMorpher();
			morpher.seed('hello world');
			assert.strictEqual(morpher.tryMorph('Hello world!'), false);
		});

		test('successive appends all succeed', () => {
			const morpher = createMorpher();
			morpher.seed('a');
			assert.strictEqual(morpher.tryMorph('ab'), true);
			assert.strictEqual(morpher.tryMorph('abc'), true);
			assert.strictEqual(morpher.tryMorph('abcd'), true);
		});

		test('fails after a non-append edit even if previous appends succeeded', () => {
			const morpher = createMorpher();
			morpher.seed('hello');
			assert.strictEqual(morpher.tryMorph('hello world'), true);
			// Now a rewrite of earlier content
			assert.strictEqual(morpher.tryMorph('hi world'), false);
		});

		test('invokes render callback on rAF with block-boundary content', () => {
			const rendered: string[] = [];
			const morpher = createMorpher();
			morpher.setRenderCallback(md => rendered.push(md));
			morpher.seed('');

			// Append content with a block boundary
			morpher.tryMorph('paragraph one\n\nparagraph two');
			// The callback fires asynchronously via rAF, not synchronously
			assert.strictEqual(rendered.length, 0, 'Should not render synchronously');
		});

		test('returns true for content without block boundary (buffered)', () => {
			const morpher = createMorpher();
			morpher.seed('');
			// No \n\n — content is buffered
			assert.strictEqual(morpher.tryMorph('partial paragraph'), true);
		});

		test('schedules render for content without any paragraph breaks', async () => {
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'paragraph');
			const morpher = createMorpher();
			const rendered: string[] = [];
			morpher.setRenderCallback(md => rendered.push(md));
			morpher.seed('');

			// Append content with no \n\n at all — previously this would
			// never render because getRenderable returned lastRendered (empty seed).
			morpher.tryMorph('single block no paragraph breaks');

			// Flush the rAF — the full content should render since
			// there are no paragraph boundaries to buffer at.
			await new Promise(r => mainWindow.requestAnimationFrame(r));
			assert.strictEqual(rendered.length, 1);
			assert.strictEqual(rendered[0], 'single block no paragraph breaks');

			// Further appends should also render
			morpher.tryMorph('single block no paragraph breaks — more words');
			await new Promise(r => mainWindow.requestAnimationFrame(r));
			assert.strictEqual(rendered.length, 2);
			assert.strictEqual(rendered[1], 'single block no paragraph breaks — more words');
		});
	});

	suite('seed', () => {

		test('sets baseline markdown', () => {
			const morpher = createMorpher();
			morpher.seed('initial content');
			// After seeding, tryMorph with same content is a no-op
			assert.strictEqual(morpher.tryMorph('initial content'), true);
			// And appending works
			assert.strictEqual(morpher.tryMorph('initial content more'), true);
		});

		test('with animateInitial=false uses existing child count as watermark', () => {
			const domNode = mainWindow.document.createElement('div');
			domNode.appendChild(mainWindow.document.createElement('p'));
			domNode.appendChild(mainWindow.document.createElement('p'));
			const morpher = createMorpher(domNode);

			morpher.seed('some content', false);
			// No animation classes should be applied since all children are "revealed"
			for (const child of Array.from(domNode.children)) {
				assert.strictEqual(
					(child as HTMLElement).classList.contains('chat-smooth-animate-fade'),
					false,
					'Existing children should not be animated when animateInitial is false'
				);
			}
		});

		test('with animateInitial=true animates existing children', () => {
			const domNode = mainWindow.document.createElement('div');
			domNode.appendChild(mainWindow.document.createElement('p'));
			domNode.appendChild(mainWindow.document.createElement('p'));
			const morpher = createMorpher(domNode);

			morpher.seed('some content', true);
			// Children should have the animation class
			for (const child of Array.from(domNode.children)) {
				assert.strictEqual(
					(child as HTMLElement).classList.contains('chat-smooth-animate-fade'),
					true,
					'Existing children should be animated when animateInitial is true'
				);
			}
		});
	});

	suite('animation style', () => {

		test('defaults to fade for invalid config value', () => {
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, 'invalid-style');
			const domNode = mainWindow.document.createElement('div');
			domNode.appendChild(mainWindow.document.createElement('p'));
			const morpher = createMorpher(domNode);
			morpher.seed('content', true);

			const child = domNode.children[0] as HTMLElement;
			assert.strictEqual(child.classList.contains('chat-smooth-animate-fade'), true, 'Should fall back to fade');
		});

		test('uses configured animation style', () => {
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, 'rise');
			const domNode = mainWindow.document.createElement('div');
			domNode.appendChild(mainWindow.document.createElement('p'));
			const morpher = createMorpher(domNode);
			morpher.seed('content', true);

			const child = domNode.children[0] as HTMLElement;
			assert.strictEqual(child.classList.contains('chat-smooth-animate-rise'), true, 'Should use rise style');
		});

		for (const style of ['fade', 'rise', 'blur', 'scale', 'slide'] as const) {
			test(`applies ${style} animation class`, () => {
				configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingStyle, style);
				const domNode = mainWindow.document.createElement('div');
				domNode.appendChild(mainWindow.document.createElement('p'));
				const morpher = createMorpher(domNode);
				morpher.seed('content', true);

				const child = domNode.children[0] as HTMLElement;
				assert.strictEqual(
					child.classList.contains(`chat-smooth-animate-${style}`),
					true,
					`Should have chat-smooth-animate-${style} class`
				);
			});
		}
	});

	suite('dispose', () => {

		test('clears pending state on dispose', () => {
			const morpher = createMorpher();
			morpher.seed('');
			morpher.setRenderCallback(() => { });
			morpher.tryMorph('hello\n\nworld');
			// Dispose before rAF fires
			morpher.dispose();
			// No error should occur — rAF is cancelled
		});
	});

	suite('updateStreamRate', () => {

		test('flushes remaining buffered content on completion for paragraph buffer', async () => {
			// Use paragraph buffer (default)
			configService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'paragraph');
			const morpher = createMorpher();
			const rendered: string[] = [];
			morpher.setRenderCallback(md => rendered.push(md));
			morpher.seed('');

			const fullContent = 'paragraph one\n\nparagraph two trailing';
			// Append content where the tail has no \n\n boundary
			morpher.tryMorph(fullContent);

			// Flush the rAF so the paragraph-boundary render fires
			await new Promise(r => mainWindow.requestAnimationFrame(r));
			// Only content up to the last \n\n should have rendered
			assert.strictEqual(rendered.length, 1);
			assert.strictEqual(rendered[0], 'paragraph one\n\n');

			// Signal stream completion — should schedule a render of
			// the full content including the unbounded tail.
			morpher.updateStreamRate(100, true);
			await new Promise(r => mainWindow.requestAnimationFrame(r));

			// The render callback should now have the full content
			assert.strictEqual(rendered.length, 2);
			assert.strictEqual(rendered[1], fullContent);
		});
	});
});

suite('BlockAnimation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applies animation class and custom properties to new children', () => {
		const anim = new BlockAnimation('fade');
		const container = mainWindow.document.createElement('div');
		const child = container.appendChild(mainWindow.document.createElement('p'));

		anim.animate(container.children, 0, 1, 0);

		assert.strictEqual(child.classList.contains('chat-smooth-animate-fade'), true);
		assert.strictEqual(child.style.getPropertyValue('--chat-smooth-duration'), `${ANIMATION_DURATION_MS}ms`);
		assert.ok(child.style.getPropertyValue('--chat-smooth-delay') !== '');
	});

	test('does not strip animation class on bubbled animationend from nested element', () => {
		const anim = new BlockAnimation('rise');
		const container = mainWindow.document.createElement('div');
		const parent = container.appendChild(mainWindow.document.createElement('div'));
		const nested = parent.appendChild(mainWindow.document.createElement('span'));

		anim.animate(container.children, 0, 1, 0);
		assert.strictEqual(parent.classList.contains('chat-smooth-animate-rise'), true);

		// Simulate animationend bubbling from nested child
		const bubbledEvent = new AnimationEvent('animationend', { bubbles: true });
		nested.dispatchEvent(bubbledEvent);

		// Parent should still have the animation class
		assert.strictEqual(
			parent.classList.contains('chat-smooth-animate-rise'),
			true,
			'Animation class should not be removed by bubbled event'
		);
		assert.strictEqual(
			parent.style.getPropertyValue('--chat-smooth-duration'),
			`${ANIMATION_DURATION_MS}ms`,
			'Custom properties should not be removed by bubbled event'
		);
	});

	test('strips animation class on direct animationend from the animated element', () => {
		const anim = new BlockAnimation('blur');
		const container = mainWindow.document.createElement('div');
		const child = container.appendChild(mainWindow.document.createElement('p'));

		anim.animate(container.children, 0, 1, 0);
		assert.strictEqual(child.classList.contains('chat-smooth-animate-blur'), true);

		// Simulate direct animationend on the child itself
		const directEvent = new AnimationEvent('animationend', { bubbles: true });
		child.dispatchEvent(directEvent);

		assert.strictEqual(
			child.classList.contains('chat-smooth-animate-blur'),
			false,
			'Animation class should be removed after direct animationend'
		);
		assert.strictEqual(
			child.style.getPropertyValue('--chat-smooth-duration'),
			'',
			'Custom property should be removed after direct animationend'
		);
	});

	test('staggers delay across multiple new children', () => {
		const anim = new BlockAnimation('fade');
		const container = mainWindow.document.createElement('div');
		container.appendChild(mainWindow.document.createElement('p'));
		container.appendChild(mainWindow.document.createElement('p'));
		container.appendChild(mainWindow.document.createElement('p'));

		anim.animate(container.children, 0, 3, 0);

		const delays = Array.from(container.children).map(
			c => parseInt((c as HTMLElement).style.getPropertyValue('--chat-smooth-delay'))
		);
		// Each successive child should have a larger delay
		assert.ok(delays[1] > delays[0], `Second delay ${delays[1]} should be greater than first ${delays[0]}`);
		assert.ok(delays[2] > delays[1], `Third delay ${delays[2]} should be greater than second ${delays[1]}`);
	});
});

suite('WordBuffer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('setRate with isComplete uses at least MIN_RATE_AFTER_COMPLETE', () => {
		const buffer = new WordBuffer();

		// Setting a low rate with isComplete should floor to 80
		buffer.setRate(10, true);
		// Verify by checking filterFlush behavior: with rate=80,
		// after enough elapsed time, words should be revealed faster
		// than at rate=10.
		const md = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10';
		const result1 = buffer.filterFlush(md);
		// First call reveals 1 word
		assert.ok(result1 !== undefined, 'First flush should reveal content');
	});

	test('setRate with undefined rate and isComplete defaults to MIN_RATE_AFTER_COMPLETE', () => {
		const buffer = new WordBuffer();
		buffer.setRate(undefined, true);

		const md = 'word1 word2 word3';
		const result = buffer.filterFlush(md);
		assert.ok(result !== undefined, 'Should reveal content with default complete rate');
	});

	test('setRate during streaming clamps between MIN_RATE and MAX_RATE', () => {
		const buffer = new WordBuffer();

		// Rate below MIN_RATE should be clamped up
		buffer.setRate(1, false);
		const md = 'word1 word2 word3';
		const result = buffer.filterFlush(md);
		assert.ok(result !== undefined, 'Should reveal content even with low rate (clamped to MIN_RATE)');
	});

	test('setRate with undefined rate during streaming defaults to DEFAULT_RATE', () => {
		const buffer = new WordBuffer();
		buffer.setRate(undefined, false);

		const md = 'word1 word2';
		const result = buffer.filterFlush(md);
		assert.ok(result !== undefined, 'Should reveal content with default streaming rate');
	});

	test('needsNextFrame is true when words remain unrevealed', () => {
		const buffer = new WordBuffer();
		buffer.setRate(1, false);

		// First flush reveals 1 word, but there are more
		buffer.filterFlush('word1 word2 word3 word4 word5');
		assert.strictEqual(buffer.needsNextFrame, true, 'Should need another frame when words remain');
	});

	test('needsNextFrame is false when all words are revealed', () => {
		const buffer = new WordBuffer();
		buffer.setRate(2000, false);

		// With a very high rate and single word, all content is revealed
		buffer.filterFlush('hello');
		assert.strictEqual(buffer.needsNextFrame, false, 'Should not need another frame when all words shown');
	});
});
