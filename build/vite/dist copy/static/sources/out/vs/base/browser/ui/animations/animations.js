/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ThemeIcon } from '../../../common/themables.js';
import * as dom from '../../dom.js';
export var ClickAnimation;
(function (ClickAnimation) {
    ClickAnimation[ClickAnimation["Confetti"] = 1] = "Confetti";
    ClickAnimation[ClickAnimation["FloatingIcons"] = 2] = "FloatingIcons";
    ClickAnimation[ClickAnimation["PulseWave"] = 3] = "PulseWave";
    ClickAnimation[ClickAnimation["RadiantLines"] = 4] = "RadiantLines";
})(ClickAnimation || (ClickAnimation = {}));
const confettiColors = [
    '#007acc',
    '#005a9e',
    '#0098ff',
    '#4fc3f7',
    '#64b5f6',
    '#42a5f5',
];
let activeOverlay;
/**
 * Creates a fixed-positioned overlay centered on the given element.
 */
function createOverlay(element) {
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
function cleanupOverlay(duration) {
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
export function bounceElement(element, opts) {
    const frames = [];
    const steps = Math.max(opts.scale?.length ?? 0, opts.rotate?.length ?? 0, opts.translateY?.length ?? 0);
    if (steps === 0) {
        return;
    }
    for (let i = 0; i < steps; i++) {
        const frame = { offset: steps === 1 ? 1 : i / (steps - 1) };
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
export function triggerConfettiAnimation(element) {
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
export function triggerFloatingIconsAnimation(element, icon) {
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
export function triggerPulseWaveAnimation(element) {
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
export function triggerRadiantLinesAnimation(element) {
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
export function triggerClickAnimation(element, animation, icon) {
    switch (animation) {
        case 1 /* ClickAnimation.Confetti */:
            triggerConfettiAnimation(element);
            break;
        case 2 /* ClickAnimation.FloatingIcons */:
            if (icon) {
                triggerFloatingIconsAnimation(element, icon);
            }
            break;
        case 3 /* ClickAnimation.PulseWave */:
            triggerPulseWaveAnimation(element);
            break;
        case 4 /* ClickAnimation.RadiantLines */:
            triggerRadiantLinesAnimation(element);
            break;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5pbWF0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9hbmltYXRpb25zL2FuaW1hdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3pELE9BQU8sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDO0FBRXBDLE1BQU0sQ0FBTixJQUFrQixjQUtqQjtBQUxELFdBQWtCLGNBQWM7SUFDL0IsMkRBQVksQ0FBQTtJQUNaLHFFQUFpQixDQUFBO0lBQ2pCLDZEQUFhLENBQUE7SUFDYixtRUFBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBTGlCLGNBQWMsS0FBZCxjQUFjLFFBSy9CO0FBRUQsTUFBTSxjQUFjLEdBQUc7SUFDdEIsU0FBUztJQUNULFNBQVM7SUFDVCxTQUFTO0lBQ1QsU0FBUztJQUNULFNBQVM7SUFDVCxTQUFTO0NBQ1QsQ0FBQztBQUVGLElBQUksYUFBc0MsQ0FBQztBQUUzQzs7R0FFRztBQUNILFNBQVMsYUFBYSxDQUFDLE9BQW9CO0lBQzFDLElBQUksYUFBYSxFQUFFLENBQUM7UUFDbkIsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQzdDLE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDO0lBRXRELE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUM1QyxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7SUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxJQUFJ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