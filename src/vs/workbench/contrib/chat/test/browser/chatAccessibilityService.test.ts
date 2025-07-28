/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatAccessibilityService } from '../../browser/chatAccessibilityService.js';
import { IChatElicitationRequest } from '../../common/chatService.js';

// Mock accessibility signal service
class MockAccessibilitySignalService implements IAccessibilitySignalService {
	declare readonly _serviceBrand: undefined;
	
	public playSignalCalls: { signal: AccessibilitySignal; options?: any }[] = [];

	async playSignal(signal: AccessibilitySignal, options?: any): Promise<void> {
		this.playSignalCalls.push({ signal, options });
	}

	// Other required methods (empty implementations for testing)
	async playSignals(signals: any[]): Promise<void> { }
	async playSound(sound: any, allowManyInParallel?: boolean): Promise<void> { }
	playSignalLoop(signal: AccessibilitySignal, milliseconds: number): any { return { dispose: () => { } }; }
	isSoundEnabled(signal: AccessibilitySignal, userGesture?: boolean): boolean { return true; }
	onSoundEnabledChanged(signal: AccessibilitySignal): Event<void> { return Event.None; }
	isAnnouncementEnabled(signal: AccessibilitySignal, userGesture?: boolean): boolean { return true; }
	onAnnouncementEnabledChanged(signal: AccessibilitySignal): Event<void> { return Event.None; }
	getEnabledState(signal: AccessibilitySignal, userGesture: boolean, modality?: any): any { return { get: () => true, onDidChange: Event.None }; }
}

// Mock accessibility service
class MockAccessibilityService implements IAccessibilityService {
	declare readonly _serviceBrand: undefined;
	
	private _isScreenReaderOptimized = false;

	setScreenReaderOptimized(value: boolean): void {
		this._isScreenReaderOptimized = value;
	}

	isScreenReaderOptimized(): boolean {
		return this._isScreenReaderOptimized;
	}

	// Other required methods (empty implementations for testing)
	onDidChangeScreenReaderOptimized = Event.None;
	onDidChangeReducedMotion = Event.None;
	getAccessibilitySupport(): any { return 0; }
	setAccessibilitySupport(accessibilitySupport: any): void { }
	isMotionReduced(): boolean { return false; }
	alwaysUnderlineAccessKeys(): Promise<boolean> { return Promise.resolve(false); }
	alert(message: string): void { }
	status(message: string): void { }
}

// Mock elicitation request
class MockElicitationRequest implements IChatElicitationRequest {
	kind: 'elicitation' = 'elicitation';
	title: string | IMarkdownString;
	message: string | IMarkdownString;
	acceptButtonLabel: string = 'Accept';
	rejectButtonLabel: string = 'Reject';
	originMessage?: string | IMarkdownString;
	state: 'pending' | 'accepted' | 'rejected' = 'pending';
	acceptedResult?: Record<string, unknown>;
	onDidRequestHide = Event.None;

	constructor(title: string, message: string) {
		this.title = title;
		this.message = message;
	}

	async accept(): Promise<void> { }
	async reject(): Promise<void> { }
}

suite('ChatAccessibilityService', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let chatAccessibilityService: ChatAccessibilityService;
	let mockAccessibilitySignalService: MockAccessibilitySignalService;
	let mockAccessibilityService: MockAccessibilityService;
	let configurationService: TestConfigurationService;
	let instantiationService: IInstantiationService;

	setup(() => {
		mockAccessibilitySignalService = new MockAccessibilitySignalService();
		mockAccessibilityService = new MockAccessibilityService();
		configurationService = new TestConfigurationService();
		instantiationService = new TestInstantiationService();

		chatAccessibilityService = store.add(new ChatAccessibilityService(
			mockAccessibilitySignalService,
			instantiationService,
			configurationService,
			mockAccessibilityService
		));
	});

	test('acceptElicitation should play signal when sound is "on"', async () => {
		// Set the configuration to enable sound
		configurationService.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'on', announcement: 'auto' });

		const elicitation = new MockElicitationRequest('Test Title', 'Test Message');

		// Call acceptElicitation
		chatAccessibilityService.acceptElicitation(elicitation);

		// Verify the signal was played
		assert.strictEqual(mockAccessibilitySignalService.playSignalCalls.length, 1);
		assert.strictEqual(mockAccessibilitySignalService.playSignalCalls[0].signal, AccessibilitySignal.chatUserActionRequired);
	});

	test('acceptElicitation should NOT play signal when sound is "off"', async () => {
		// Set the configuration to disable sound
		configurationService.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'off', announcement: 'auto' });

		const elicitation = new MockElicitationRequest('Test Title', 'Test Message');

		// Call acceptElicitation
		chatAccessibilityService.acceptElicitation(elicitation);

		// Verify the signal was NOT played
		assert.strictEqual(mockAccessibilitySignalService.playSignalCalls.length, 0);
	});

	test('acceptElicitation should play signal when sound is "auto" and screen reader is optimized', async () => {
		// Set the configuration to auto and enable screen reader
		configurationService.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });
		mockAccessibilityService.setScreenReaderOptimized(true);

		const elicitation = new MockElicitationRequest('Test Title', 'Test Message');

		// Call acceptElicitation
		chatAccessibilityService.acceptElicitation(elicitation);

		// Verify the signal was played
		assert.strictEqual(mockAccessibilitySignalService.playSignalCalls.length, 1);
		assert.strictEqual(mockAccessibilitySignalService.playSignalCalls[0].signal, AccessibilitySignal.chatUserActionRequired);
	});

	test('acceptElicitation should NOT play signal when sound is "auto" and screen reader is NOT optimized', async () => {
		// Set the configuration to auto and disable screen reader
		configurationService.setUserConfiguration('accessibility.signals.chatUserActionRequired', { sound: 'auto', announcement: 'auto' });
		mockAccessibilityService.setScreenReaderOptimized(false);

		const elicitation = new MockElicitationRequest('Test Title', 'Test Message');

		// Call acceptElicitation
		chatAccessibilityService.acceptElicitation(elicitation);

		// Verify the signal was NOT played
		assert.strictEqual(mockAccessibilitySignalService.playSignalCalls.length, 0);
	});
});