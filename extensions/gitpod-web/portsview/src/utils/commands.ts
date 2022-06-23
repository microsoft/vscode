/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import nlsFile from '../../public/package.nls.json';
import type { GitpodPortObject, PortCommand } from '../protocol/gitpod';

// TODO: use vscode-nls
export function getNLSTitle(command: PortCommand) {
	let name: string = command;
	switch (name) {
		case 'preview':
			name = 'openPreview';
	}
	return nlsFile[name] ?? command as string;
}

export const commandIconMap: Record<PortCommand, string> = {
	tunnelNetwork: 'eye',
	tunnelHost: 'eye-closed',
	makePublic: 'lock',
	makePrivate: 'unlock',
	preview: 'open-preview',
	openBrowser: 'globe',
	retryAutoExpose: 'refresh',
	urlCopy: 'copy',
	queryPortData: '',
};

export function getCommands(port: GitpodPortObject): PortCommand[] {
	return getSplitCommands(port).filter(e => e != null);
}

export function getSplitCommands(port: GitpodPortObject) {
	const opts: Array<null | PortCommand> = [];
	const viewItem = port.info.contextValue;
	if (viewItem.includes('host') && viewItem.includes('tunneled')) {
		opts.push('tunnelNetwork');
	}
	if (viewItem.includes('network') && viewItem.includes('tunneled')) {
		opts.push('tunnelHost');
	}
	// eslint-disable-next-line code-no-unused-expressions
	opts.length > 0 && opts.push(null);
	if (viewItem.includes('private')) {
		opts.push('makePublic');
	}
	if (viewItem.includes('public')) {
		opts.push('makePrivate');
	}
	if (viewItem.includes('exposed') || viewItem.includes('tunneled')) {
		opts.push('preview');
		opts.push('openBrowser');
	}
	if (viewItem.includes('failed')) {
		// eslint-disable-next-line code-no-unused-expressions
		opts.length > 0 && opts.push(null);
		opts.push('retryAutoExpose');
	}
	return opts;
}
