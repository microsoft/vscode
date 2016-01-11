/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';
import * as cssWorker from 'vs/languages/css/common/cssWorker';
import * as cssIntellisense from 'vs/languages/css/common/services/intelliSense';
import * as cssParser from 'vs/languages/css/common/parser/cssParser';
import * as lessParser from './parser/lessParser';
import * as lessIntellisense from './services/intelliSense';

export class LessWorker extends cssWorker.CSSWorker {

	public createIntellisense(): cssIntellisense.CSSIntellisense {
		return new lessIntellisense.LESSIntellisense();
	}

	public createParser(): cssParser.Parser {
		return new lessParser.LessParser();
	}

}
