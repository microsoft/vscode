/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { Result } from '../result';

describe('Result', () => {

	describe('Result.ok', () => {
		it('creates an ok result', () => {
			const r = Result.ok(42);
			expect(r.isOk()).toBe(true);
			expect(r.isError()).toBe(false);
			expect(r.val).toBe(42);
		});
	});

	describe('Result.error', () => {
		it('creates an error result', () => {
			const r = Result.error('bad');
			expect(r.isOk()).toBe(false);
			expect(r.isError()).toBe(true);
			expect(r.err).toBe('bad');
		});
	});

	describe('Result.fromString', () => {
		it('creates an error result with an Error instance', () => {
			const r = Result.fromString('something failed');
			expect(r.isError()).toBe(true);
			expect(r.err).toBeInstanceOf(Error);
			expect(r.err.message).toBe('something failed');
		});
	});

	describe('Result.tryWith', () => {
		it('returns ok when the function succeeds', () => {
			const r = Result.tryWith(() => 10 + 5);
			expect(r.isOk()).toBe(true);
			if (r.isOk()) {
				expect(r.val).toBe(15);
			}
		});

		it('returns error when the function throws', () => {
			const r = Result.tryWith(() => { throw new Error('boom'); });
			expect(r.isError()).toBe(true);
			if (r.isError()) {
				expect(r.err.message).toBe('boom');
			}
		});
	});

	describe('Result.tryWithAsync', () => {
		it('returns ok when the async function resolves', async () => {
			const r = await Result.tryWithAsync(async () => 99);
			expect(r.isOk()).toBe(true);
			if (r.isOk()) {
				expect(r.val).toBe(99);
			}
		});

		it('returns error when the async function rejects', async () => {
			const r = await Result.tryWithAsync(async () => { throw new Error('async boom'); });
			expect(r.isError()).toBe(true);
			if (r.isError()) {
				expect(r.err.message).toBe('async boom');
			}
		});
	});

	describe('map', () => {
		it('transforms the value of an ok result', () => {
			const r = Result.ok(3).map(x => x * 2);
			expect(r.isOk()).toBe(true);
			if (r.isOk()) {
				expect(r.val).toBe(6);
			}
		});

		it('is a no-op on an error result', () => {
			const r: Result<number, string> = Result.error('fail');
			const mapped = r.map(x => x * 2);
			expect(mapped.isError()).toBe(true);
			if (mapped.isError()) {
				expect(mapped.err).toBe('fail');
			}
		});
	});

	describe('mapError', () => {
		it('is a no-op on an ok result', () => {
			const r: Result<number, string> = Result.ok(5);
			const mapped = r.mapError(e => new Error(e));
			expect(mapped.isOk()).toBe(true);
			if (mapped.isOk()) {
				expect(mapped.val).toBe(5);
			}
		});

		it('transforms the error of an error result', () => {
			const r = Result.error('oops');
			const mapped = r.mapError(e => ({ reason: e }));
			expect(mapped.isError()).toBe(true);
			if (mapped.isError()) {
				expect(mapped.err).toEqual({ reason: 'oops' });
			}
		});
	});

	describe('flatMap', () => {
		it('chains ok results', () => {
			const r = Result.ok(10).flatMap(x =>
				x > 0 ? Result.ok(x.toString()) : Result.error('negative' as const)
			);
			expect(r.isOk()).toBe(true);
			if (r.isOk()) {
				expect(r.val).toBe('10');
			}
		});

		it('chains to an error result', () => {
			const r = Result.ok(-1).flatMap(x =>
				x > 0 ? Result.ok(x.toString()) : Result.error('negative' as const)
			);
			expect(r.isError()).toBe(true);
			if (r.isError()) {
				expect(r.err).toBe('negative');
			}
		});

		it('is a no-op on an error result', () => {
			const r: Result<number, string> = Result.error('already bad');
			const chained = r.flatMap(x => Result.ok(x * 2));
			expect(chained.isError()).toBe(true);
			if (chained.isError()) {
				expect(chained.err).toBe('already bad');
			}
		});
	});

	describe('unwrap', () => {
		it('returns the value for ok results', () => {
			expect(Result.ok('hello').unwrap()).toBe('hello');
		});

		it('throws for error results with an Error', () => {
			const r: Result<string, Error> = Result.error(new Error('fail'));
			expect(() => r.unwrap()).toThrow('fail');
		});

		it('throws a wrapped error for non-Error error values', () => {
			const r: Result<string, string> = Result.error('string error');
			expect(() => r.unwrap()).toThrow('string error');
		});
	});

	describe('unwrapOr', () => {
		it('returns the value for ok results', () => {
			const r: Result<number, string> = Result.ok(42);
			expect(r.unwrapOr(0)).toBe(42);
		});

		it('returns the default for error results', () => {
			const r: Result<number, string> = Result.error('nope');
			expect(r.unwrapOr(0)).toBe(0);
		});
	});

	describe('type narrowing', () => {
		it('narrows to ok after isOk check', () => {
			const r: Result<number, string> = Result.ok(1);
			if (r.isOk()) {
				// TypeScript should know r.val exists here
				const _v: number = r.val;
				expect(_v).toBe(1);
			}
		});

		it('narrows to error after isError check', () => {
			const r: Result<number, string> = Result.error('e');
			if (r.isError()) {
				// TypeScript should know r.err exists here
				const _e: string = r.err;
				expect(_e).toBe('e');
			}
		});
	});
});
