/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node, card } from './ui.js';

export function createMotionPreviews() {
	const listeners = new AbortController();
	const animations = new Map();
	const dots = [];
	const media = matchMedia('(prefers-reduced-motion: reduce)');
	let simulateReduced = false;
	const element = node('section', undefined, 'motion-previews');
	element.id = 'motion-previews';
	element.setAttribute('aria-label', 'Illustrative motion previews');
	element.append(node('h3', 'Visual motion examples'),
		node('p', 'Replay these simple diagrams to compare motion. The timings, browser easing keywords, and transitions are illustrative values, not proposed or approved VS Code tokens.', 'muted'));
	const toolbar = node('div', undefined, 'tools motion-preview-controls');
	const duration = select('Preview duration', 'motion-preview-duration', [['200', '200 ms'], ['400', '400 ms'], ['800', '800 ms'], ['1200', '1200 ms']], '800');
	const reducedLabel = node('label', undefined, 'motion-preview-check');
	const reduced = node('input');
	reduced.type = 'checkbox';
	reducedLabel.append(reduced, 'Preview reduced motion');
	const stop = button('Stop motion', () => stopAll('Stopped; final state shown.'));
	const preference = node('p', undefined, 'meta');
	preference.id = 'motion-preview-preference';
	preference.setAttribute('role', 'status');
	stop.setAttribute('aria-describedby', preference.id);
	toolbar.append(duration.label, reducedLabel, stop);
	element.append(toolbar, preference);
	const grid = node('div', undefined, 'grid motion-preview-grid');
	element.append(grid);

	function button(text, handler) {
		const control = node('button', text);
		control.type = 'button';
		control.addEventListener('click', handler, { signal: listeners.signal });
		return control;
	}

	function select(text, id, options, value) {
		const label = node('label');
		const caption = node('span', text);
		caption.id = `${id}-label`;
		const control = node('select');
		control.id = id;
		control.setAttribute('aria-labelledby', caption.id);
		for (const [optionValue, text] of options) {
			const option = node('option', text);
			option.value = optionValue;
			control.append(option);
		}
		control.value = value;
		label.append(caption, control);
		return { label, control };
	}

	function status(text) {
		const message = node('p', text, 'motion-preview-status');
		message.setAttribute('role', 'status');
		return message;
	}

	function cancel(target) {
		const entry = animations.get(target);
		if (entry) {
			entry.animation.onfinish = null;
			entry.animation.cancel();
			animations.delete(target);
		}
	}

	function stopAll(message) {
		const statuses = new Set([...animations.values()].map(entry => entry.status));
		for (const target of [...animations.keys()]) {
			cancel(target);
		}
		if (message) {
			for (const target of statuses) {
				target.textContent = message;
			}
		}
	}

	function isReduced() {
		return media.matches || simulateReduced;
	}

	function animate(target, frames, options, message, done) {
		cancel(target);
		const animation = target.animate(frames, options);
		animations.set(target, { animation, status: message });
		animation.onfinish = () => {
			if (animations.get(target)?.animation === animation) {
				animations.delete(target);
				animation.onfinish = null;
				animation.cancel();
				done();
			}
		};
	}

	function track() {
		const rail = node('div', undefined, 'motion-preview-track');
		rail.setAttribute('aria-hidden', 'true');
		const square = node('span', undefined, 'motion-preview-square');
		rail.append(square);
		const dot = { rail, square, atEnd: false };
		dots.push(dot);
		return dot;
	}

	function position(dot, end) {
		dot.atEnd = end;
		const distance = Math.max(0, dot.rail.clientWidth - 24 - dot.square.offsetWidth);
		const transform = `translateX(${end ? distance : 0}px)`;
		dot.square.style.transform = transform;
		return transform;
	}

	const easingCard = card('Square easing', 'The same square travels the same distance. Change the curve to see how its speed changes.');
	const easing = select('Square easing', 'motion-preview-easing', ['linear', 'ease-in', 'ease-out', 'ease-in-out'].map(value => [value, value]), 'ease-out');
	const square = track();
	const easingStatus = status('Ready. Nothing plays automatically.');
	const easingActions = node('div', undefined, 'tools');
	easingActions.append(button('Replay square', () => {
		cancel(square.square);
		const end = position(square, true);
		if (isReduced()) {
			easingStatus.textContent = 'Reduced motion: square at the end, without travel.';
			return;
		}
		easingStatus.textContent = `Playing ${duration.control.value} ms with ${easing.control.value}.`;
		animate(square.square, [{ transform: 'translateX(0px)' }, { transform: end }],
			{ duration: Number(duration.control.value), easing: easing.control.value }, easingStatus,
			() => { easingStatus.textContent = 'Complete. Replay to compare another curve.'; });
	}), button('Reset square', () => {
		cancel(square.square);
		position(square, false);
		easingStatus.textContent = 'Reset to the start.';
	}));
	easingCard.append(easing.label, square.rail, easingActions, easingStatus);
	grid.append(easingCard);

	const panelCard = card('Panel enter and exit', 'Compare a fade, slide, or scale. Reverse direction while it is moving, or replay by entering and exiting.');
	const transition = select('Panel transition', 'motion-preview-transition', [['fade', 'Fade'], ['slide', 'Slide and fade'], ['scale', 'Scale and fade']], 'slide');
	const stage = node('div', undefined, 'motion-preview-panel-stage');
	stage.setAttribute('aria-hidden', 'true');
	const panel = node('div', undefined, 'motion-preview-panel');
	panel.append(node('span', 'Panel preview'), node('div', undefined, 'motion-preview-panel-line'), node('div', undefined, 'motion-preview-panel-line short'));
	panel.dataset.state = 'hidden';
	stage.append(panel);
	const panelStatus = status('Panel hidden.');
	let shown = false;
	function togglePanel(next) {
		const interrupted = animations.has(panel);
		const visual = getComputedStyle(panel);
		const current = { opacity: visual.opacity, transform: visual.transform };
		cancel(panel);
		const hiddenTransform = transition.control.value === 'slide' ? 'translateY(16px)' : transition.control.value === 'scale' ? 'scale(0.94)' : 'none';
		const from = interrupted ? current : { opacity: shown ? 1 : 0, transform: shown ? 'none' : hiddenTransform };
		const to = { opacity: next ? 1 : 0, transform: next ? 'none' : hiddenTransform };
		shown = next;
		panel.dataset.state = next ? 'shown' : 'hidden';
		panel.style.opacity = String(to.opacity);
		panel.style.transform = to.transform;
		enter.disabled = next;
		exit.disabled = !next;
		if (isReduced()) {
			panelStatus.textContent = `Reduced motion: panel ${next ? 'shown' : 'hidden'} immediately.`;
			return;
		}
		panelStatus.textContent = next ? 'Panel entering...' : 'Panel exiting...';
		animate(panel, [from, to], { duration: Number(duration.control.value), easing: 'ease-out' }, panelStatus,
			() => { panelStatus.textContent = next ? 'Panel shown.' : 'Panel hidden.'; });
	}
	const enter = button('Enter panel', () => togglePanel(true));
	const exit = button('Exit panel', () => togglePanel(false));
	exit.disabled = true;
	const panelActions = node('div', undefined, 'tools');
	panelActions.append(enter, exit);
	panelCard.append(transition.label, stage, panelActions, panelStatus);
	grid.append(panelCard);

	const comparison = card('Compare durations', 'Three identical distances and the same linear easing. Only the duration changes.');
	const comparisonStatus = status('Ready to compare 200, 500, and 1000 ms.');
	const rows = [200, 500, 1000].map(milliseconds => {
		const row = node('div', undefined, 'motion-preview-duration-row');
		const dot = track();
		row.append(node('span', `${milliseconds} ms`, 'meta'), dot.rail);
		comparison.append(row);
		return { dot, milliseconds };
	});
	comparison.append(button('Replay durations', () => {
		for (const { dot } of rows) {
			cancel(dot.square);
		}
		if (isReduced()) {
			for (const { dot } of rows) {
				position(dot, true);
			}
			comparisonStatus.textContent = 'Reduced motion: all final positions shown without travel.';
			return;
		}
		comparisonStatus.textContent = 'Comparing 200, 500, and 1000 ms.';
		let remaining = rows.length;
		for (const { dot, milliseconds } of rows) {
			const end = position(dot, true);
			animate(dot.square, [{ transform: 'translateX(0px)' }, { transform: end }],
				{ duration: milliseconds, easing: 'linear' }, comparisonStatus, () => {
					if (--remaining === 0) {
						comparisonStatus.textContent = 'Comparison complete. All three reached the same destination.';
					}
				});
		}
	}), comparisonStatus);
	grid.append(comparison);

	function updatePreference() {
		reduced.disabled = media.matches;
		reduced.checked = media.matches || simulateReduced;
		preference.textContent = media.matches
			? 'System reduced motion is on. Previews show final states without animation.'
			: reduced.checked ? 'Reduced-motion preview is on. Previews show final states without animation.'
				: 'Motion plays only when requested. Stop motion shows final states.';
		if (isReduced()) {
			stopAll('Reduced motion: final state shown.');
		}
	}
	media.addEventListener('change', updatePreference, { signal: listeners.signal });
	reduced.addEventListener('change', () => {
		simulateReduced = reduced.checked;
		updatePreference();
	}, { signal: listeners.signal });
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			stopAll('Stopped while hidden; final state shown.');
		}
	}, { signal: listeners.signal });
	window.addEventListener('resize', () => {
		stopAll('Preview resized; final state shown.');
		for (const dot of dots) {
			position(dot, dot.atEnd);
		}
	}, { signal: listeners.signal });
	updatePreference();

	return {
		element,
		dispose() {
			listeners.abort();
			stopAll();
		},
	};
}
