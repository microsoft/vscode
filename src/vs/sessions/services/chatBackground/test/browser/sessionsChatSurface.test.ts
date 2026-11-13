/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ISessionsChatBackground, ISessionsChatBackgroundService } from '../../../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { SESSIONS_CHAT_SURFACE_CLASS, SessionsChatSurface } from '../../../../../workbench/contrib/sessions/browser/sessionsChatSurface.js';

interface ICodiconActivationTestHarness {
	readonly accessibilityService: {
		isMotionReduced(): boolean;
		status(message: string): void;
	};
	readonly telemetryService: {
		publicLog2(eventName: string, data: object): void;
	};
}

suite('Sessions Chat Surface', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSurface(initial: ISessionsChatBackground | undefined) {
		const onDidChangeBackground = store.add(new Emitter<void>());
		let background = initial;
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
			override readonly onDidChangeBackground = onDidChangeBackground.event;
			override getBackground() { return background; }
		}());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const element = $('.host');
		const surface = instantiationService.createInstance(SessionsChatSurface, element);
		const read = () => ({
			surface: element.classList.contains(SESSIONS_CHAT_SURFACE_CLASS),
			hasBackground: element.classList.contains('has-chat-background'),
			layer: element.querySelector<HTMLElement>(':scope > .sessions-chat-background')?.hidden === false,
			celebrates: !!element.querySelector(':scope > .sessions-chat-codicon-hit-target'),
		});
		const setBackground = (value: ISessionsChatBackground | undefined) => {
			background = value;
			onDidChangeBackground.fire();
		};
		return { surface, element, read, setBackground };
	}

	test('paints the chat background behind its element and follows the background service', () => {
		const { surface, read, setBackground } = createSurface(undefined);
		const none = read();
		setBackground({ kind: 'codicons' });
		const codicons = read();
		setBackground(undefined);
		const cleared = read();
		surface.dispose();

		assert.deepStrictEqual({ none, codicons, cleared, disposed: read() }, {
			none: { surface: true, hasBackground: false, layer: false, celebrates: true },
			codicons: { surface: true, hasBackground: true, layer: true, celebrates: true },
			cleared: { surface: true, hasBackground: false, layer: false, celebrates: true },
			disposed: { surface: false, hasBackground: false, layer: false, celebrates: false },
		});
	});

	test('the confetti button of a surface outside the Sessions part, such as the chat of a chat window, has its hit area', () => {
		const { surface, element } = createSurface({ kind: 'codicons' });
		// Mounted in the workbench without the classes of the Sessions part.
		const workbench = mainWindow.document.body.appendChild($('.monaco-workbench'));
		store.add(toDisposable(() => workbench.remove()));
		workbench.appendChild(element);
		const hitTarget = element.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target')!;
		const style = mainWindow.getComputedStyle(hitTarget);
		const hitArea = { inSessionsPart: !!element.closest('.part.sessionspart'), zIndex: style.zIndex, pointerEvents: style.pointerEvents, translated: style.transform !== 'none' };
		surface.dispose();

		assert.deepStrictEqual(hitArea, { inSessionsPart: false, zIndex: '3', pointerEvents: 'auto', translated: true });
	});

	test('announces and logs Codicon confetti activation', () => {
		const statuses: string[] = [];
		const telemetryEvents: { name: string; data: object }[] = [];
		const host: ICodiconActivationTestHarness = {
			accessibilityService: {
				isMotionReduced: () => true,
				status: message => statuses.push(message),
			},
			telemetryService: {
				publicLog2: (name, data) => telemetryEvents.push({ name, data }),
			},
		};
		const activateCodicon = Reflect.get(SessionsChatSurface.prototype, 'activateCodicon') as (this: ICodiconActivationTestHarness, element: HTMLElement) => void;

		activateCodicon.call(host, document.createElement('span'));

		assert.deepStrictEqual({ statuses, telemetryEvents }, {
			statuses: ['Confetti!'],
			telemetryEvents: [{ name: 'vscodeAgents.codiconBackground/confetti', data: {} }],
		});
	});
});
