/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { CommentRule } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';

export class CommentMode extends MockMode {
	private static _id = new LanguageIdentifier('commentMode', 3);

	constructor(commentsConfig: CommentRule) {
		super(CommentMode._id);
		this._register(LanguageConfigurationRegistry.register(this.getLanguageIdentifier(), {
			comments: commentsConfig
		}));
	}
}
