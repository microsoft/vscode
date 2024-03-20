/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { addDisposableListener } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';


class TerminalHighlightContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.highlight';

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalHighlightContribution | null {
		return instance.getContribution<TerminalHighlightContribution>(TerminalHighlightContribution.ID);
	}

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		const screenElement = xterm.raw.element!.querySelector('.xterm-screen')!;
		this._register(addDisposableListener(screenElement, 'mousemove', (e: MouseEvent) => {
			if ((e.target as any).tagName !== 'CANVAS') {
				return;
			}
			const rect = xterm.raw.element?.getBoundingClientRect();
			if (!rect) {
				return;
			}
			const mouseCursorY = Math.floor(e.offsetY / (rect.height / xterm.raw.rows));
			const command = this._instance.capabilities.get(TerminalCapability.CommandDetection)?.getCommandForLine(xterm.raw.buffer.active.viewportY + mouseCursorY);
			if (command && 'getOutput' in command) {
				xterm.markTracker.showCommandGuide(command);
			} else {
				xterm.markTracker.showCommandGuide(undefined);
			}
		}));
		this._register(addDisposableListener(screenElement, 'mouseout', () => xterm.markTracker.showCommandGuide(undefined)));
		this._register(xterm.raw.onData(() => xterm.markTracker.showCommandGuide(undefined)));
	}
}

registerTerminalContribution(TerminalHighlightContribution.ID, TerminalHighlightContribution, false);
