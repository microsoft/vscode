/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import Severity from 'vs/base/common/severity';
import { problemsErrorIconForeground, problemsInfoIconForeground, problemsWarningIconForeground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

export namespace SeverityIcon {

	export function className(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-ignore ' + Codicon.info.classNames;
			case Severity.Info:
				return Codicon.info.classNames;
			case Severity.Warning:
				return Codicon.warning.classNames;
			case Severity.Error:
				return Codicon.error.classNames;
			default:
				return '';
		}
	}
}

registerThemingParticipant((theme, collector) => {

	const errorIconForeground = theme.getColor(problemsErrorIconForeground);
	if (errorIconForeground) {
		const errorCodiconSelector = Codicon.error.cssSelector;
		collector.addRule(`
			.monaco-editor .zone-widget ${errorCodiconSelector},
			.markers-panel .marker-icon${errorCodiconSelector},
			.text-search-provider-messages .providerMessage ${errorCodiconSelector},
			.extensions-viewlet > .extensions ${errorCodiconSelector} {
				color: ${errorIconForeground};
			}
		`);
	}

	const warningIconForeground = theme.getColor(problemsWarningIconForeground);
	if (warningIconForeground) {
		const warningCodiconSelector = Codicon.warning.cssSelector;
		collector.addRule(`
			.monaco-editor .zone-widget ${warningCodiconSelector},
			.markers-panel .marker-icon${warningCodiconSelector},
			.extensions-viewlet > .extensions ${warningCodiconSelector},
			.extension-editor ${warningCodiconSelector},
			.text-search-provider-messages .providerMessage ${warningCodiconSelector},
			.preferences-editor ${warningCodiconSelector} {
				color: ${warningIconForeground};
			}
		`);
	}

	const infoIconForeground = theme.getColor(problemsInfoIconForeground);
	if (infoIconForeground) {
		const infoCodiconSelector = Codicon.info.cssSelector;
		collector.addRule(`
			.monaco-editor .zone-widget ${infoCodiconSelector},
			.markers-panel .marker-icon${infoCodiconSelector},
			.extensions-viewlet > .extensions ${infoCodiconSelector},
			.text-search-provider-messages .providerMessage ${infoCodiconSelector},
			.extension-editor ${infoCodiconSelector} {
				color: ${infoIconForeground};
			}
		`);
	}
});
