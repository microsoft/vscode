/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IDecorationData, IDecorationsProvider } from 'vs/workbench/services/decorations/browser/decorations';
import { Event, Emitter } from 'vs/base/common/event';
import { Codicon } from 'vs/base/common/codicons';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { TERMINAL_DECORATIONS_SCHEME } from 'vs/workbench/contrib/terminal/common/terminal';

export interface ITerminalDecorationData {
	tooltip: string,
	statusIcon: string,
	color: string
}

export class TerminalDecorationsProvider implements IDecorationsProvider {
	readonly label: string = localize('label', "Terminal");
	private readonly _onDidChange = new Emitter<URI[]>();

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
	}

	get onDidChange(): Event<URI[]> {
		return this._onDidChange.event;
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		if (resource.scheme !== TERMINAL_DECORATIONS_SCHEME || !parseInt(resource.path)) {
			return;
		}

		const instance = this._terminalService.getInstanceFromId(parseInt(resource.path));
		if (!instance?.statusList?.primary?.icon) {
			return;
		}

		return {
			color: this.getColorForSeverity(instance.statusList.primary.severity),
			letter: this.getStatusIcon(instance.statusList.primary.icon, instance.statusList.statuses.length),
			// Commenting out this line to unblock build
			// tooltip: localize(instance.statusList.primary.id, '{0}', instance.statusList.primary.id)
		};
	}

	getColorForSeverity(severity: Severity): string {
		switch (severity) {
			case Severity.Error:
				return listErrorForeground;
			case Severity.Warning:
				return listWarningForeground;
			default:
				return '';
		}
	}

	getStatusIcon(icon: Codicon, statusCount: number): string {
		let statusIcon;
		switch (icon) {
			case Codicon.warning:
				statusIcon = '⚠';
				break;
			case Codicon.bell:
				statusIcon = 'B';
				break;
			case Codicon.debugDisconnect:
				statusIcon = 'D';
				break;
			default:
				statusIcon = '';
				break;
		}
		return statusCount > 1 ? `${statusCount}, ${statusIcon}` : statusIcon;
	}

	dispose(): void {
		this.dispose();
	}
}
