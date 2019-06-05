/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { registerThemingParticipant, ITheme, LIGHT } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';

const errorStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" enable-background="new 0 0 16 16" height="16" width="16"><circle cx="8" cy="8" r="6" fill="#F6F6F6"/><path d="M8 3C5.238 3 3 5.238 3 8s2.238 5 5 5 5-2.238 5-5-2.238-5-5-5zm3 7l-1 1-2-2-2 2-1-1 2-2.027L5 6l1-1 2 2 2-2 1 1-2 1.973L11 10z" fill="`);
const errorEnd = encodeURIComponent(`"/><path fill="#fff" d="M11 6l-1-1-2 2-2-2-1 1 2 1.973L5 10l1 1 2-2 2 2 1-1-2-2.027z"/></svg>`);
const errorDarkStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" height="16" width="16"><circle cx="8" cy="8" r="6" fill="#1E1E1E"/><path d="M8 3C5.238 3 3 5.238 3 8s2.238 5 5 5 5-2.238 5-5-2.238-5-5-5zm3 7l-1 1-2-2-2 2-1-1 2-2.027L5 6l1-1 2 2 2-2 1 1-2 1.973L11 10z" fill="`);
const errorDarkEnd = encodeURIComponent(`"/><path fill="#252526" d="M11 6l-1-1-2 2-2-2-1 1 2 1.973L5 10l1 1 2-2 2 2 1-1-2-2.027z"/></svg>`);

const warningStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" enable-background="new 0 0 16 16" height="16" width="16"><path fill="#F6F6F6" d="M7.5 2L2 12l2 2h9l2-2L9.5 2z"/><path d="M9 3H8l-4.5 9 1 1h8l1-1L9 3zm0 9H8v-1h1v1zm0-2H8V6h1v4z" fill="`);
const warningEnd = encodeURIComponent(`"/><path d="M9 10H8V6h1v4zm0 1H8v1h1v-1z"/></svg>`);
const warningDarkStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" height="16" width="16"><path fill="#1E1E1E" d="M7.5 2L2 12l2 2h9l2-2L9.5 2z"/><path d="M9 3H8l-4.5 9 1 1h8l1-1L9 3zm0 9H8v-1h1v1zm0-2H8V6h1v4z" fill="`);
const warningDarkEnd = encodeURIComponent(`"/><path d="M9 10H8V6h1v4zm0 1H8v1h1v-1z"/></svg>`);

const infoStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" enable-background="new 0 0 16 16" height="16" width="16"><circle cx="8.5" cy="7.5" r="5.5" fill="#F6F6F6"/><path d="M8.5 3C6.015 3 4 5.015 4 7.5S6.015 12 8.5 12 13 9.985 13 7.5 10.985 3 8.5 3zm.5 8H8V6h1v5zm0-6H8V4h1v1z" fill="`);
const infoEnd = encodeURIComponent(`"/><path d="M8 6h1v5H8V6zm0-2v1h1V4H8z" fill="#fff"/></svg>`);
const infoDarkStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" enable-background="new 0 0 16 16" height="16" width="16"><circle cx="8.5" cy="7.5" r="5.5" fill="#1E1E1E"/><path d="M8.5 3C6.015 3 4 5.015 4 7.5S6.015 12 8.5 12 13 9.985 13 7.5 10.985 3 8.5 3zm.5 8H8V6h1v5zm0-6H8V4h1v1z" fill="`);
const infoDarkEnd = encodeURIComponent(`"/><path d="M8 6h1v5H8V6zm0-2v1h1V4H8z" fill="#252526"/></svg>`);

export namespace SeverityIcon {

	export function getSVGData(severity: Severity, theme: ITheme): string {
		switch (severity) {
			case Severity.Ignore:
				const ignoreColor = theme.type === LIGHT ? Color.fromHex('#1BA1E2') : Color.fromHex('#1BA1E2');
				return theme.type === LIGHT ? infoStart + encodeURIComponent(ignoreColor.toString()) + infoEnd
					: infoDarkStart + encodeURIComponent(ignoreColor.toString()) + infoDarkEnd;
			case Severity.Info:
				const infoColor = theme.type === LIGHT ? Color.fromHex('#1BA1E2') : Color.fromHex('#1BA1E2');
				return theme.type === LIGHT ? infoStart + encodeURIComponent(infoColor.toString()) + infoEnd
					: infoDarkStart + encodeURIComponent(infoColor.toString()) + infoDarkEnd;
			case Severity.Warning:
				const warningColor = theme.type === LIGHT ? Color.fromHex('#fc0') : Color.fromHex('#fc0');
				return theme.type === LIGHT ? warningStart + encodeURIComponent(warningColor.toString()) + warningEnd
					: warningDarkStart + encodeURIComponent(warningColor.toString()) + warningDarkEnd;
			case Severity.Error:
				const errorColor = theme.type === LIGHT ? Color.fromHex('#E51400') : Color.fromHex('#F48771');
				return theme.type === LIGHT ? errorStart + encodeURIComponent(errorColor.toString()) + errorEnd
					: errorDarkStart + encodeURIComponent(errorColor.toString()) + errorDarkEnd;
		}
		return '';
	}

	export function className(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-icon severity-ignore';
			case Severity.Info:
				return 'severity-icon severity-info';
			case Severity.Warning:
				return 'severity-icon severity-warning';
			case Severity.Error:
				return 'severity-icon severity-error';
		}
		return '';
	}
}

function getCSSRule(severity: Severity, theme: ITheme): string {
	return `.${SeverityIcon.className(severity).split(' ').join('.')} { background: url("data:image/svg+xml,${SeverityIcon.getSVGData(severity, theme)}") center center no-repeat; height: 16px; width: 16px; }`;
}

registerThemingParticipant((theme, collector) => {
	collector.addRule(getCSSRule(Severity.Error, theme));
	collector.addRule(getCSSRule(Severity.Warning, theme));
	collector.addRule(getCSSRule(Severity.Info, theme));
	collector.addRule(getCSSRule(Severity.Ignore, theme));
});