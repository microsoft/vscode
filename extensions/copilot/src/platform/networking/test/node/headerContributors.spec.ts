/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { beforeEach, suite, test } from 'vitest';
import { TestHeaderContributor } from '../../../test/node/testHeaderContributor';
import { HeaderContributors, IHeaderContributors } from '../../common/networking';

suite('HeaderContributors', () => {
	let contributorCollection: IHeaderContributors;
	let contributor: TestHeaderContributor;

	beforeEach(() => {
		contributorCollection = new HeaderContributors();
		contributor = new TestHeaderContributor();
		contributorCollection.add(contributor);
	});

	test('should allow adding a contributor', function () {
		assert.strictEqual(contributorCollection.size(), 1);
	});

	test('should call all registered contributors', function () {
		const spy = sinon.spy(contributor, 'contributeHeaderValues');
		const headers = {};

		contributorCollection.contributeHeaders(headers);

		assert.strictEqual(spy.callCount, 1);
		assert.strictEqual(spy.calledWith(headers), true);
	});

	test('should allow removing a contributor', () => {
		contributorCollection.remove(contributor);
		assert.strictEqual(contributorCollection.size(), 0);
	});
});
