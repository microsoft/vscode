/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ILineTokens} from 'vs/editor/common/editorCommon';
import {ViewLineTokens} from 'vs/editor/common/core/viewLineToken';

export class FilteredLineTokens {
	/**
	 * [startOffset; endOffset) (i.e. do not include endOffset)
	 */
	public static create(original:ILineTokens, startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineTokens {
		let inflatedTokens = original.sliceAndInflate(startOffset, endOffset, deltaStartIndex);
		return new ViewLineTokens(
			inflatedTokens,
			deltaStartIndex,
			endOffset - startOffset + deltaStartIndex
		);
	}
}

export class IdentityFilteredLineTokens {

	public static create(original:ILineTokens, textLength:number): ViewLineTokens {
		let inflatedTokens = original.inflate();
		return new ViewLineTokens(
			inflatedTokens,
			0,
			textLength
		);
	}
}
