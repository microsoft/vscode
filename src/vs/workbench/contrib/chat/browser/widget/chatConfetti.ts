/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';

const confettiColors = [
	'#f44336', '#e91e63', '#9c27b0', '#673ab7',
	'#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
	'#009688', '#4caf50', '#8bc34a', '#ffeb3b',
	'#ffc107', '#ff9800', '#ff5722'
];

let activeOverlay: HTMLElement | undefined;

/**
 * Triggers a confetti animation inside the given container element.
 */
export function triggerConfetti(container: HTMLElement) {
	if (activeOverlay) {
		return;
	}

	const overlay = dom.$('.chat-confetti-overlay');
	overlay.style.position = 'absolute';
	overlay.style.inset = '0';
	overlay.style.pointerEvents = 'none';
	overlay.style.overflow = 'hidden';
	overlay.style.zIndex = '1000';
	container.appendChild(overlay);
	activeOverlay = overlay;

	const { width, height } = container.getBoundingClientRect();
	for (let i = 0; i < 250; i++) {
		const part = dom.$('.chat-confetti-particle');
		part.style.position = 'absolute';
		part.style.width = `${Math.random() * 8 + 4}px`;
		part.style.height = `${Math.random() * 8 + 4}px`;
		part.style.backgroundColor = confettiColors[Math.floor(Math.random() * confettiColors.length)];
		part.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
		part.style.left = `${Math.random() * width}px`;
		part.style.top = '-10px';
		part.style.opacity = '1';

		overlay.appendChild(part);

		const targetX = (Math.random() - 0.5) * width * 0.8;
		const targetY = Math.random() * height * 0.8 + height * 0.1;
		const rotation = Math.random() * 720 - 360;
		const duration = Math.random() * 1000 + 1500;
		const delay = Math.random() * 400;

		part.animate([
			{
				transform: 'translate(0, 0) rotate(0deg)',
				opacity: 1
			},
			{
				transform: `translate(${targetX * 0.5}px, ${targetY * 0.5}px) rotate(${rotation * 0.5}deg)`,
				opacity: 1,
				offset: 0.3
			},
			{
				transform: `translate(${targetX}px, ${targetY}px) rotate(${rotation}deg)`,
				opacity: 1,
				offset: 0.75
			},
			{
				transform: `translate(${targetX * 1.1}px, ${targetY + 40}px) rotate(${rotation + 30}deg)`,
				opacity: 0
			}
		], {
			duration,
			delay,
			easing: 'linear',
			fill: 'forwards'
		});
	}

	setTimeout(() => {
		overlay.remove();
		activeOverlay = undefined;
	}, 3000);
}
