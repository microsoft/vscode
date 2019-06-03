/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module "onigasm-umd" {

	function loadWASM(data: string | ArrayBuffer): Promise<void>;

	class OnigString {
		constructor(content: string);
		readonly content: string;
		readonly dispose?: () => void;
	}

	class OnigScanner {
		constructor(patterns: string[]);
		findNextMatchSync(string: string | OnigString, startPosition: number): IOnigMatch;
	}

	export interface IOnigCaptureIndex {
		index: number
		start: number
		end: number
		length: number
	}

	export interface IOnigMatch {
		index: number
		captureIndices: IOnigCaptureIndex[]
		scanner: OnigScanner
	}
}