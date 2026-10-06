/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ILink, LinkedText } from '../../../../base/common/linkedText.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INotificationHandle, INotificationService, NotificationMessage } from '../../common/notification.js';
import { isLegacyExtensionLinkParsing, legacyExtensionLinkParsing, type LegacyExtensionLinkParsing } from '../../common/notificationLegacy.js';
import { NotificationText } from '../../common/notificationMessage.js';
import { IProgressOptions, IProgressStep } from '../../../progress/common/progress.js';

suite('NotificationText', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formats literal arguments and explicit links without interpreting markup', () => {
		const filename = 'README.md [Open](command:unexpected "Open README")';
		const link = NotificationText.link('[Show logs](command:unexpected)', 'command:showLogs?%5B%22file%22%5D');
		assert.deepStrictEqual(NotificationText.format('Failed to open {0}. {1}', filename, link).nodes, [
			'Failed to open ',
			filename,
			'. ',
			{ label: '[Show logs](command:unexpected)', href: 'command:showLogs?%5B%22file%22%5D' }
		]);
	});

	test('formats reordered, repeated and missing placeholders without expanding arguments recursively', () => {
		const link = NotificationText.link('Details', 'https://example.com');
		assert.deepStrictEqual(NotificationText.format('{1}: {0}, {1}, {2}', '{1}', link).nodes, [
			{ label: 'Details', href: 'https://example.com' }, ': ', '{1}', ', ',
			{ label: 'Details', href: 'https://example.com' }, ', ', '{2}'
		]);
	});

	test('formats empty and literal templates', () => {
		assert.deepStrictEqual([
			NotificationText.format('').nodes,
			NotificationText.format('[Open](command:unexpected)').nodes
		], [
			[],
			['[Open](command:unexpected)']
		]);
	});

	test('composes rich fragments and preserves link targets when transforming display text', () => {
		const message = NotificationText.concat(
			'$(sync) Working. ',
			NotificationText.link('$(info) [Logs](command:unexpected)', 'command:showLogs?%5B%22file%22%5D', 'Show Logs')
		);
		const mapped = message.mapText(stripIcons);
		assert.deepStrictEqual({
			original: message.toString(),
			nodes: mapped.nodes,
			text: mapped.toString(),
		}, {
			original: '$(sync) Working. $(info) [Logs](command:unexpected)',
			nodes: [' Working. ', { label: ' [Logs](command:unexpected)', href: 'command:showLogs?%5B%22file%22%5D', title: 'Show Logs' }],
			text: ' Working.  [Logs](command:unexpected)',
		});
	});

	test('does not expose mutable nodes', () => {
		const link = NotificationText.link('Details', 'command:showDetails');
		const message = NotificationText.concat('Open ', link).mapText(text => text);
		assert.deepStrictEqual({
			nodesFrozen: Object.isFrozen(message.nodes),
			linkFrozen: Object.isFrozen(message.nodes[1]),
			sourceLinkFrozen: Object.isFrozen(link.nodes[0]),
		}, {
			nodesFrozen: true,
			linkFrozen: true,
			sourceLinkFrozen: true,
		});
	});

	test('requires nominal notification content and capabilities at every API boundary', () => {
		const assignable: {
			parsedMessage: LinkedText extends NotificationMessage ? true : false;
			parsedPrompt: LinkedText extends Parameters<INotificationService['prompt']>[1] ? true : false;
			parsedUpdate: LinkedText extends Parameters<INotificationHandle['updateMessage']>[0] ? true : false;
			parsedTitle: LinkedText extends IProgressOptions['title'] ? true : false;
			parsedProgress: LinkedText extends IProgressStep['message'] ? true : false;
			parsedFragment: LinkedText extends Parameters<typeof NotificationText.concat>[number] ? true : false;
			unbrandedLink: ILink extends Parameters<typeof NotificationText.format>[1] ? true : false;
			booleanCapability: boolean extends LegacyExtensionLinkParsing ? true : false;
			symbolCapability: symbol extends LegacyExtensionLinkParsing ? true : false;
		} = {
			parsedMessage: false, parsedPrompt: false, parsedUpdate: false, parsedTitle: false,
			parsedProgress: false, parsedFragment: false, unbrandedLink: false,
			booleanCapability: false, symbolCapability: false,
		};
		assert.deepStrictEqual(Object.values(assignable), Array(9).fill(false));
	});

	test('checks legacy capability identity rather than its shape or truthiness', () => {
		assert.deepStrictEqual([
			legacyExtensionLinkParsing, true, false, undefined, {}, Symbol('legacyExtensionLinkParsing')
		].map(value => isLegacyExtensionLinkParsing(value)), [true, false, false, false, false, false]);
	});
});
