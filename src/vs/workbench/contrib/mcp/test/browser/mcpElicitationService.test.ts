/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { McpElicitationService } from '../../browser/mcpElicitationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { mock } from '../../../../../base/test/common/utils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('McpElicitationService Email Validation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let service: McpElicitationService;

	setup(() => {
		const notificationService = mock<INotificationService>();
		const quickInputService = mock<IQuickInputService>();
		const chatService = mock<IChatService>();
		
		service = new McpElicitationService(
			notificationService,
			quickInputService,
			chatService
		);
	});

	test('email validation should accept valid email addresses', () => {
		const validEmails = [
			'user@example.com',
			'test.email@domain.org',
			'user123@test.co.uk',
			'first.last@subdomain.example.com',
			'user+tag@example.com'
		];

		validEmails.forEach(email => {
			const result = (service as any)._validateStringFormat(email, 'email');
			assert.strictEqual(result.isValid, true, `Email "${email}" should be valid`);
			assert.strictEqual(result.message, undefined, `Valid email "${email}" should not have error message`);
		});
	});

	test('email validation should reject invalid email addresses', () => {
		const invalidEmails = [
			'invalid-email',           // No @ symbol
			'missing@domain',          // No TLD
			'@domain.com',            // No username
			'user@',                  // No domain
			'',                       // Empty string
			'no-at-symbol.com',       // No @ symbol
			'user@domain',            // No TLD
			'user @domain.com',       // Space in username
			'user@domain .com',       // Space in domain
			'user@@domain.com',       // Double @
			'user@domain..com'        // Double dots
		];

		invalidEmails.forEach(email => {
			const result = (service as any)._validateStringFormat(email, 'email');
			assert.strictEqual(result.isValid, false, `Email "${email}" should be invalid`);
			assert.strictEqual(result.message, 'Please enter a valid email address', `Invalid email "${email}" should have error message`);
		});
	});

	test('other format validations should work unchanged', () => {
		// Test URI validation still works
		const validUri = (service as any)._validateStringFormat('https://example.com', 'uri');
		assert.strictEqual(validUri.isValid, true);

		const invalidUri = (service as any)._validateStringFormat('not-a-uri', 'uri');
		assert.strictEqual(invalidUri.isValid, false);

		// Test date validation still works
		const validDate = (service as any)._validateStringFormat('2023-12-25', 'date');
		assert.strictEqual(validDate.isValid, true);

		const invalidDate = (service as any)._validateStringFormat('invalid-date', 'date');
		assert.strictEqual(invalidDate.isValid, false);
	});
});