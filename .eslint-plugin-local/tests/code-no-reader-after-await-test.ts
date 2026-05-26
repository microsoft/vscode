/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test file to verify the code-no-reader-after-await ESLint rule works correctly

import { observableValue, derived, autorun } from '../../src/vs/base/common/observable.js';

export function testValidUsage() {
	const obs = observableValue('test', 0);

	const validDerived = derived(reader => {
		const value = obs.read(reader);
		return value * 2;
	});

	autorun(reader => {
		const value = validDerived.read(reader);
		console.log('Value:', value);
	});
}

export function testInvalidUsage() {
	const obs = observableValue('test', 0);

	const invalidDerived = derived(async reader => {
		await Promise.resolve();
		// eslint-disable-next-line local/code-no-reader-after-await
		const value = obs.read(reader);
		return value * 2;
	});

	autorun(async reader => {
		await Promise.resolve();
		// eslint-disable-next-line local/code-no-reader-after-await
		const value = invalidDerived.read(reader);
		console.log('Value:', value);
	});

	autorun(async reader => {
		await Promise.resolve();
		// eslint-disable-next-line local/code-no-reader-after-await
		const value = reader.readObservable(obs);
		console.log('Value:', value);
	});
}

export function testComplexCases() {
	const obs = observableValue('test', 0);

	derived(async reader => {
		const initial = obs.read(reader);

		if (initial > 0) {
			await Promise.resolve();
		}

		// eslint-disable-next-line local/code-no-reader-after-await
		const final = obs.read(reader);
		return final;
	});

	autorun(async reader => {
		try {
			await Promise.resolve();
		} catch (e) {
		} finally {
			// eslint-disable-next-line local/code-no-reader-after-await
			const value = obs.read(reader);
			console.log(value);
		}
	});
}

export function testValidComplexCases() {
	const obs = observableValue('test', 0);

	derived(async reader => {
		const value1 = obs.read(reader);
		const value2 = reader.readObservable(obs);
		const result = value1 + value2;
		await Promise.resolve(result);
		return result;
	});
}
