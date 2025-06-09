/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';
import { SpacingToken, SimpleToken, Space, Tab, VerticalTab } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';

suite('SimpleToken', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('SpacingToken', () => {
		test('extends \'SimpleToken\'', () => {
			class TestClass extends SpacingToken {
				public override get text(): string {
					throw new Error('Method not implemented.');
				}
				public override toString(): string {
					throw new Error('Method not implemented.');
				}
			}

			const token = new TestClass(new Range(1, 1, 1, 1));

			assert(
				token instanceof SimpleToken,
				'SpacingToken must extend SimpleToken.',
			);
		});
	});

	suite('Space', () => {
		test('extends \'SpacingToken\'', () => {
			const token = new Space(new Range(1, 1, 1, 2));

			assert(
				token instanceof SimpleToken,
				'Space must extend SpacingToken.',
			);
		});
	});

	suite('Tab', () => {
		test('extends \'SpacingToken\'', () => {
			const token = new Tab(new Range(1, 1, 1, 2));

			assert(
				token instanceof SimpleToken,
				'Tab must extend SpacingToken.',
			);
		});
	});

	suite('VerticalTab', () => {
		test('extends \'SpacingToken\'', () => {
			const token = new VerticalTab(new Range(1, 1, 1, 2));

			assert(
				token instanceof SimpleToken,
				'VerticalTab must extend SpacingToken.',
			);
		});
	});
});
