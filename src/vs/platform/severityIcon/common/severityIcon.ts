/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { problemsErrorIconForeground, problemsInfoIconForeground, problemsWarningIconForeground } from 'vs/platform/theme/common/colorRegistry';

export namespace SeverityIcon {

	export function className(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-ignore codicon-info';
			case Severity.Info:
				return 'codicon-info';
			case Severity.Warning:
				return 'codicon-warning';
			case Severity.Error:
				return 'codicon-error';
		}
		return '';
	}
}

registerThemingParticipant((theme, collector) => {

	const errorIconForeground = theme.getColor(problemsErrorIconForeground);
	if (errorIconForeground) {
		collector.addRule(`
			.monaco-workbench .zone-widget .codicon-error,
			.monaco-workbench .markers-panel .marker-icon.codicon-error,
			.monaco-workbench .extensions-viewlet > .extensions .codicon-error {
				color: ${errorIconForeground};
			}
		`);
	}

	const warningIconForeground = theme.getColor(problemsWarningIconForeground);
	if (errorIconForeground) {
		collector.addRule(`
			.monaco-workbench .zone-widget .codicon-warning,
			.monaco-workbench .markers-panel .marker-icon.codicon-warning,
			.monaco-workbench .extensions-viewlet > .extensions .codicon-warning,
			.monaco-workbench .extension-editor .codicon-warning {
				color: ${warningIconForeground};
			}
		`);
	}

	const infoIconForeground = theme.getColor(problemsInfoIconForeground);
	if (errorIconForeground) {
		collector.addRule(`
			.monaco-workbench .zone-widget .codicon-info,
			.monaco-workbench .markers-panel .marker-icon.codicon-info,
			.monaco-workbench .extensions-viewlet > .extensions .codicon-info,
			.monaco-workbench .extension-editor .codicon-info {
				color: ${infoIconForeground};
			}
		`);
	}
});
