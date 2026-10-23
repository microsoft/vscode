/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as yaml from 'yaml';

/**
 * Types for CoffE completion stests.
 */
export namespace CompletionStests {

	export interface TestDocument {
		uri: string;
		text: string;
	}

	interface TestState {
		openFiles: TestDocument[];
	}

	interface TestCompletionTarget {
		uri: string;
	}

	export interface TestInput {
		state: TestState;
		completion: TestCompletionTarget;
	}

	/**
	 * Parses YAML file contents into a TestInput object.
	 * Converts kebab-case property names to camelCase.
	 */
	export function parseTestInput(fileContents: string): TestInput {
		return yaml.parse(fileContents, {
			reviver: (_, value) => {
				if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
					const converted: Record<string, any> = {};
					for (const prop in value) {
						if (Object.prototype.hasOwnProperty.call(value, prop)) {
							const camelKey = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
							converted[camelKey] = (value as Record<string, any>)[prop];
						}
					}
					return converted;
				}
				return value;
			}
		}) as TestInput;
	}

	export interface Position {
		line: number;
		character: number;
	}

	export interface Range {
		start: Position;
		end: Position;
	}
	// export namepsace Range {
	// 	export function of
	// }


	export interface TestCompletion {
		insertText: string;
		/**
		 * Actual ghost text shown to the user.
		 */
		displayText: string;
		range: Range;
	}

	export interface TestOutput {
		completions: TestCompletion[];
	}

}
