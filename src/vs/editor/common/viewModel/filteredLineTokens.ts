/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ILineTokens} from 'vs/editor/common/editorCommon';
import * as TokensBinaryEncoding from 'vs/editor/common/model/tokensBinaryEncoding';
import {ViewLineTokens} from 'vs/editor/common/viewModel/viewModel';

export class FilteredLineTokens {
	/**
	 * [startOffset; endOffset) (i.e. do not include endOffset)
	 */
	public static create(original:ILineTokens, startOffset:number, endOffset:number, deltaStartIndex:number): ViewLineTokens {
		let inflatedTokens = TokensBinaryEncoding.sliceAndInflate(original.getBinaryEncodedTokensMap(), original.getBinaryEncodedTokens(), startOffset, endOffset, deltaStartIndex);
		return new ViewLineTokens(
			inflatedTokens,
			deltaStartIndex,
			endOffset - startOffset + deltaStartIndex
		);
	}
}

export class IdentityFilteredLineTokens {

	public static create(original:ILineTokens, textLength:number): ViewLineTokens {
		let inflatedTokens = TokensBinaryEncoding.inflateArr(original.getBinaryEncodedTokensMap(), original.getBinaryEncodedTokens());
		return new ViewLineTokens(
			inflatedTokens,
			0,
			textLength
		);
	}
}
