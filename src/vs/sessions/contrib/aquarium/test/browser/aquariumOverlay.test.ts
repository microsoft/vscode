/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/aquarium.css';
import '../../../../../workbench/browser/parts/sessions/media/sessionsPart.css';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionsGridContent.css';
import assert from 'assert';
import { EventType, getWindow } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { AquariumService, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from '../../browser/aquariumOverlay.js';
import { disposeSharedFishDefs, Fish, FishSpecies } from '../../browser/fish.js';
import { registerTestIframe } from '../../../../../base/test/browser/testWindow.js';

class TestHostService extends mock<IHostService>() {
	private readonly _onDidChangeFocus = new Emitter<boolean>();
	override readonly onDidChangeFocus = this._onDidChangeFocus.event;
	override readonly onDidChangeActiveWindow = Event.None;
	override hasFocus = true;

	setFocus(focus: boolean): void {
		this.hasFocus = focus;
		this._onDidChangeFocus.fire(focus);
	}
}

class TestMotionAccessibilityService extends TestAccessibilityService {
	private readonly _onDidChangeReducedMotion = new Emitter<void>();
	override onDidChangeReducedMotion = this._onDidChangeReducedMotion.event;
	private motionReduced = false;

	override isMotionReduced(): boolean {
		return this.motionReduced;
	}

	setMotionReduced(reduced: boolean): void {
		this.motionReduced = reduced;
		this._onDidChangeReducedMotion.fire();
	}
}

suite('AquariumService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** Mounts an off-state toggle in a focused window where motion is not reduced. */
	function mountWiggleToggle() {
		const mainContainer = document.createElement('div');
		const toggleContainer = document.createElement('div');
		document.body.append(mainContainer, toggleContainer);
		store.add(toDisposable(() => {
			mainContainer.remove();
			toggleContainer.remove();
		}));

		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
		}();
		const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const accessibilityService = new TestMotionAccessibilityService();
		const hostService = new TestHostService();
		const service = store.add(new AquariumService(
			layoutService,
			new MockContextKeyService(),
			{ ...NullHoverService },
			store.add(new InMemoryStorageService()),
			configurationService,
			accessibilityService,
			new NullTelemetryServiceShape(),
			hostService,
		));
		store.add(service.mountToggle(toggleContainer));
		const button = toggleContainer.querySelector<HTMLButtonElement>('.agents-aquarium-toggle')!;
		return {
			button,
			accessibilityService,
			hostService,
			isWiggling: () => button.classList.contains('wiggle'),
			waitForNextWiggle: () => timeout(12_000),
			/** Reports an animation event on the toggle's icon, like the browser does for the wiggle. */
			fireAnimationEvent: (type: string) => button.firstElementChild?.dispatchEvent(new AnimationEvent(type, { bubbles: true })),
		};
	}

	test('persists and applies aquarium action visibility to mounted buttons', () => {
		const mainContainer = document.createElement('div');
		const toggleContainer = document.createElement('div');
		document.body.append(mainContainer, toggleContainer);
		store.add(toDisposable(() => {
			mainContainer.remove();
			toggleContainer.remove();
		}));

		const storageService = store.add(new InMemoryStorageService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
		}();
		const hoverService = { ...NullHoverService };
		const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new AquariumService(
			layoutService,
			new MockContextKeyService(),
			hoverService,
			storageService,
			configurationService,
			new TestAccessibilityService(),
			new NullTelemetryServiceShape(),
			new TestHostService(),
		));
		store.add(service.mountToggle(toggleContainer));
		const button = toggleContainer.querySelector<HTMLButtonElement>('.agents-aquarium-toggle');

		const initial = {
			visible: service.actionVisible.get(),
			display: button?.style.display,
			classes: button?.className,
		};
		const hidden = service.toggleActionVisibility();
		const afterHide = {
			visible: service.actionVisible.get(),
			display: button?.style.display,
			stored: storageService.getBoolean('sessions.aquarium.action.visible', StorageScope.APPLICATION),
		};
		const shown = service.toggleActionVisibility();
		const afterShow = {
			visible: service.actionVisible.get(),
			display: button?.style.display,
		};

		assert.deepStrictEqual({
			initial,
			hidden,
			afterHide,
			shown,
			afterShow,
		}, {
			initial: { visible: true, display: '', classes: 'agents-aquarium-toggle agent-sessions-interactive' },
			hidden: false,
			afterHide: { visible: false, display: 'none', stored: false },
			shown: true,
			afterShow: { visible: true, display: '' },
		});
	});

	test('layers the aquarium below sessions content', () => {
		const mainContainer = document.createElement('div');
		mainContainer.className = 'monaco-workbench';
		const sessionsContainer = document.createElement('div');
		sessionsContainer.className = 'part sessionspart';
		const content = document.createElement('div');
		content.className = 'content';
		const toggleContainer = document.createElement('div');
		sessionsContainer.append(content);
		mainContainer.append(sessionsContainer, toggleContainer);
		document.body.appendChild(mainContainer);
		store.add(toDisposable(() => mainContainer.remove()));

		const storageService = store.add(new InMemoryStorageService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
			override getContainer(_targetWindow: Window, part?: Parts): HTMLElement {
				return part === Parts.SESSIONS_PART ? sessionsContainer : mainContainer;
			}
			override isVisible(): boolean {
				return true;
			}
		}();
		const hoverService = { ...NullHoverService };
		const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new AquariumService(
			layoutService,
			new MockContextKeyService(),
			hoverService,
			storageService,
			configurationService,
			new TestAccessibilityService(),
			new NullTelemetryServiceShape(),
			new TestHostService(),
		));
		store.add(service.mountToggle(toggleContainer));
		toggleContainer.querySelector<HTMLButtonElement>('.agents-aquarium-toggle')?.click();

		const water = sessionsContainer.querySelector<HTMLElement>(':scope > .agents-aquarium-water');
		const targetWindow = getWindow(sessionsContainer);
		assert.deepStrictEqual({
			active: sessionsContainer.classList.contains('aquarium-active'),
			waterZIndex: water ? targetWindow.getComputedStyle(water).zIndex : undefined,
			contentZIndex: targetWindow.getComputedStyle(content).zIndex,
		}, {
			active: true,
			waterZIndex: '1',
			contentZIndex: '2',
		});
	});

	test('creates aquarium elements in the main realm for an auxiliary window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		store.add(registerTestIframe(iframe));

		const auxiliaryDocument = iframe.contentDocument!;
		const toggleContainer = document.createElement('div');
		auxiliaryDocument.body.appendChild(toggleContainer);
		const createElement = auxiliaryDocument.createElement;
		auxiliaryDocument.createElement = () => {
			throw new Error('Not allowed to create elements in child window JavaScript context.');
		};
		store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));

		const storageService = store.add(new InMemoryStorageService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = document.createElement('div');
		}();
		const hoverService = { ...NullHoverService };
		const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new AquariumService(
			layoutService,
			new MockContextKeyService(),
			hoverService,
			storageService,
			configurationService,
			new TestAccessibilityService(),
			new NullTelemetryServiceShape(),
			new TestHostService(),
		));
		store.add(service.mountToggle(toggleContainer));
		const fish = new Fish({
			species: FishSpecies.Stable,
			size: 24,
			positionX: 0,
			positionY: 0,
			velocityX: 1,
			velocityY: 0,
		}, auxiliaryDocument);
		auxiliaryDocument.body.appendChild(fish.element);
		store.add(toDisposable(() => {
			fish.element.remove();
			disposeSharedFishDefs(auxiliaryDocument);
		}));

		const button = toggleContainer.querySelector('.agents-aquarium-toggle');
		const svg = fish.element.querySelector('svg');
		assert.deepStrictEqual({
			buttonOwnerDocument: button?.ownerDocument === auxiliaryDocument,
			fishOwnerDocument: fish.element.ownerDocument === auxiliaryDocument,
			mainRealmButton: button instanceof HTMLButtonElement,
			mainRealmFish: fish.element instanceof HTMLDivElement,
			mainRealmSvg: svg instanceof SVGSVGElement,
		}, {
			buttonOwnerDocument: true,
			fishOwnerDocument: true,
			mainRealmButton: true,
			mainRealmFish: true,
			mainRealmSvg: true,
		});
	});

	test('wiggles the off-state toggle a few times, only while its window is focused and motion is not reduced', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { accessibilityService, hostService, isWiggling, waitForNextWiggle, fireAnimationEvent } = mountWiggleToggle();
		const finishWiggle = () => fireAnimationEvent(EventType.ANIMATION_END);

		await waitForNextWiggle();
		const first = isWiggling();
		finishWiggle();
		const afterFirst = isWiggling();

		hostService.setFocus(false);
		await waitForNextWiggle();
		const whileUnfocused = isWiggling();
		hostService.setFocus(true);

		accessibilityService.setMotionReduced(true);
		await waitForNextWiggle();
		const whileMotionReduced = isWiggling();
		accessibilityService.setMotionReduced(false);

		await waitForNextWiggle();
		const second = isWiggling();
		hostService.setFocus(false);
		const secondAfterLosingFocus = isWiggling();
		hostService.setFocus(true);

		await waitForNextWiggle();
		const third = isWiggling();
		finishWiggle();
		await waitForNextWiggle();
		const fourth = isWiggling();

		assert.deepStrictEqual({
			first,
			afterFirst,
			whileUnfocused,
			whileMotionReduced,
			second,
			secondAfterLosingFocus,
			third,
			fourth,
		}, {
			first: true,
			afterFirst: false,
			whileUnfocused: false,
			whileMotionReduced: false,
			second: true,
			secondAfterLosingFocus: false,
			third: true,
			fourth: false,
		});
	}));

	test('ends a wiggle whose animation is held back or cancelled, without replaying it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { button, isWiggling, waitForNextWiggle, fireAnimationEvent } = mountWiggleToggle();

		// Hover or keyboard focus holds the animation back for the whole run: no animation event arrives.
		await waitForNextWiggle();
		const heldBack = isWiggling();
		await timeout(1_000);
		const heldBackAfterItsRun = isWiggling();

		// The next one is held back too, and the pointer leaves the toggle during the run.
		await timeout(11_000);
		const heldBackAgain = isWiggling();
		button.dispatchEvent(new MouseEvent(EventType.MOUSE_LEAVE));
		const afterPointerLeft = isWiggling();

		// Hover or keyboard focus cancels the last one while it plays.
		await waitForNextWiggle();
		const playing = isWiggling();
		fireAnimationEvent('animationcancel');
		const afterCancel = isWiggling();

		await waitForNextWiggle();
		const fourth = isWiggling();

		assert.deepStrictEqual({
			heldBack,
			heldBackAfterItsRun,
			heldBackAgain,
			afterPointerLeft,
			playing,
			afterCancel,
			fourth,
		}, {
			heldBack: true,
			heldBackAfterItsRun: false,
			heldBackAgain: true,
			afterPointerLeft: false,
			playing: true,
			afterCancel: false,
			fourth: false,
		});
	}));

	test('stops the aquarium animations when the workbench reduces motion', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench';
		const toggle = document.createElement('button');
		toggle.className = 'agents-aquarium-toggle wiggle';
		const icon = document.createElement('span');
		icon.className = 'codicon';
		toggle.appendChild(icon);
		const water = document.createElement('div');
		water.className = 'agents-aquarium-water';
		const fishStrip = document.createElement('div');
		fishStrip.className = 'agents-aquarium-fish-strip';
		workbench.append(toggle, water, fishStrip);
		document.body.appendChild(workbench);
		store.add(toDisposable(() => workbench.remove()));

		const targetWindow = getWindow(workbench);
		const animations = () => ({
			toggle: targetWindow.getComputedStyle(icon).animationName,
			fishStrip: targetWindow.getComputedStyle(fishStrip).animationName,
			water: [targetWindow.getComputedStyle(water, '::before').animationName, targetWindow.getComputedStyle(water, '::after').animationName],
		});
		const still = { toggle: 'none', fishStrip: 'none', water: ['none', 'none'] };
		const moving = { toggle: 'agents-aquarium-toggle-wiggle', fishStrip: 'agents-aquarium-body-wave', water: ['agents-aquarium-float-a', 'agents-aquarium-float-b'] };

		const motionEnabled = animations();
		workbench.classList.add('monaco-reduce-motion');
		const motionReduced = animations();

		assert.deepStrictEqual({ motionEnabled, motionReduced }, {
			// The stylesheet also follows the OS preference, which a test cannot set.
			motionEnabled: targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches ? still : moving,
			motionReduced: still,
		});
	});
});
