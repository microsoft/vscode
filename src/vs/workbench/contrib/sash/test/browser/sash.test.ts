/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow, registerWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SashGrippersController } from '../../browser/sash.js';
import { webviewMouseActivityEvent } from '../../../webview/common/webview.js';
import '../../browser/sash.contribution.js';
import '../../../../browser/media/style.css';
import '../../../modernUI/browser/media/sashHandles.css';

suite('Sash grippers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const setting = 'workbench.sash.autoHideGrippers';
	const delaySetting = 'workbench.sash.autoHideGrippersDelay';

	function createController(enabled = true, existingContainers: HTMLElement[] = []) {
		const container = append(document.body, $('.monaco-workbench.modern-ui'));
		store.add(toDisposable(() => container.remove()));
		const configurationService = new TestConfigurationService({
			[setting]: enabled,
			[delaySetting]: Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[delaySetting].default
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const addedContainer = store.add(new Emitter<{ container: HTMLElement; disposables: DisposableStore }>());
		const layoutService = new class extends TestLayoutService {
			override readonly mainContainer = container;
			override readonly containers = [container, ...existingContainers];
			override readonly onDidAddContainer = addedContainer.event;
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILayoutService, layoutService);
		const controller = store.add(instantiationService.createInstance(SashGrippersController));
		return { container, configurationService, addedContainer, controller };
	}

	async function setConfiguration(configurationService: TestConfigurationService, key: string, value: boolean | number): Promise<void> {
		await configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: section => section === key,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] }
		});
	}

	function moveMouse(container: HTMLElement, screenX = 1): void {
		container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX }));
	}

	function isHidden(container: HTMLElement): boolean {
		return container.classList.contains('sash-grippers-hidden');
	}

	test('auto-hide is enabled by default with a two-second delay', () => {
		const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		assert.deepStrictEqual({ enabled: properties[setting].default, delay: properties[delaySetting].default }, { enabled: true, delay: 2000 });
	});

	test('hides after two seconds and restarts the delay on mouse movement', () => runWithFakedTimers({}, async () => {
		const { container } = createController();
		const states = [isHidden(container)];
		await timeout(1999);
		states.push(isHidden(container));
		await timeout(1);
		states.push(isHidden(container));
		moveMouse(container);
		states.push(isHidden(container));
		await timeout(1000);
		moveMouse(container, 2);
		await timeout(1999);
		states.push(isHidden(container));
		await timeout(1);
		states.push(isHidden(container));
		assert.deepStrictEqual(states, [false, false, true, false, false, true]);
	}));

	test('ignores mouse events without a position change and captures stopped events', () => runWithFakedTimers({}, async () => {
		const { container } = createController();
		const child = append(container, $('div'));
		child.onmousemove = e => e.stopPropagation();
		moveMouse(child);
		await timeout(1999);
		moveMouse(child);
		await timeout(1);
		const hidden = isHidden(container);
		moveMouse(child, 2);
		assert.deepStrictEqual({ hidden, afterMovement: isHidden(container) }, { hidden: true, afterMovement: false });
	}));

	test('keeps grippers visible when auto-hide is disabled', () => runWithFakedTimers({}, async () => {
		const { container, configurationService } = createController(false);
		await setConfiguration(configurationService, delaySetting, 10);
		moveMouse(container);
		await timeout(10000);
		assert.strictEqual(isHidden(container), false);
	}));

	test('ignores malformed webview activity without resetting the idle timer', () => runWithFakedTimers({}, async () => {
		const { container } = createController();
		const targetWindow = getWindow(container);
		const malformedEvents = [
			new Event(webviewMouseActivityEvent),
			...[undefined, null, 'invalid', {}, { screenX: 1 }, { screenX: '1', screenY: 2 },
				{ screenX: 1, screenY: '2' }, { screenX: NaN, screenY: 2 }, { screenX: 1, screenY: Infinity }]
				.map(detail => new CustomEvent(webviewMouseActivityEvent, { detail })),
		];
		await timeout(1999);
		for (const event of malformedEvents) {
			targetWindow.dispatchEvent(event);
		}
		await timeout(1);
		const idle = isHidden(container);
		const invalidWhileIdle = malformedEvents.map(event => {
			targetWindow.dispatchEvent(event);
			return isHidden(container);
		});
		targetWindow.dispatchEvent(new CustomEvent(webviewMouseActivityEvent, { detail: { screenX: 1, screenY: 2 } }));
		assert.deepStrictEqual({ idle, invalidWhileIdle, afterValidMovement: isHidden(container) }, {
			idle: true,
			invalidWhileIdle: malformedEvents.map(() => true),
			afterValidMovement: false,
		});
	}));

	test('uses the configured delay and reschedules pending hides when it changes', () => runWithFakedTimers({}, async () => {
		const { container, configurationService } = createController();
		await timeout(1500);
		await setConfiguration(configurationService, delaySetting, 5000);
		await timeout(500);
		const states = [isHidden(container)];
		await timeout(4499);
		states.push(isHidden(container));
		await timeout(1);
		states.push(isHidden(container));
		await setConfiguration(configurationService, delaySetting, 500);
		states.push(isHidden(container));
		await timeout(499);
		states.push(isHidden(container));
		await timeout(1);
		states.push(isHidden(container));
		assert.deepStrictEqual(states, [false, false, true, false, false, true]);
	}));

	test('allows a zero delay without disabling auto-hide', () => runWithFakedTimers({}, async () => {
		const { container, configurationService } = createController();
		await setConfiguration(configurationService, delaySetting, 0);
		await timeout(0);
		const idle = isHidden(container);
		moveMouse(container);
		const moving = isHidden(container);
		await timeout(0);
		assert.deepStrictEqual({ idle, moving, idleAgain: isHidden(container) }, { idle: true, moving: false, idleAgain: true });
	}));

	test('applies setting changes immediately and cancels pending hides', () => runWithFakedTimers({}, async () => {
		const { container, configurationService } = createController();
		await timeout(2000);
		const states = [isHidden(container)];
		await setConfiguration(configurationService, setting, false);
		states.push(isHidden(container));
		moveMouse(container);
		await timeout(2000);
		states.push(isHidden(container));
		await setConfiguration(configurationService, setting, true);
		await timeout(1999);
		states.push(isHidden(container));
		await setConfiguration(configurationService, setting, false);
		await timeout(1);
		states.push(isHidden(container));
		await setConfiguration(configurationService, setting, true);
		await timeout(2000);
		states.push(isHidden(container));
		assert.deepStrictEqual(states, [true, false, false, false, false, true]);
	}));

	test('disposal clears idle state, timers and listeners', () => runWithFakedTimers({}, async () => {
		const { container, controller, configurationService } = createController();
		await timeout(2000);
		const beforeDisposal = isHidden(container);
		controller.dispose();
		const afterDisposal = isHidden(container);
		moveMouse(container);
		await setConfiguration(configurationService, setting, true);
		await timeout(2000);
		assert.deepStrictEqual({ beforeDisposal, afterDisposal, afterMovement: isHidden(container) }, {
			beforeDisposal: true, afterDisposal: false, afterMovement: false
		});
	}));

	test('disposal cancels a pending idle timeout', () => runWithFakedTimers({}, async () => {
		const { container, controller } = createController();
		await timeout(1999);
		controller.dispose();
		await timeout(2000);
		assert.strictEqual(isHidden(container), false);
	}));

	test('tracks auxiliary windows independently and releases closed containers', async () => {
		const { container, addedContainer } = createController();
		const frame = append(document.body, $<HTMLIFrameElement>('iframe'));
		store.add(toDisposable(() => frame.remove()));
		assert.ok(frame.contentDocument);
		const auxiliaryContainer = $('.monaco-workbench.modern-ui');
		frame.contentDocument.body.appendChild(auxiliaryContainer);
		const auxiliaryDisposables = store.add(new DisposableStore());
		addedContainer.fire({ container: auxiliaryContainer, disposables: auxiliaryDisposables });
		await timeout(2050);
		const idle = [isHidden(container), isHidden(auxiliaryContainer)];
		moveMouse(container);
		const mainMoving = [isHidden(container), isHidden(auxiliaryContainer)];
		const auxiliaryWindow = getWindow(auxiliaryContainer);
		auxiliaryWindow.dispatchEvent(new auxiliaryWindow.CustomEvent(webviewMouseActivityEvent, { detail: { screenX: 1, screenY: 2 } }));
		const auxiliaryMoving = [isHidden(container), isHidden(auxiliaryContainer)];
		auxiliaryDisposables.dispose();
		auxiliaryContainer.classList.add('sash-grippers-hidden');
		moveMouse(auxiliaryContainer, 2);
		assert.deepStrictEqual({ idle, mainMoving, auxiliaryMoving, closedListenerRemoved: isHidden(auxiliaryContainer) }, {
			idle: [true, true],
			mainMoving: [false, true],
			auxiliaryMoving: [false, false],
			closedListenerRemoved: true
		});
	}).timeout(10000);

	test('releases auxiliary windows that were already open at startup', async () => {
		const frame = append(document.body, $<HTMLIFrameElement>('iframe'));
		store.add(toDisposable(() => frame.remove()));
		assert.ok(frame.contentDocument);
		const container = $('.monaco-workbench.modern-ui');
		frame.contentDocument.body.appendChild(container);
		const targetWindow = getWindow(container);
		ensureCodeWindow(targetWindow, 1000);
		const registration = store.add(registerWindow(targetWindow));
		const { configurationService } = createController(true, [container]);
		registration.dispose();
		container.classList.add('sash-grippers-hidden');
		moveMouse(container);
		await setConfiguration(configurationService, setting, true);
		assert.strictEqual(isHidden(container), true);
	});

	test('idle styling hides only the dots and preserves hover and drag feedback', () => {
		const { container } = createController();
		container.style.setProperty('--vscode-sash-hoverBorder', '#123456');
		const sashes = [append(container, $('.monaco-sash.vertical')), append(container, $('.monaco-sash.horizontal'))];
		const targetWindow = getWindow(container);
		const snapshot = () => sashes.map(sash => ({
			opacity: targetWindow.getComputedStyle(sash, '::after').opacity,
			pointerEvents: targetWindow.getComputedStyle(sash).pointerEvents,
			highlight: targetWindow.getComputedStyle(sash, '::before').backgroundColor
		}));
		const visible = snapshot();
		container.classList.add('sash-grippers-hidden');
		const hidden = snapshot();
		sashes[0].classList.add('hover');
		sashes[1].classList.add('active');
		const interacting = snapshot();
		container.classList.remove('sash-grippers-hidden');
		const interactingWhileVisible = snapshot();
		const resting = { opacity: '1', pointerEvents: 'auto', highlight: 'rgba(0, 0, 0, 0)' };
		const idle = { ...resting, opacity: '0' };
		const active = { ...idle, highlight: 'rgb(18, 52, 86)' };
		assert.deepStrictEqual({ visible, hidden, interacting, interactingWhileVisible }, {
			visible: [resting, resting],
			hidden: [idle, idle],
			interacting: [active, active],
			interactingWhileVisible: [active, active]
		});
	});

	test('fades in both directions and respects reduced motion on the workbench root', () => {
		const { container } = createController(false);
		container.classList.add('monaco-enable-motion');
		const sash = append(container, $('.monaco-sash.vertical'));
		const targetWindow = getWindow(container);
		const opacity = () => Number(targetWindow.getComputedStyle(sash, '::after').opacity);
		assert.strictEqual(opacity(), 1);

		const fade = (hidden: boolean) => {
			container.classList.toggle('sash-grippers-hidden', hidden);
			const animations = sash.getAnimations({ subtree: true });
			assert.strictEqual(animations.length, 1);
			const animation = animations[0];
			const duration = targetWindow.getComputedStyle(sash, '::after').transitionDuration;
			animation.pause();
			animation.currentTime = hidden ? 150 : 75;
			const intermediateOpacity = opacity();
			animation.finish();
			return { duration, intermediate: intermediateOpacity > 0 && intermediateOpacity < 1, final: opacity() };
		};
		const fadeOut = fade(true);
		const fadeIn = fade(false);
		container.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
		container.classList.add('sash-grippers-hidden');
		const reducedMotionOut = opacity();
		container.classList.remove('sash-grippers-hidden');
		assert.deepStrictEqual({ fadeOut, fadeIn, reducedMotionOut, reducedMotionIn: opacity() }, {
			fadeOut: { duration: '0.3s', intermediate: true, final: 0 },
			fadeIn: { duration: '0.15s', intermediate: true, final: 1 },
			reducedMotionOut: 0,
			reducedMotionIn: 1
		});
	});
});
