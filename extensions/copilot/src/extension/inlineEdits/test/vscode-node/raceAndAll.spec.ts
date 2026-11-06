/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test, vi } from 'vitest';
import { raceAndAll } from '../../vscode-node/raceAndAll';

const noopErrorHandler = () => { };

suite('raceAndAll', () => {

	test('first resolves with the first settled promise', async () => {
		const { first } = raceAndAll([
			Promise.resolve('a'),
			new Promise<string>(resolve => setTimeout(() => resolve('b'), 5)),
		], noopErrorHandler);
		const result = await first;
		expect(result).toEqual(['a', undefined]);
	});

	test('all resolves with all values', async () => {
		const { all } = raceAndAll([
			Promise.resolve('a'),
			Promise.resolve('b'),
		], noopErrorHandler);
		const result = await all;
		expect(result).toEqual(['a', 'b']);
	});

	test('when first promise rejects, first still resolves with the second promise', async () => {
		const { first, all } = raceAndAll([
			Promise.reject(new Error('fail')),
			Promise.resolve('b'),
		], noopErrorHandler);
		const allResult = expect(all).rejects.toThrow('fail');
		const result = await first;
		expect(result).toEqual([undefined, 'b']);
		await allResult;
	});

	test('when second promise rejects, first resolves with the first promise', async () => {
		const { first, all } = raceAndAll([
			Promise.resolve('a'),
			Promise.reject(new Error('fail')),
		], noopErrorHandler);
		const allResult = expect(all).rejects.toThrow('fail');
		const result = await first;
		expect(result).toEqual(['a', undefined]);
		await allResult;
	});

	test('when all promises reject, first rejects', async () => {
		const { first, all } = raceAndAll([
			Promise.reject(new Error('fail1')),
			Promise.reject(new Error('fail2')),
		], noopErrorHandler);
		await expect(first).rejects.toThrow('All promises passed to raceAndAll were rejected');
		await expect(all).rejects.toThrow('fail1');
	});

	test('when first promise rejects and second resolves later, first waits for second', async () => {
		const { first, all } = raceAndAll([
			Promise.reject(new Error('fail')),
			new Promise<string>(resolve => setTimeout(() => resolve('b'), 5)),
		], noopErrorHandler);
		const allResult = expect(all).rejects.toThrow('fail');
		const result = await first;
		expect(result).toEqual([undefined, 'b']);
		await allResult;
	});

	test('errorHandler is called for each rejection', async () => {
		const errorHandler = vi.fn();
		const err1 = new Error('fail1');
		const err2 = new Error('fail2');
		const { first, all } = raceAndAll([
			Promise.reject(err1),
			Promise.reject(err2),
		], errorHandler);
		const allResult = expect(all).rejects.toThrow('fail1');
		await expect(first).rejects.toThrow();
		await allResult;
		expect(errorHandler).toHaveBeenCalledTimes(2);
		expect(errorHandler).toHaveBeenCalledWith(err1);
		expect(errorHandler).toHaveBeenCalledWith(err2);
	});
});
