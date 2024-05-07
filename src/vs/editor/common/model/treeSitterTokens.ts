/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageIdCodec } from 'vs/editor/common/languages';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';

/**
 * Placeholder class, will be replaced with some real implementation.
 */
export class TreeSitterTokens extends Disposable {
	constructor(private readonly languageIdCoded: ILanguageIdCodec) {
		super();
	}
	public getLineTokens(lineNumber: number): LineTokens {
		// placeholder for now
		return LineTokens.createEmpty('', this.languageIdCoded);
	}

	public resetTokenization(fireTokenChangeEvent: boolean = true): void {
		// placeholder for now
	}

}
