/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommentRule } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { MockMode } from 'vs/editor/test/common/mocks/mockMode';

export class CommentMode extends MockMode {
	public static readonly id = 'commentMode';

	constructor(commentsConfig: CommentRule) {
		super(CommentMode.id);
		this._register(LanguageConfigurationRegistry.register(this.languageId, {
			comments: commentsConfig
		}));
	}
}
