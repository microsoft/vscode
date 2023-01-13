/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/severityIcon';
import { CSSIcon, Codicon } from 'vs/base/common/codicons';
import Severity from 'vs/base/common/severity';

export namespace SeverityIcon {

	export function className(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-ignore ' + CSSIcon.asClassName(Codicon.info);
			case Severity.Info:
				return CSSIcon.asClassName(Codicon.info);
			case Severity.Warning:
				return CSSIcon.asClassName(Codicon.warning);
			case Severity.Error:
				return CSSIcon.asClassName(Codicon.error);
			default:
				return '';
		}
	}
}
