/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ISearchConfigurationProperties } from '../../../../services/search/common/search.js';

suite('Search confirmReplaceAll Configuration', () => {
	test('Should confirm by default when confirmReplaceAll is undefined', function () {
		const config: Partial<ISearchConfigurationProperties> = {};
		const shouldConfirm = config.confirmReplaceAll !== false;
		assert.strictEqual(shouldConfirm, true, 'Should confirm when confirmReplaceAll is undefined');
	});

	test('Should confirm when confirmReplaceAll is true', function () {
		const config: ISearchConfigurationProperties = {
			confirmReplaceAll: true
		} as ISearchConfigurationProperties;
		const shouldConfirm = config.confirmReplaceAll !== false;
		assert.strictEqual(shouldConfirm, true, 'Should confirm when confirmReplaceAll is true');
	});

	test('Should not confirm when confirmReplaceAll is false', function () {
		const config: ISearchConfigurationProperties = {
			confirmReplaceAll: false
		} as ISearchConfigurationProperties;
		const shouldConfirm = config.confirmReplaceAll !== false;
		assert.strictEqual(shouldConfirm, false, 'Should not confirm when confirmReplaceAll is false');
	});

	test('Should confirm when confirmReplaceAll is null', function () {
		const config: ISearchConfigurationProperties = {
			confirmReplaceAll: null as any
		} as ISearchConfigurationProperties;
		const shouldConfirm = config.confirmReplaceAll !== false;
		assert.strictEqual(shouldConfirm, true, 'Should confirm when confirmReplaceAll is null');
	});
});