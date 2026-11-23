/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IUserActivityEvent, IUserActivitySource, IUserActivityTarget } from '../../../services/userActivity/common/userActivityCapture.js';
import { headAndTail } from '../../../services/userActivity/browser/userActivityCaptureHelpers.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';

/** The most of a command's output a terminal event carries: its start and its end. */
const MAX_OUTPUT = 1500;

/**
 * Terminals for the user activity capture: commands that finish in a terminal the user sees,
 * with their exit code and output.
 */
export class TerminalUserActivitySource extends Disposable implements IUserActivitySource {

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
	) {
		super();
	}

	start(record: (event: IUserActivityEvent) => void): void {
		const finished = this._register(this.terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, c => c.onCommandFinished));
		this._register(finished.event(({ instance, data: command }) => {
			if (command.wasReplayed || instance.shellLaunchConfig.hideFromUser || !command.command.trim()) {
				return;
			}
			const output = command.getOutput()?.trim();
			record({
				kind: 'terminal',
				time: Date.now(),
				target: { area: 'terminal', uri: instance.resource, title: instance.title },
				text: command.command,
				...(output ? { context: headAndTail(output, MAX_OUTPUT) } : {}),
				detail: {
					...(command.exitCode !== undefined ? { exitCode: command.exitCode } : {}),
					...(command.cwd ? { cwd: command.cwd } : {}),
				},
			});
		}));
	}

	describeResource(resource: URI): Partial<IUserActivityTarget> | undefined {
		if (resource.scheme !== Schemas.vscodeTerminal) {
			return undefined;
		}
		const instance = this.terminalService.getInstanceFromResource(resource);
		return instance ? { area: 'terminal', title: instance.title } : undefined;
	}
}
