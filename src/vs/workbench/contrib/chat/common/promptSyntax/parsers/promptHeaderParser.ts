/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from '../../../../../../amdX.js';
// import { assert } from '../../../../../../base/common/assert.js';
// import { assertDefined } from '../../../../../../base/common/types.js';
import { FrontMatterHeader } from '../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';

/**
 * TODO: @legomushroom - list
 * - add js-yaml packages to `cgmanifest.json` file
 */

// /**
//  * TODO: @legomushroom
//  */
// interface IYamlObject { }
// ˆ
// /**
//  * TODO: @legomushroom
//  */
// type TYamlValue = string | number | boolean | Date | IYamlObject | TYamlValue[] | null;

// // /**
// //  * TODO: @legomushroom
// //  */
// // class YamlError extends Error {
// // 	constructor(
// // 		public readonly position: Position,
// // 	) { }
// // }

// /**
//  * TODO: @legomushroom
//  */
// const validateYamlValue = (value: unknown): TYamlValue => {
// 	assert(
// 		value !== undefined,
// 		'YAML value can be `undefined`.',
// 	);

// 	if (value === null) {
// 		return value;
// 	}

// 	if (typeof value === 'string') {
// 		return value;
// 	}

// 	if (typeof value === 'number') {
// 		return value;
// 	}

// };

// /**
//  * TODO: @legomushroom
//  */
// const validateYamlDocument = (yamlDocument: unknown): IYamlObject => {
// 	assertDefined(
// 		yamlDocument,
// 		'YAML document must be defined.',
// 	);


// 	// note! this also would be true for `null` values,
// 	// but we've already handled those above
// 	assert(
// 		typeof yamlDocument === 'object',
// 		'YAML document must be an object',
// 	);

// 	const result: IYamlObject = {};

// 	return result;
// };

// /**
//  * TODO: @legomushroom
//  */
// class YamlObject {
// 	constructor(document: unknown) {
// 		// if (typeof maybeObject !== 'object' || maybeObject === null) {
// 		// 	throw new Error('YAML object must be an object');
// 		// }
// 	}
// }

/**
 * TODO: @legomushroom
 */
export class PromptHeader {
	constructor(
		private readonly token: FrontMatterHeader,
	) { }

	/**
	 * TODO: @legomushroom
	 */
	// TODO: @legomushroom - any below!
	public async parse(): Promise<any> {
		try {
			const module = await importAMDNodeModule<typeof import('js-yaml')>('js-yaml', 'dist/js-yaml.js');

			const yamlDocument = module.load(this.token.contentText, {
				listener: (eventType, state) => {
					console.log(eventType, state);
				},
			});

			return yamlDocument;
		} catch (error) {
			return error;
		}
	}
}

// // 	/**
// // 	 * TODO: @legomushroom
// // 	 */
// // 	public static async testYamlModule(): Promise < unknown > {
// const module = await importAMDNodeModule<typeof import('js-yaml')>('js-yaml', 'dist/js-yaml.js');

// // 	try {
// // 		const yamlString = [
// // 			// '  name: value',
// // 			// '  value:   name',
// // 			'  kind: mode',
// // 			'  description: Planning',
// // 			// eslint-disable-next-line local/code-no-unexternalized-strings
// // 			"  enabledTools: ['think', fetch,   'perplexity:*', TRUE, 12.55, .5]",
// // 			// eslint-disable-next-line local/code-no-unexternalized-strings
// // 			"  mustHaveTools: ['codebase']",
// // 			'  test1: true',
// // 			'  test2:         false   ',
// // 			'  test3:   12   ',
// // 			'  test4:   12.2   ',
// // 			'  test5:   2001-12-15T02:59:43.1Z   ',
// // 		].join('\n');

// // 		const doc = module.load(yamlString);
// // 		return doc;
// // 	} catch(error) {
// // 		return error;
// // 	}
// // }
