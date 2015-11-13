/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import strings = require('vs/base/common/strings');

enum Severity {
	Ignore = 0,
	Info = 1,
	Warning = 2,
	Error = 3
}

namespace Severity {

	var _error = 'error',
		_warning = 'warning',
		_warn = 'warn',
		_info = 'info';

	var _displayStrings: { [value: number]: string; } = Object.create(null);
	_displayStrings[Severity.Error] = nls.localize('sev.error', "Error");
	_displayStrings[Severity.Warning] = nls.localize('sev.warning', "Warning");
	_displayStrings[Severity.Info] = nls.localize('sev.info', "Info");

	/**
	 * Parses 'error', 'warning', 'warn', 'info' in call casings
	 * and falls back to ignore.
	 */
	export function fromValue(value: string): Severity {
		if (!value) {
			return Severity.Ignore;
		}

		if (strings.equalsIgnoreCase(_error, value)) {
			return Severity.Error;
		}

		if (strings.equalsIgnoreCase(_warning, value) || strings.equalsIgnoreCase(_warn, value)) {
			return Severity.Warning;
		}

		if (strings.equalsIgnoreCase(_info, value)) {
			return Severity.Info;
		}

		return Severity.Ignore;
	}

	export function toString(value: Severity): string {
		return _displayStrings[value] || strings.empty;
	}

	export function compare(a: Severity, b: Severity): number {
		return b - a;
	}
}

export default Severity;