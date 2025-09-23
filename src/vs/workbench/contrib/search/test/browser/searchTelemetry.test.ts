/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

/**
 * Mock telemetry service for testing AI search telemetry
 */
class MockTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	
	public events: { eventName: string; data: any }[] = [];
	
	publicLog(eventName: string, data?: any): void {
		this.events.push({ eventName, data });
	}
	
	publicLog2<E extends Record<string, any>, C extends Record<string, any>>(eventName: string, data: E): void {
		this.events.push({ eventName, data });
	}
	
	publicLogError(eventName: string, data?: any): void {
		this.events.push({ eventName, data });
	}
	
	publicLogError2<E extends Record<string, any>, C extends Record<string, any>>(eventName: string, data: E): void {
		this.events.push({ eventName, data });
	}
	
	setEnabled(): void { }
	setExperimentProperty(): void { }
	getTelemetryLevel(): any { return 1; }
	sendErrorTelemetry(): void { }
}

/**
 * Test implementation of SearchSessionTracker
 */
class TestSearchSessionTracker {
	private sessionStart: number = 0;
	private queryCount = 0;
	private aiSearchTriggered = false;
	private aiResultsUsed = false;
	private lastResultType: 'ai' | 'text' | 'none' = 'none';
	private lastSearchCompleteTime = 0;
	private lastSearchTriggerType: 'auto' | 'manual' | 'runOnEmpty' = 'auto';

	startSession(): void {
		this.sessionStart = Date.now();
		this.queryCount = 0;
		this.aiSearchTriggered = false;
		this.aiResultsUsed = false;
		this.lastResultType = 'none';
		this.lastSearchCompleteTime = 0;
	}

	trackQuery(hasAI: boolean, triggerType: 'auto' | 'manual' | 'runOnEmpty'): void {
		this.queryCount++;
		if (hasAI) {
			this.aiSearchTriggered = true;
		}
		this.lastSearchTriggerType = triggerType;
	}

	trackSearchComplete(): void {
		this.lastSearchCompleteTime = Date.now();
	}

	trackResultUsed(isAI: boolean): void {
		this.lastResultType = isAI ? 'ai' : 'text';
		if (isAI) {
			this.aiResultsUsed = true;
		}
	}

	getTimeToClick(): number {
		return this.lastSearchCompleteTime > 0 ? Date.now() - this.lastSearchCompleteTime : 0;
	}

	getSearchTriggerType(): 'auto' | 'manual' | 'runOnEmpty' {
		return this.lastSearchTriggerType;
	}

	endSession(telemetryService: ITelemetryService): void {
		const sessionDuration = Date.now() - this.sessionStart;
		const sessionSuccessful = this.lastResultType !== 'none';

		telemetryService.publicLog2('searchSessionComplete', {
			sessionDuration,
			queryCount: this.queryCount,
			aiSearchTriggered: this.aiSearchTriggered,
			aiResultsUsed: this.aiResultsUsed,
			sessionSuccessful,
			finalResultType: this.lastResultType
		});
	}

	// Getters for testing
	getQueryCount(): number { return this.queryCount; }
	getAiSearchTriggered(): boolean { return this.aiSearchTriggered; }
	getAiResultsUsed(): boolean { return this.aiResultsUsed; }
	getLastResultType(): 'ai' | 'text' | 'none' { return this.lastResultType; }
}

suite('Search - AI Telemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let mockTelemetryService: MockTelemetryService;
	let sessionTracker: TestSearchSessionTracker;

	setup(() => {
		mockTelemetryService = new MockTelemetryService();
		sessionTracker = new TestSearchSessionTracker();
	});

	test('Session tracker initializes correctly', () => {
		sessionTracker.startSession();
		
		assert.strictEqual(sessionTracker.getQueryCount(), 0);
		assert.strictEqual(sessionTracker.getAiSearchTriggered(), false);
		assert.strictEqual(sessionTracker.getAiResultsUsed(), false);
		assert.strictEqual(sessionTracker.getLastResultType(), 'none');
	});

	test('Session tracker records AI search queries', () => {
		sessionTracker.startSession();
		sessionTracker.trackQuery(true, 'manual');
		
		assert.strictEqual(sessionTracker.getQueryCount(), 1);
		assert.strictEqual(sessionTracker.getAiSearchTriggered(), true);
		assert.strictEqual(sessionTracker.getSearchTriggerType(), 'manual');
	});

	test('Session tracker records text search queries', () => {
		sessionTracker.startSession();
		sessionTracker.trackQuery(false, 'auto');
		
		assert.strictEqual(sessionTracker.getQueryCount(), 1);
		assert.strictEqual(sessionTracker.getAiSearchTriggered(), false);
		assert.strictEqual(sessionTracker.getSearchTriggerType(), 'auto');
	});

	test('Session tracker records AI result usage', () => {
		sessionTracker.startSession();
		sessionTracker.trackResultUsed(true);
		
		assert.strictEqual(sessionTracker.getAiResultsUsed(), true);
		assert.strictEqual(sessionTracker.getLastResultType(), 'ai');
	});

	test('Session tracker records text result usage', () => {
		sessionTracker.startSession();
		sessionTracker.trackResultUsed(false);
		
		assert.strictEqual(sessionTracker.getAiResultsUsed(), false);
		assert.strictEqual(sessionTracker.getLastResultType(), 'text');
	});

	test('Session end sends telemetry event', () => {
		sessionTracker.startSession();
		sessionTracker.trackQuery(true, 'manual');
		sessionTracker.trackResultUsed(true);
		sessionTracker.endSession(mockTelemetryService);
		
		assert.strictEqual(mockTelemetryService.events.length, 1);
		const event = mockTelemetryService.events[0];
		assert.strictEqual(event.eventName, 'searchSessionComplete');
		assert.strictEqual(event.data.queryCount, 1);
		assert.strictEqual(event.data.aiSearchTriggered, true);
		assert.strictEqual(event.data.aiResultsUsed, true);
		assert.strictEqual(event.data.sessionSuccessful, true);
		assert.strictEqual(event.data.finalResultType, 'ai');
	});

	test('Multiple queries tracked correctly', () => {
		sessionTracker.startSession();
		sessionTracker.trackQuery(false, 'auto');
		sessionTracker.trackQuery(true, 'manual');
		sessionTracker.trackQuery(false, 'runOnEmpty');
		
		assert.strictEqual(sessionTracker.getQueryCount(), 3);
		assert.strictEqual(sessionTracker.getAiSearchTriggered(), true);
		assert.strictEqual(sessionTracker.getSearchTriggerType(), 'runOnEmpty'); // Last trigger type
	});

	test('Session successful when any result is used', () => {
		sessionTracker.startSession();
		sessionTracker.trackQuery(true, 'manual');
		sessionTracker.trackResultUsed(false); // Use text result
		sessionTracker.endSession(mockTelemetryService);
		
		const event = mockTelemetryService.events[0];
		assert.strictEqual(event.data.sessionSuccessful, true);
		assert.strictEqual(event.data.finalResultType, 'text');
		assert.strictEqual(event.data.aiResultsUsed, false);
	});

	test('Session unsuccessful when no results used', () => {
		sessionTracker.startSession();
		sessionTracker.trackQuery(true, 'manual');
		// No result usage tracked
		sessionTracker.endSession(mockTelemetryService);
		
		const event = mockTelemetryService.events[0];
		assert.strictEqual(event.data.sessionSuccessful, false);
		assert.strictEqual(event.data.finalResultType, 'none');
		assert.strictEqual(event.data.aiResultsUsed, false);
	});
});