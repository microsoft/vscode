/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { registerThemingParticipant, ITheme, LIGHT } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';

const errorStart = encodeURIComponent(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.58318 2.02842C9.96435 2.16331 11.2561 2.77279 12.2383 3.75307C13.3643 4.87923 13.9978 6.40584 14 7.99829C14.0004 9.38617 13.5196 10.7313 12.6396 11.8045C11.7595 12.8778 10.5345 13.6127 9.17333 13.8841C7.81215 14.1556 6.39895 13.9467 5.1745 13.2931C3.95005 12.6394 2.99008 11.5815 2.45814 10.2995C1.92619 9.0175 1.85517 7.59072 2.25717 6.26222C2.65917 4.93373 3.50933 3.7857 4.66282 3.0137C5.8163 2.24171 7.20177 1.89351 8.58318 2.02842ZM8.68038 1.03316C10.292 1.19055 11.7993 1.90184 12.9453 3.04585C14.2587 4.35938 14.9976 6.14013 15 7.99764C15.0005 9.61695 14.4396 11.1864 13.4129 12.4385C12.3861 13.6907 10.9569 14.5482 9.36889 14.8648C7.78084 15.1815 6.13211 14.9378 4.70359 14.1752C3.27506 13.4127 2.1551 12.1784 1.53449 10.6828C0.913887 9.18708 0.831027 7.52251 1.30003 5.97259C1.76903 4.42268 2.76089 3.08331 4.10662 2.18265C5.45236 1.28199 7.06873 0.875761 8.68038 1.03316ZM5.52498 5L8.00004 7.47506L10.4751 5L11.1822 5.70711L8.70714 8.18217L11.1818 10.6569L10.4747 11.364L8.00004 8.88927L5.52535 11.364L4.81824 10.6569L7.29293 8.18217L4.81787 5.70711L5.52498 5Z" fill="`);
const errorEnd = encodeURIComponent(`"/></svg>`);
const errorDarkStart = encodeURIComponent(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.58318 2.02842C9.96435 2.16331 11.2561 2.77279 12.2383 3.75307C13.3643 4.87923 13.9978 6.40584 14 7.99829C14.0004 9.38617 13.5196 10.7313 12.6396 11.8045C11.7595 12.8778 10.5345 13.6127 9.17333 13.8841C7.81215 14.1556 6.39895 13.9467 5.1745 13.2931C3.95005 12.6394 2.99008 11.5815 2.45814 10.2995C1.92619 9.0175 1.85517 7.59072 2.25717 6.26222C2.65917 4.93373 3.50933 3.7857 4.66282 3.0137C5.8163 2.24171 7.20177 1.89351 8.58318 2.02842ZM8.68038 1.03316C10.292 1.19055 11.7993 1.90184 12.9453 3.04585C14.2587 4.35938 14.9976 6.14013 15 7.99764C15.0005 9.61695 14.4396 11.1864 13.4129 12.4385C12.3861 13.6907 10.9569 14.5482 9.36889 14.8648C7.78084 15.1815 6.13211 14.9378 4.70359 14.1752C3.27506 13.4127 2.1551 12.1784 1.53449 10.6828C0.913887 9.18708 0.831027 7.52251 1.30003 5.97259C1.76903 4.42268 2.76089 3.08331 4.10662 2.18265C5.45236 1.28199 7.06873 0.875761 8.68038 1.03316ZM5.52498 5L8.00004 7.47506L10.4751 5L11.1822 5.70711L8.70714 8.18217L11.1818 10.6569L10.4747 11.364L8.00004 8.88927L5.52535 11.364L4.81824 10.6569L7.29293 8.18217L4.81787 5.70711L5.52498 5Z" fill="`);
const errorDarkEnd = encodeURIComponent(`"/></svg>`);

const warningStart = encodeURIComponent(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.12 13.9725L15 12.5L9.37924 2H7.61921L1.99847 12.5L2.87849 13.9725H14.12ZM2.87849 12.9725L8.49922 2.47249L14.12 12.9725H2.87849ZM7.98949 6H8.98799V10H7.98949V6ZM7.98949 11H8.98799V12H7.98949V11Z" fill="`);
const warningEnd = encodeURIComponent(`"/></svg>`);
const warningDarkStart = encodeURIComponent(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.12 13.9725L15 12.5L9.37924 2H7.61921L1.99847 12.5L2.87849 13.9725H14.12ZM2.87849 12.9725L8.49922 2.47249L14.12 12.9725H2.87849ZM7.98949 6H8.98799V10H7.98949V6ZM7.98949 11H8.98799V12H7.98949V11Z" fill="`);
const warningDarkEnd = encodeURIComponent(`"/></svg>`);

const infoStart = encodeURIComponent(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8.5" cy="7.5" r="6" transform="rotate(-180 8.5 7.5)" stroke="#75BEFF"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 5L8 4L9 4L9 5L8 5ZM8 10L8 6L9 6L9 10L8 10Z" fill="`);
const infoEnd = encodeURIComponent(`"/></svg>`);
const infoDarkStart = encodeURIComponent(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8.5" cy="7.5" r="6" transform="rotate(-180 8.5 7.5)" stroke="#75BEFF"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 5L8 4L9 4L9 5L8 5ZM8 10L8 6L9 6L9 10L8 10Z" fill="`);
const infoDarkEnd = encodeURIComponent(`"/></svg>`);

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