/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

export interface ITerminalDecorationData {
	tooltip: string,
	statusIcon: string,
	color: string
}

export class TerminalDecorationsProvider {
	readonly label: string = localize('label', "Terminal");
	private readonly toDispose = new DisposableStore();

	provideDecorations(instance: ITerminalInstance): ITerminalDecorationData | undefined {
		if (instance.statusList.primary && instance.statusList.primary.icon) {
			return {
				tooltip: localize(instance.statusList.primary.id, '{0}', instance.statusList.primary.id),
				statusIcon: `${instance.statusList.primary.icon.id}`,
				color: this.getColorForSeverity(instance.statusList.primary.severity),
			};
		}
		return undefined;
	}

	getColorForSeverity(severity: Severity): string {
		switch (severity) {
			case Severity.Error:
				return 'red';
			case Severity.Warning:
				return 'yellow';
			case Severity.Info:
				return 'green';
			default:
				return '';
		}
	}

	dispose(): void {
		this.toDispose.dispose();
	}
}
