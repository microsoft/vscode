/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';
import * as cssWorker from 'vs/languages/css/common/cssWorker';
import * as cssParser from 'vs/languages/css/common/parser/cssParser';
import * as sassParser from './parser/sassParser';
import * as sassIntellisense from './services/intelliSense';

export class SassWorker extends cssWorker.CSSWorker {

	public createIntellisense(): sassIntellisense.SASSIntellisense {
		return new sassIntellisense.SASSIntellisense();
	}

	public createParser(): cssParser.Parser {
		return new sassParser.SassParser();
	}

}
