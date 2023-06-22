/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInternalXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

registerTerminalAction({
	id: TerminalCommandId.ShowTextureAtlas,
	title: { value: localize('workbench.action.terminal.showTextureAtlas', "Show Terminal Texture Atlas"), original: 'Show Terminal Texture Atlas' },
	category: Categories.Developer,
	precondition: ContextKeyExpr.or(TerminalContextKeys.isOpen),
	run: async (c, accessor) => {
		const fileService = accessor.get(IFileService);
		const openerService = accessor.get(IOpenerService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const bitmap = await c.service.activeInstance?.xterm?.textureAtlas;
		if (!bitmap) {
			return;
		}
		const cwdUri = workspaceContextService.getWorkspace().folders[0].uri;
		const fileUri = URI.joinPath(cwdUri, 'textureAtlas.png');
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext('bitmaprenderer');
		if (!ctx) {
			return;
		}
		ctx.transferFromImageBitmap(bitmap);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res));
		if (!blob) {
			return;
		}
		await fileService.writeFile(fileUri, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
		openerService.open(fileUri);
	}
});

registerTerminalAction({
	id: TerminalCommandId.WriteDataToTerminal,
	title: { value: localize('workbench.action.terminal.writeDataToTerminal', "Write Data to Terminal"), original: 'Write Data to Terminal' },
	category: Categories.Developer,
	run: async (c, accessor) => {
		const quickInputService = accessor.get(IQuickInputService);
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		await instance.processReady;
		if (!instance.xterm) {
			throw new Error('Cannot write data to terminal if xterm isn\'t initialized');
		}
		const data = await quickInputService.input({
			value: '',
			placeHolder: 'Enter data, use \\x to escape',
			prompt: localize('workbench.action.terminal.writeDataToTerminal.prompt', "Enter data to write directly to the terminal, bypassing the pty"),
		});
		if (!data) {
			return;
		}
		let escapedData = data
			.replace(/\\n/g, '\n')
			.replace(/\\r/g, '\r');
		while (true) {
			const match = escapedData.match(/\\x([0-9a-fA-F]{2})/);
			if (match === null || match.index === undefined || match.length < 2) {
				break;
			}
			escapedData = escapedData.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + escapedData.slice(match.index + 4);
		}
		const xterm = instance.xterm as any as IInternalXtermTerminal;
		xterm._writeText(escapedData);
	}
});


registerTerminalAction({
	id: TerminalCommandId.RestartPtyHost,
	title: { value: localize('workbench.action.terminal.restartPtyHost', "Restart Pty Host"), original: 'Restart Pty Host' },
	category: Categories.Developer,
	run: async (c, accessor) => {
		const logService = accessor.get(ITerminalLogService);
		const backends = Array.from(c.instanceService.getRegisteredBackends());
		const unresponsiveBackends = backends.filter(e => !e.isResponsive);
		// Restart only unresponsive backends if there are any
		const restartCandidates = unresponsiveBackends.length > 0 ? unresponsiveBackends : backends;
		for (const backend of restartCandidates) {
			logService.warn(`Restarting pty host for authority "${backend.remoteAuthority}"`);
			backend.restartPtyHost();
		}
	}
});
