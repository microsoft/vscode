/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ISurveyService } from '../../../platform/survey/common/surveyService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

export const SURVEY_SIGNAL_USAGE_ID = 'github.copilot.survey.signalUsage';

export class SurveyCommandContribution extends Disposable {
	constructor(@ISurveyService private readonly _surveyService: ISurveyService) {
		super();
		this._register(vscode.commands.registerCommand(SURVEY_SIGNAL_USAGE_ID, (source: string, languageId?: string) => {
			this._surveyService.signalUsage(source, languageId);
		}));
	}
}
