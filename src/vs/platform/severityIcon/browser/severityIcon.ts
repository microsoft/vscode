/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/severityIcon';
import { Codicon } from 'vs/base/common/codicons';
import Severity from 'vs/base/common/severity';

export namespace SeverityIcon {

	export function className(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-ignore ' + Codicon.classNames(Codicon.info);
			case Severity.Info:
				return Codicon.classNames(Codicon.info);
			case Severity.Warning:
				return Codicon.classNames(Codicon.warning);
			case Severity.Error:
				return Codicon.classNames(Codicon.error);
			default:
				return '';
		}
	}
}
