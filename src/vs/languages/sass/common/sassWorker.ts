/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import cssWorker = require('vs/languages/css/common/cssWorker');
import cssParser = require('vs/languages/css/common/parser/cssParser');
import sassParser = require('./parser/sassParser');
import sassIntellisense = require('./services/intelliSense');

export class SassWorker extends cssWorker.CSSWorker {

	public createIntellisense(): sassIntellisense.SASSIntellisense {
		return new sassIntellisense.SASSIntellisense();
	}

	public createParser(): cssParser.Parser {
		return new sassParser.SassParser();
	}

}
