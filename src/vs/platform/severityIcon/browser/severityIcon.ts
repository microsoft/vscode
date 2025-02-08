/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/severityIcon.css';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import Severity from '../../../base/common/severity.js';

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
