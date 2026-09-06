/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { toErrorMessage } from '../../common/errorMessage';

describe('errorMessage', () => {
	describe('toErrorMessage', () => {
		it('returns default message for null', () => {
			const result = toErrorMessage(null);
			// In test environment, l10n.t returns the message itself
			expect(result).toBe('An unknown error occurred. Please consult the log for more details.');
		});

		it('returns default message for undefined', () => {
			const result = toErrorMessage(undefined);
			expect(result).toBe('An unknown error occurred. Please consult the log for more details.');
		});

		it('returns the string when error is a string', () => {
			const result = toErrorMessage('Test error message');
			expect(result).toBe('Test error message');
		});

		it('returns error.message for Error objects', () => {
			const error = new Error('Something went wrong');
			const result = toErrorMessage(error);
			expect(result).toBe('Something went wrong');
		});

		it('handles array of errors and returns first error message', () => {
			const errors = [new Error('First error'), new Error('Second error')];
			const result = toErrorMessage(errors);
			// In test environment, l10n.t returns the formatted message
			expect(result).toBe('First error (2 errors in total)');
		});

		it('handles array with single error', () => {
			const errors = [new Error('Only error')];
			const result = toErrorMessage(errors);
			expect(result).toBe('Only error');
		});

		it('handles error with detail.error property', () => {
			const error = {
				detail: {
					error: new Error('Detail error')
				}
			};
			const result = toErrorMessage(error);
			expect(result).toBe('Detail error');
		});

		it('handles error with detail.exception property', () => {
			const error = {
				detail: {
					exception: new Error('Detail exception')
				}
			};
			const result = toErrorMessage(error);
			expect(result).toBe('Detail exception');
		});

		it('includes stack trace in verbose mode', () => {
			const error = new Error('Error with stack');
			error.stack = 'Error: Error with stack\n  at someFunction (file.ts:10:5)';
			const result = toErrorMessage(error, true);
			// Now using template string format
			expect(result).toBe('Error with stack: Error: Error with stack\n  at someFunction (file.ts:10:5)');
		});

		it('does not include stack trace in non-verbose mode', () => {
			const error = new Error('Error with stack');
			error.stack = 'Error: Error with stack\n  at someFunction (file.ts:10:5)';
			const result = toErrorMessage(error, false);
			expect(result).toBe('Error with stack');
			expect(result).not.toContain('at someFunction');
		});

		it('handles stack trace as array', () => {
			const error: any = {
				message: 'Array stack error',
				stack: ['at line 1', 'at line 2', 'at line 3']
			};
			const result = toErrorMessage(error, true);
			expect(result).toBe('Array stack error: at line 1\nat line 2\nat line 3');
		});

		it('handles Node.js system errors', () => {
			const systemError: any = {
				code: 'ENOENT',
				errno: -2,
				syscall: 'open',
				message: 'File not found'
			};
			const result = toErrorMessage(systemError);
			// System error detection returns l10n.t result, which in tests returns the key
			// However, since the error has a .message, toErrorMessage returns that directly (line 86)
			expect(result).toBe('File not found');
		});

		it('handles ERR_UNC_HOST_NOT_ALLOWED error', () => {
			const uncError: any = {
				code: 'ERR_UNC_HOST_NOT_ALLOWED',
				message: 'UNC host not allowed',
				// Need to add stack for the error to go through exceptionToErrorMessage
				stack: 'Error: UNC host not allowed\n  at someFunction'
			};
			const result = toErrorMessage(uncError);
			// With a stack, it goes through exceptionToErrorMessage -> detectSystemErrorMessage
			expect(result).toContain('UNC host not allowed');
			expect(result).toContain('security.allowedUNCHosts');
		});

		it('filters out null/undefined values from error array', () => {
			const errors = [null, undefined, new Error('Valid error'), null];
			const result = toErrorMessage(errors);
			expect(result).toBe('Valid error');
		});
	});
});
