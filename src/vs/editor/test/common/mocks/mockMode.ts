/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Disposable } from 'vs/base/common/lifecycle';
import { IMode, LanguageIdentifier } from 'vs/editor/common/modes';

export class MockMode extends Disposable implements IMode {
	private _languageIdentifier: LanguageIdentifier;

	constructor(languageIdentifier: LanguageIdentifier) {
		super();
		this._languageIdentifier = languageIdentifier;
	}

	public getId(): string {
		return this._languageIdentifier.language;
	}

	public getLanguageIdentifier(): LanguageIdentifier {
		return this._languageIdentifier;
	}
}
