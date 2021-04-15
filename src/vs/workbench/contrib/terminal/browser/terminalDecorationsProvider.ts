/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IDecorationData, IDecorationsProvider } from 'vs/workbench/services/decorations/browser/decorations';
import { Event } from 'vs/base/common/event';
import { Codicon } from 'vs/base/common/codicons';
import { listErrorForeground, listInvalidItemForeground } from 'vs/platform/theme/common/colorRegistry';

export interface ITerminalDecorationData {
	tooltip: string,
	statusIcon: string,
	color: string
}

export class TerminalDecorationsProvider implements IDecorationsProvider {
	readonly label: string = localize('label', "Terminal");
	readonly onDidChange: Event<readonly URI[]>;

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		this.onDidChange = Event.None;
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		const instance = this._terminalService.getInstanceFromId(parseInt(resource.toString()));
		if (!instance) {
			return;
		}
		if (instance.statusList.primary && instance.statusList.primary.icon) {
			return {
				color: this.getColorForSeverity(instance.statusList.primary.severity),
				letter: this.getStatusIcon(instance.statusList.primary.icon),
				tooltip: localize(instance.statusList.primary.id, '{0}', instance.statusList.primary.id)
			};
		}
		return undefined;
	}

	getColorForSeverity(severity: Severity): string {
		switch (severity) {
			case Severity.Error:
				return listErrorForeground;
			case Severity.Warning:
				return listInvalidItemForeground;
			default:
				return '';
		}
	}

	getStatusIcon(icon: Codicon): string {
		switch (icon) {
			case Codicon.warning:
				return '⚠';
			case Codicon.bell:
				return '🔔';
			default:
				return '';
		}
	}

	dispose(): void {
		this.dispose();
	}
}
