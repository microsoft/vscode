/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerColor, editorInfoForeground, editorWarningForeground, editorErrorForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { chartsGreen, chartsPurple } from '../../../../platform/theme/common/colors/chartsColors.js';

/*
 * Markdown alert colors for GitHub-style alert syntax.
 */

export const markdownAlertNoteColor = registerColor('markdownAlert.noteBorder',
	editorInfoForeground,
	localize('markdownAlertNoteBorder', "Border color for note alerts in markdown."));

export const markdownAlertTipColor = registerColor('markdownAlert.tipBorder',
	chartsGreen,
	localize('markdownAlertTipBorder', "Border color for tip alerts in markdown."));

export const markdownAlertImportantColor = registerColor('markdownAlert.importantBorder',
	chartsPurple,
	localize('markdownAlertImportantBorder', "Border color for important alerts in markdown."));

export const markdownAlertWarningColor = registerColor('markdownAlert.warningBorder',
	editorWarningForeground,
	localize('markdownAlertWarningBorder', "Border color for warning alerts in markdown."));

export const markdownAlertCautionColor = registerColor('markdownAlert.cautionBorder',
	editorErrorForeground,
	localize('markdownAlertCautionBorder', "Border color for caution alerts in markdown."));
