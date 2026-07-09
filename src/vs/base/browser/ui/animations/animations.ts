/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../common/themables.js';
import * as dom from '../../dom.js';

export const enum ClickAnimation {
	Confetti = 1,
	FloatingIcons = 2,
	PulseWave = 3,
	RadiantLines = 4,
}

const confettiColors = [
	'#007acc',
	'#005a9e',
	'#0098ff',
	'#4fc3f7',
	'#64b5f6',
	'#42a5f5',
];

let activeOverlay: HTMLElement | undefined;

/**
 * Creates a fixed-positioned overlay centered on the given element.
 */
function createOverlay(element: HTMLElement): { overlay: HTMLElement; cx: number; cy: number } | undefined {
	if (activeOverlay) {
		return undefined;
	}

	const rect = element.getBoundingClientRect();
	const ownerDocument = dom.getWindow(element).document;

	const overlay = dom.$('.animation-overlay');
	overlay.style.position = 'fixed';
	overlay.style.left = `${rect.left}px`;
	overlay.style.top = `${rect.top}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
	overlay.style.pointerEvents = 'none';
	overlay.style.overflow = 'visible';
	overlay.style.zIndex = '10000';

	ownerDocument.body.appendChild(overlay);
	activeOverlay = overlay;

	return { overlay, cx: rect.width / 2, cy: rect.height / 2 };
}

/**
 * Cleans up the overlay after specified period.
 */
function cleanupOverlay(duration: number) {
	setTimeout(() => {
		if (activeOverlay) {
			activeOverlay.remove();
			activeOverlay = undefined;
		}
	}, duration);
}

/**
 * Bounce the element with a given scale and optional rotation.
 */
export function bounceElement(element: HTMLElement, opts: { scale?: number[]; rotate?: number[]; translateY?: number[]; duration?: number }) {
	const frames: Keyframe[] = [];

	const steps = Math.max(opts.scale?.length ?? 0, opts.rotate?.length ?? 0, opts.translateY?.length ?? 0);
	if (steps === 0) {
		return;
	}

	for (let i = 0; i < steps; i++) {
		const frame: Keyframe = { offset: steps === 1 ? 1 : i / (steps - 1) };
		let transformParts = '';

		const scale = opts.scale?.[i];
		if (scale !== undefined) {
			transformParts += `scale(${scale})`;
		}

		const rotate = opts.rotate?.[i];
		if (rotate !== undefined) {
			transformParts += ` rotate(${rotate}deg)`;
		}

		const translateY = opts.translateY?.[i];
		if (translateY !== undefined) {
			transformParts += ` translateY(${translateY}px)`;
		}

		if (transformParts) {
			frame.transform = transformParts.trim();
		}
		frames.push(frame);
	}

	element.animate(frames, {
		duration: opts.duration ?? 350,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		fill: 'forwards',
	});
}

/**
 * Confetti: small particles burst outward in a circle from the element center,
 * with an expanding ring.
 */
export function triggerConfettiAnimation(element: HTMLElement) {
	const result = createOverlay(element);
	if (!result) {
		return;
	}

	const { overlay, cx, cy } = result;
	const rect = element.getBoundingClientRect();

	// Element bounce
	bounceElement(element, {
		scale: [1, 1.3, 1],
		rotate: [0, -10, 10, 0],
		duration: 350,
	});

	// Confetti particles
	const particleCount = 10;
	for (let i = 0; i < particleCount; i++) {
		const size = 3 + (i % 3) * 1.5;
		const angle = (i * 36 * Math.PI) / 180;
		const distance = 35;
		const particleOpacity = 0.6 + (i % 4) * 0.1;

		const part = dom.$('.animation-particle');
		part.style.position = 'absolute';
		part.style.width = `${size}px`;
		part.style.height = `${size}px`;
		part.style.borderRadius = '50%';
		part.style.backgroundColor = confettiColors[i % confettiColors.length];
		part.style.left = `${cx - size / 2}px`;
		part.style.top = `${cy - size / 2}px`;
		overlay.appendChild(part);

		const tx = Math.cos(angle) * distance;
		const ty = Math.sin(angle) * distance;

		part.animate([
			{ opacity: 0, transform: 'scale(0) translate(0, 0)' },
			{ opacity: particleOpacity, transform: `scale(1) translate(${tx * 0.5}px, ${ty * 0.5}px)`, offset: 0.3 },
			{ opacity: particleOpacity, transform: `scale(1) translate(${tx}px, ${ty}px)`, offset: 0.7 },
			{ opacity: 0, transform: `scale(0) translate(${tx}px, ${ty}px)` },
		], {
			duration: 1100,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards',
		});
	}

	// Expanding ring
	const ring = dom.$('.animation-particle');
	ring.style.position = 'absolute';
	ring.style.left = '0';
	ring.style.top = '0';
	ring.style.width = `${rect.width}px`;
	ring.style.height = `${rect.height}px`;
	ring.style.borderRadius = '50%';
	ring.style.border = '2px solid var(--vscode-focusBorder, #007acc)';
	ring.style.boxSizing = 'border-box';
	overlay.appendChild(ring);

	ring.animate([
		{ transform: 'scale(1)', opacity: 1 },
		{ transform: 'scale(2)', opacity: 0 },
	], {
		duration: 800,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		fill: 'forwards',
	});

	cleanupOverlay(2000);
}

/**
 * Floating Icons: small icons float upward from the element.
 */
export function triggerFloatingIconsAnimation(element: HTMLElement, icon: ThemeIcon) {
	const result = createOverlay(element);
	if (!result) {
		return;
	}

	const { overlay, cx, cy } = result;
	const rect = element.getBoundingClientRect();

	// Element bounce upward
	bounceElement(element, {
		translateY: [0, -6, 0],
		duration: 350,
	});

	// Floating icons
	const iconCount = 6;
	for (let i = 0; i < iconCount; i++) {
		const size = 12 + (i % 3) * 2;
		const iconEl = dom.$('.animation-particle');
		iconEl.style.position = 'absolute';
		iconEl.style.left = `${cx}px`;
		iconEl.style.top = `${cy}px`;
		iconEl.style.fontSize = `${size}px`;
		iconEl.style.lineHeight = '1';
		iconEl.style.color = 'var(--vscode-focusBorder, #007acc)';
		iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
		overlay.appendChild(iconEl);

		const driftX = (Math.random() - 0.5) * 50;
		const floatY = -50 - (i % 3) * 10;
		const rotate1 = (Math.random() - 0.5) * 20;
		const rotate2 = (Math.random() - 0.5) * 40;

		iconEl.animate([
			{ opacity: 0, transform: `translate(-50%, -50%) scale(0) rotate(${rotate1}deg)` },
			{ opacity: 1, transform: `translate(calc(-50% + ${driftX * 0.3}px), calc(-50% + ${floatY * 0.3}px)) scale(1) rotate(${(rotate1 + rotate2) * 0.3}deg)`, offset: 0.3 },
			{ opacity: 1, transform: `translate(calc(-50% + ${driftX * 0.7}px), calc(-50% + ${floatY * 0.7}px)) scale(1) rotate(${(rotate1 + rotate2) * 0.7}deg)`, offset: 0.7 },
			{ opacity: 0, transform: `translate(calc(-50% + ${driftX}px), calc(-50% + ${floatY}px)) scale(0.8) rotate(${rotate2}deg)` },
		], {
			duration: 800 + (i % 3) * 200,
			delay: i * 80,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards',
		});
	}

	// Expanding ring
	const ring = dom.$('.animation-particle');
	ring.style.position = 'absolute';
	ring.style.left = '0';
	ring.style.top = '0';
	ring.style.width = `${rect.width}px`;
	ring.style.height = `${rect.height}px`;
	ring.style.borderRadius = '50%';
	ring.style.border = '2px solid var(--vscode-focusBorder, #007acc)';
	ring.style.boxSizing = 'border-box';
	overlay.appendChild(ring);

	ring.animate([
		{ transform: 'scale(1)', opacity: 1 },
		{ transform: 'scale(2)', opacity: 0 },
	], {
		duration: 500,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		fill: 'forwards',
	});

	cleanupOverlay(2000);
}

/**
 * Pulse Wave: expanding rings and sparkle dots radiate from the element center.
 */
export function triggerPulseWaveAnimation(element: HTMLElement) {
	const result = createOverlay(element);
	if (!result) {
		return;
	}

	const { overlay, cx, cy } = result;
	const rect = element.getBoundingClientRect();

	// Element bounce with slight rotation
	bounceElement(element, {
		scale: [1, 1.1, 1],
		rotate: [0, -12, 0],
		duration: 400,
	});

	// Expanding rings
	for (let i = 0; i < 2; i++) {
		const ring = dom.$('.animation-particle');
		ring.style.position = 'absolute';
		ring.style.left = '0';
		ring.style.top = '0';
		ring.style.width = `${rect.width}px`;
		ring.style.height = `${rect.height}px`;
		ring.style.borderRadius = '50%';
		ring.style.border = '2px solid var(--vscode-focusBorder, #007acc)';
		ring.style.boxSizing = 'border-box';
		overlay.appendChild(ring);

		ring.animate([
			{ transform: 'scale(0.8)', opacity: 0 },
			{ transform: 'scale(0.8)', opacity: 0.6, offset: 0.01 },
			{ transform: 'scale(2.5)', opacity: 0 },
		], {
			duration: 800,
			delay: i * 150,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards',
		});
	}

	// Sparkle dots
	for (let i = 0; i < 6; i++) {
		const angle = (i * 60 * Math.PI) / 180;
		const distance = 30 + (i % 2) * 10;
		const size = 3.5;

		const dot = dom.$('.animation-particle');
		dot.style.position = 'absolute';
		dot.style.width = `${size}px`;
		dot.style.height = `${size}px`;
		dot.style.borderRadius = '50%';
		dot.style.backgroundColor = '#0098ff';
		dot.style.left = `${cx - size / 2}px`;
		dot.style.top = `${cy - size / 2}px`;
		overlay.appendChild(dot);

		const tx = Math.cos(angle) * distance;
		const ty = Math.sin(angle) * distance;

		dot.animate([
			{ opacity: 0, transform: 'scale(0) translate(0, 0)' },
			{ opacity: 1, transform: `scale(1) translate(${tx}px, ${ty}px)`, offset: 0.5 },
			{ opacity: 0, transform: `scale(0) translate(${tx}px, ${ty}px)` },
		], {
			duration: 600,
			delay: 100 + i * 50,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards',
		});
	}

	// Background glow
	const glow = dom.$('.animation-particle');
	glow.style.position = 'absolute';
	glow.style.left = '0';
	glow.style.top = '0';
	glow.style.width = `${rect.width}px`;
	glow.style.height = `${rect.height}px`;
	glow.style.borderRadius = '50%';
	glow.style.backgroundColor = 'var(--vscode-focusBorder, #007acc)';
	overlay.appendChild(glow);

	glow.animate([
		{ transform: 'scale(0.9)', opacity: 0 },
		{ transform: 'scale(0.9)', opacity: 0.5, offset: 0.01 },
		{ transform: 'scale(1.5)', opacity: 0 },
	], {
		duration: 500,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		fill: 'forwards',
	});

	cleanupOverlay(2000);
}

/**
 * Radiant Lines: lines and dots emanate outward from the element center.
 */
export function triggerRadiantLinesAnimation(element: HTMLElement) {
	const result = createOverlay(element);
	if (!result) {
		return;
	}

	const { overlay, cx, cy } = result;

	// Element scale bounce
	bounceElement(element, {
		scale: [1, 1.15, 1],
		duration: 350,
	});

	// Dots at offset angles
	for (let i = 0; i < 8; i++) {
		const size = 3;
		const dotOpacity = 0.7;
		const angle = ((i * 45 + 22.5) * Math.PI) / 180;
		const startDistance = 14;
		const endDistance = 30;

		const dot = dom.$('.animation-particle');
		dot.style.position = 'absolute';
		dot.style.width = `${size}px`;
		dot.style.height = `${size}px`;
		dot.style.borderRadius = '50%';
		dot.style.backgroundColor = 'var(--vscode-editor-foreground, #ffffff)';
		dot.style.left = `${cx - size / 2}px`;
		dot.style.top = `${cy - size / 2}px`;
		overlay.appendChild(dot);

		const startX = Math.cos(angle) * startDistance;
		const startY = Math.sin(angle) * startDistance;
		const endX = Math.cos(angle) * endDistance;
		const endY = Math.sin(angle) * endDistance;

		dot.animate([
			{ opacity: 0, transform: `scale(0) translate(${startX}px, ${startY}px)` },
			{ opacity: dotOpacity, transform: `scale(1.2) translate(${(startX + endX) / 2}px, ${(startY + endY) / 2}px)`, offset: 0.25 },
			{ opacity: dotOpacity, transform: `scale(1) translate(${endX * 0.8}px, ${endY * 0.8}px)`, offset: 0.5 },
			{ opacity: dotOpacity * 0.5, transform: `scale(1) translate(${endX}px, ${endY}px)`, offset: 0.75 },
			{ opacity: 0, transform: `scale(0.5) translate(${endX}px, ${endY}px)` },
		], {
			duration: 1100,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards',
		});
	}

	// Radiant lines
	for (let i = 0; i < 8; i++) {
		const angleDeg = i * 45;

		const lineWrapper = dom.$('.animation-particle');
		lineWrapper.style.position = 'absolute';
		lineWrapper.style.left = `${cx}px`;
		lineWrapper.style.top = `${cy}px`;
		lineWrapper.style.width = '0';
		lineWrapper.style.height = '0';
		lineWrapper.style.transform = `rotate(${angleDeg}deg)`;
		overlay.appendChild(lineWrapper);

		const line = dom.$('.animation-particle');
		line.style.position = 'absolute';
		line.style.width = '2px';
		line.style.height = '10px';
		line.style.backgroundColor = 'var(--vscode-focusBorder, #007acc)';
		line.style.left = '-1px';
		line.style.top = '-22px';
		line.style.transformOrigin = 'bottom center';
		lineWrapper.appendChild(line);

		line.animate([
			{ transform: 'scale(1, 0)', opacity: 0.6 },
			{ transform: 'scale(1, 1)', opacity: 0.6, offset: 0.2 },
			{ transform: 'scale(1, 1)', opacity: 0.6, offset: 0.6 },
			{ transform: 'scale(1, 1)', opacity: 0.6, offset: 0.8 },
			{ transform: 'scale(0, 0.3)', opacity: 0 },
		], {
			duration: 1200,
			delay: 150,
			easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
			fill: 'forwards',
		});
	}

	cleanupOverlay(2000);
}

/**
 * Triggers the specified click animation on the element.
 * @param element The target element to animate.
 * @param animation The type of click animation to trigger.
 * @param icon Optional icon for animations that require it (e.g., FloatingIcons).
 */
export function triggerClickAnimation(element: HTMLElement, animation: ClickAnimation, icon?: ThemeIcon) {
	switch (animation) {
		case ClickAnimation.Confetti:
			triggerConfettiAnimation(element);
			break;
		case ClickAnimation.FloatingIcons:
			if (icon) {
				triggerFloatingIconsAnimation(element, icon);
			}
			break;
		case ClickAnimation.PulseWave:
			triggerPulseWaveAnimation(element);
			break;
		case ClickAnimation.RadiantLines:
			triggerRadiantLinesAnimation(element);
			break;
	}
}
