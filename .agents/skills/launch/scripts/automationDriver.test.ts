/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'node:assert';
import { test } from 'node:test';
import type { Locator } from 'playwright';
import type { IAttachedSession } from './attach.ts';
import { executeAutomationRequest, type IAutomationExecutionContext } from './automationDriver.ts';
import { safeClick } from './automationState.ts';

function testContext(pageOverride?: IAttachedSession['page']): { context: IAutomationExecutionContext; detached: () => number } {
	let detachCount = 0;
	const placeholder = Object.freeze({});
	const session = {
		browser: placeholder as IAttachedSession['browser'],
		page: pageOverride ?? placeholder as IAttachedSession['page'],
		code: placeholder as IAttachedSession['code'],
		workbench: placeholder as IAttachedSession['workbench'],
		detach: async () => { detachCount++; }
	};
	const context: IAutomationExecutionContext = {
		session,
		browser: session.browser,
		page: session.page,
		code: session.code,
		workbench: session.workbench,
		snapshot: async () => ({}),
		settle: async () => ({
			durationMs: 0,
			animationFrames: 2,
			mutationCount: 0,
			focusChangeCount: 0
		}),
		collectVirtualized: async () => {
			throw new Error('Not used by this test.');
		},
		safeClick,
		onTimeout: () => { void session.detach(); }
	};
	return { context, detached: () => detachCount };
}

test('executes unrestricted function expressions', async () => {
	const { context } = testContext();
	const response = await executeAutomationRequest({
		id: 'arbitrary-code',
		code: 'async ({ page, workbench }) => ({ page: typeof page, workbench: typeof workbench })',
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		actionOk: response.action.ok,
		value: response.action.value,
		hasVerification: !!response.verification
	}, {
		ok: true,
		actionOk: true,
		value: { page: 'object', workbench: 'object' },
		hasVerification: false
	});
});

test('exposes UI settling to arbitrary functions', async () => {
	const { context } = testContext();
	const response = await executeAutomationRequest({
		id: 'settle-ui',
		code: 'async ({ settle }) => settle()',
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		value: response.action.value
	}, {
		ok: true,
		value: {
			durationMs: 0,
			animationFrames: 2,
			mutationCount: 0,
			focusChangeCount: 0
		}
	});
});

test('exposes safe clicking to arbitrary functions', async () => {
	const { context } = testContext();
	const response = await executeAutomationRequest({
		id: 'safe-click',
		code: 'async ({ safeClick }) => typeof safeClick',
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		value: response.action.value
	}, {
		ok: true,
		value: 'function'
	});
});

test('safe click performs a trial before clicking the intended control', async () => {
	const clicks: Array<{ trial?: boolean }> = [];
	const target = {
		count: async () => 1,
		scrollIntoViewIfNeeded: async () => { },
		boundingBox: async () => ({ x: 10, y: 20, width: 100, height: 40 }),
		click: async (options: { trial?: boolean }) => {
			clicks.push({ trial: options.trial });
		},
		evaluate: async () => ({ safe: true, intended: '<button "Collapse">', actual: '<button "Collapse">' })
	} as Locator;

	assert.deepStrictEqual({
		result: await safeClick(target),
		clicks
	}, {
		result: undefined,
		clicks: [{ trial: true }, { trial: undefined }]
	});
});

test('safe click rejects a nested control at the click point', async () => {
	let actualClicks = 0;
	const target = {
		count: async () => 1,
		scrollIntoViewIfNeeded: async () => { },
		boundingBox: async () => ({ x: 10, y: 20, width: 100, height: 40 }),
		click: async (options: { trial?: boolean }) => {
			if (!options.trial) {
				actualClicks++;
			}
		},
		evaluate: async () => ({
			safe: false,
			intended: '<div role="button" "Graph Section">',
			actual: '<a role="button" "vscode">'
		})
	} as Locator;

	await assert.rejects(() => safeClick(target), {
		message: 'safeClick(): intended <div role="button" "Graph Section">, but <a role="button" "vscode"> would receive the click. Use a more precise locator.'
	});
	assert.strictEqual(actualClicks, 0);
});

test('separates successful action from failed verification', async () => {
	const { context } = testContext();
	const response = await executeAutomationRequest({
		id: 'verification-failure',
		code: 'async () => ({ clicked: true })',
		verify: 'async (_context, action) => { if (!action.clicked) { throw new Error("not clicked"); } throw new Error("wrong destination"); }',
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		actionOk: response.action.ok,
		actionValue: response.action.value,
		verificationOk: response.verification?.ok,
		verificationMessage: response.verification?.error?.message
	}, {
		ok: false,
		actionOk: true,
		actionValue: { clicked: true },
		verificationOk: false,
		verificationMessage: 'wrong destination'
	});
});

test('does not run verification after an action failure', async () => {
	const { context } = testContext();
	const response = await executeAutomationRequest({
		id: 'action-failure',
		code: 'async () => { throw new Error("action failed"); }',
		verify: 'async () => { throw new Error("must not run"); }',
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		actionOk: response.action.ok,
		actionMessage: response.action.error?.message,
		verification: response.verification
	}, {
		ok: false,
		actionOk: false,
		actionMessage: 'action failed',
		verification: undefined
	});
});

test('times out, disconnects the stale CDP session, and returns', async () => {
	const { context, detached } = testContext();
	const response = await executeAutomationRequest({
		id: 'timeout',
		code: 'async () => new Promise(() => {})',
		timeoutMs: 10,
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		actionOk: response.action.ok,
		errorName: response.action.error?.name,
		detachCount: detached()
	}, {
		ok: false,
		actionOk: false,
		errorName: 'AutomationTimeoutError',
		detachCount: 1
	});
});

test('reports non-serializable results as action failures', async () => {
	const { context } = testContext();
	const response = await executeAutomationRequest({
		id: 'cyclic-result',
		code: 'async () => { const value = {}; value.self = value; return value; }',
		includeState: false
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		actionOk: response.action.ok,
		isSerializationError: response.action.error?.message.startsWith(
			'Action returned a value that cannot be serialized as JSON: Converting circular structure to JSON'
		)
	}, {
		ok: false,
		actionOk: false,
		isSerializationError: true
	});
});

test('times out automatic state capture and marks the response failed', async () => {
	const hangingPage = {
		evaluate: async () => new Promise(() => { })
	} as IAttachedSession['page'];
	const { context, detached } = testContext(hangingPage);
	const response = await executeAutomationRequest({
		id: 'snapshot-timeout',
		code: 'async () => ({ completed: true })',
		timeoutMs: 10
	}, context);

	assert.deepStrictEqual({
		ok: response.ok,
		actionOk: response.action.ok,
		stateErrorName: response.stateError?.name,
		detachCount: detached()
	}, {
		ok: false,
		actionOk: true,
		stateErrorName: 'AutomationTimeoutError',
		detachCount: 1
	});
});
