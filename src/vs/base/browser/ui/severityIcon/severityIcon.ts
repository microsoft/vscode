/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/severityIcon';
import { Disposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import * as DOM from 'vs/base/browser/dom';

export class SeverityIcon extends Disposable {

	readonly element: HTMLElement;

	constructor() {
		super();
		this.element = DOM.$('');
	}

	set severity(severity: Severity | undefined) {
		this.element.className = '';
		if (severity !== undefined) {
			this.element.className = this.iconClassNameFor(severity);
		}
	}

	private iconClassNameFor(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-icon info';
			case Severity.Info:
				return 'severity-icon info';
			case Severity.Warning:
				return 'severity-icon warning';
			case Severity.Error:
				return 'severity-icon error';
		}
		return '';
	}

}