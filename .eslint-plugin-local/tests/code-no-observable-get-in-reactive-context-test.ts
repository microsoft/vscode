/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test file to verify the code-no-observable-get-in-reactive-context ESLint rule works correctly

import { observableValue, derived, autorun } from '../../src/vs/base/common/observable.js';

export function testValidUsage() {
	const obs = observableValue('test', 0);

	// Valid: Using .read(reader) in derived
	const validDerived = derived(reader => {
		const value = obs.read(reader);
		return value * 2;
	});

	// Valid: Using .read(reader) in autorun
	autorun(rdr => {
		const value = validDerived.read(rdr);
		console.log('Value:', value);
	});

	// Valid: Using .get() outside reactive context
	const outsideValue = obs.get();
	console.log('Outside value:', outsideValue);
}

export function testInvalidUsage() {
	const obs = observableValue('test', 0);

	// Invalid: Using .get() in derived instead of .read(reader)
	const invalidDerived = derived(rdr => {
		// This should use obs.read(reader) instead
		// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
		const value = obs.get();
		// Use reader for something valid to avoid unused var warning
		const validValue = obs.read(rdr);

		obs.read(undefined);

		return value * 2 + validValue;
	});

	// Invalid: Using .get() in autorun instead of .read(reader)
	autorun(reader => {
		// This should use invalidDerived.read(reader) instead
		// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
		const value = invalidDerived.get();
		// Use reader for something valid to avoid unused var warning
		const validValue = obs.read(reader);
		console.log('Value:', value, validValue);
	});

	// Invalid: Using .get() in derivedWithStore
	derived(reader => {
		// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
		const value = obs.get();
		reader.store.add({ dispose: () => { } });
		return value;
	});
}

export function testComplexCases() {
	const obs1 = observableValue('test1', 0);
	const obs2 = observableValue('test2', 10);

	// Invalid: Using .get() in conditional within derived
	derived(reader => {
		const initial = obs1.read(reader);

		if (initial > 0) {
			// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
			return obs2.get();
		}

		return initial;
	});

	// Invalid: Using .get() in nested function call within autorun
	autorun(reader => {
		const process = () => {
			// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
			return obs1.get() + obs2.get();
		};

		// Use reader for something valid to avoid unused var warning
		const validValue = obs1.read(reader);
		const result = process();
		console.log('Result:', result, validValue);
	});

	// Invalid: Using .get() in try-catch within derived
	derived(reader => {
		try {
			// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
			const value = obs1.get();
			// Use reader for something valid to avoid unused var warning
			const validValue = obs2.read(reader);
			return value * 2 + validValue;
		} catch (e) {
			return obs2.read(reader);
		}
	});
}

export function testValidComplexCases() {
	const obs1 = observableValue('test1', 0);
	const obs2 = observableValue('test2', 10);

	// Valid: Proper usage with .read(reader)
	derived(reader => {
		const value1 = obs1.read(reader);
		const value2 = obs2.read(undefined);

		if (value1 > 0) {
			return value2;
		}

		return value1;
	});

	// Valid: Using .get() outside reactive context
	function processValues() {
		const val1 = obs1.get();
		const val2 = obs2.get();
		return val1 + val2;
	}

	// Valid: Mixed usage - .read(reader) inside reactive, .get() outside
	autorun(reader => {
		const reactiveValue = obs1.read(reader);
		const outsideValue = processValues();
		console.log('Values:', reactiveValue, outsideValue);
	});
}

export function testEdgeCases() {
	const obs = observableValue('test', 0);

	// Valid: Function with no reader parameter
	derived(() => {
		const value = obs.get();
		return value;
	});

	// Invalid: Function with differently named parameter (now also flagged)
	derived(_someOtherName => {
		// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
		const value = obs.get();
		return value;
	});

	// Invalid: Correctly named reader parameter
	derived(reader => {
		// eslint-disable-next-line local/code-no-observable-get-in-reactive-context
		const value = obs.get();
		// Use reader for something valid to avoid unused var warning
		const validValue = obs.read(reader);
		return value + validValue;
	});
}

export function testQuickFixScenarios() {
	const obs = observableValue('test', 0);
	const obs2 = observableValue('test2', 10);

	// These examples show what the quick fix should transform:

	// Example 1: Simple case with 'reader' parameter name
	derived(_reader => {
		const value = obs.read(undefined); // This should be the auto-fix result
		return value;
	});

	// Example 2: Different parameter name
	derived(rdr => {
		// Before fix: obs2.get()
		// After fix: obs2.read(rdr)
		const value = obs2.read(rdr); // This should be the auto-fix result
		return value;
	});

	// Example 3: Complex expression
	derived(ctx => {
		// Before fix: (someCondition ? obs : obs2).get()
		// After fix: (someCondition ? obs : obs2).read(ctx)
		const someCondition = true;
		const value = (someCondition ? obs : obs2).read(ctx); // This should be the auto-fix result
		return value;
	});

	// Example 4: Multiple calls in same function
	autorun(reader => {
		// Before fix: obs.get() and obs2.get()
		// After fix: obs.read(reader) and obs2.read(reader)
		const val1 = obs.read(reader); // This should be the auto-fix result
		const val2 = obs2.read(reader); // This should be the auto-fix result
		console.log(val1, val2);
	});
}
