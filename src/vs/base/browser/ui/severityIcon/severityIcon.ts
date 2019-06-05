/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import * as DOM from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';

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

	style({ color }: {
		color?: Color | null
	}): void {
		this.element.style.color = color ? color.toString() : '';
	}

	private iconClassNameFor(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'severity-icon octicon octicon-info';
			case Severity.Info:
				return 'severity-icon octicon octicon-info';
			case Severity.Warning:
				return 'severity-icon octicon octicon-warning';
			case Severity.Error:
				return 'severity-icon octicon octicon-error';
		}
		return '';
	}

}