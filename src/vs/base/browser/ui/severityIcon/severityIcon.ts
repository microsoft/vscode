/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/severityIcon.css';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import Severity from '../../../common/severity.js';

export namespace SeverityIcon {

	export function className(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-ignore ' + ThemeIcon.asClassName(Codicon.info);
			case Severity.Info:
				return ThemeIcon.asClassName(Codicon.info);
			case Severity.Warning:
				return ThemeIcon.asClassName(Codicon.warning);
			case Severity.Error:
				return ThemeIcon.asClassName(Codicon.error);
			default:
				return '';
		}
	}
}
