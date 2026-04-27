/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as util from 'util';
import { SimpleRPC } from '../node/copilotDebugWorker/rpc';

export class CopilotDebugCommandHandle {
	public static COPILOT_LABEL = 'Copilot';

	public get ended() {
		return this.rpc.ended;
	}

	constructor(private readonly rpc: SimpleRPC) { }

	output(category: string, output: string): Promise<void> {
		return this.rpc.callMethod('output', { category, output });
	}

	exit(code: number, error?: string): Promise<void> {
		return this.rpc.callMethod('exit', { code, error });
	}

	question(message: string, defaultValue?: string, singleKey = false): Promise<string | undefined> {
		return this.rpc.callMethod('question', { message: withLabel('blue', CopilotDebugCommandHandle.COPILOT_LABEL, message), defaultValue, singleKey });
	}

	confirm(message: string, defaultValue?: boolean): Promise<boolean | undefined> {
		return this.rpc.callMethod('confirm', { message: withLabel('blue', CopilotDebugCommandHandle.COPILOT_LABEL, message), defaultValue });
	}

	printLabel(color: KnownColors, message: string): Promise<void> {
		return this.output('stdout', withLabel(color, CopilotDebugCommandHandle.COPILOT_LABEL, message) + '\r\n');
	}

	printJson(data: any): Promise<void> {
		return this.output('stdout', (util.inspect(data, { colors: true }) + '\n').replaceAll('\n', '\r\n'));
	}

	getFollowupKeys(padStart: number): Promise<'Enter' | 'Q' | 'R' | 'V' | 'S'> {
		const keys = ['enter', 'r', 's', 'v', 'q'].map(p => `${Style.Reset}${Style.Bold}${p}${Style.Reset}${Style.Dim}`);
		const loc = l10n.t('press {0} to re-run, {1} to regenerate, {2} to save config, {3} to view it, {4} to quit', ...keys);
		const str = ' '.repeat(padStart) + Style.Dim + loc + Style.Reset + '\r\n';
		return this.rpc.callMethod('question', { message: str, singleKey: true });
	}
}

type KnownColors = 'red' | 'green' | 'blue' | 'cyan';

const enum Style {
	Red = '\x1b[31m',
	Green = '\x1b[32m',
	Blue = '\x1b[34m',
	Cyan = '\x1b[36m',
	Reset = '\x1b[0m',
	Bold = '\x1b[1m',
	Inverse = '\x1b[7m',
	Dim = '\x1b[2m',
}

// we know the user is running the program in a VS Code terminal, so we don't need
// to do the color support detection that we would normally need to handle.

function withLabel(color: KnownColors, label: string, message: string) {
	const colorCode = (color: KnownColors) => {
		switch (color) {
			case 'red':
				return Style.Red;
			case 'green':
				return Style.Green;
			case 'blue':
				return Style.Blue;
			case 'cyan':
				return Style.Cyan;
			default:
				return '';
		}
	};

	return `${Style.Bold}${Style.Inverse}${colorCode(color)} ${label} ${Style.Reset} ${colorCode(color)}${message}${Style.Reset}`;
}
