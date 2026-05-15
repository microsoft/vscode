/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DebugConfiguration } from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';

export const enum StartResultKind {
	NoConfig,
	Ok,
	NeedExtension,
	Cancelled,
}

export interface INoConfigStartResult {
	kind: StartResultKind.NoConfig;
	text: string;
}

export interface INeedExtension {
	kind: StartResultKind.NeedExtension;
	debugType: string;
}

export interface IStartResultOk {
	kind: StartResultKind.Ok;
	folder: URI | undefined;
	config: DebugConfiguration;
}

export interface IStartCancelled {
	kind: StartResultKind.Cancelled;
}

export type StartResult = INoConfigStartResult | IStartResultOk | INeedExtension | IStartCancelled;

export interface IStartOptions {
	cwd: string;
	args: readonly string[];
	forceNew: boolean;
	printOnly: boolean;
	save: boolean;
	once: boolean;
}
