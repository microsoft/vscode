/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, expect, suite, test } from 'vitest';
import {
	_dispose
} from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { srcWithAnnotatedNodeToDoc } from './getNodeToDocument.util';


suite('getNodeToDocument - java', () => {

	afterAll(() => _dispose());

	async function run(annotatedSrc: string) {
		return srcWithAnnotatedNodeToDoc(
			WASMLanguage.Java,
			annotatedSrc,
		);
	}

	test('should return root node for empty source', async () => {

		const result = await run('<<>>');

		expect(result).toMatchInlineSnapshot(`"<PROGRAM></PROGRAM>"`);
	});


	test('use correct identifier name for a method', async () => {
		const result = await run(
			outdent`
				package com.mycompany.app;

				public class MyMath
				{
					public String check<<>>Sign(int number) {
						if ( number > 0 ) {
							return "positive";
						} else if ( number < 0 ) {
							return "negative";
						} else {
							throw new IllegalArgumentException("Number had no sign");
						}
					}

					/**
					 * Reverses the sign of a given number
					 * @param number the input number
					 * @return a number with reversed sign
					 */
					public int reverseNumber(int number) {
						return -number;
					}
				}
				`,
		);
		expect(result).toMatchInlineSnapshot(`
			"package com.mycompany.app;

			public class MyMath
			{
				<METHOD_DECLARATION>public String <IDENT>checkSign</IDENT>(int number) {
					if ( number > 0 ) {
						return "positive";
					} else if ( number < 0 ) {
						return "negative";
					} else {
						throw new IllegalArgumentException("Number had no sign");
					}
				}</METHOD_DECLARATION>

				/**
				 * Reverses the sign of a given number
				 * @param number the input number
				 * @return a number with reversed sign
				 */
				public int reverseNumber(int number) {
					return -number;
				}
			}"
		`);
	});
});
