/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import cssWorker = require('vs/languages/css/common/cssWorker');
import cssIntellisense = require('vs/languages/css/common/services/intelliSense');
import cssParser = require('vs/languages/css/common/parser/cssParser');
import lessParser = require('./parser/lessParser');
import lessIntellisense = require('./services/intelliSense');

export class LessWorker extends cssWorker.CSSWorker {

	public createIntellisense(): cssIntellisense.CSSIntellisense {
		return new lessIntellisense.LESSIntellisense();
	}

	public createParser(): cssParser.Parser {
		return new lessParser.LessParser();
	}

}
