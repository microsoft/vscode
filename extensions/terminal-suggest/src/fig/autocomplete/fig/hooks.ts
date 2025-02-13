/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Types from '../../api-bindings/types';
import type { AliasMap } from '../../shell-parser';

export type FigState = {
	buffer: string;
	cursorLocation: number;
	cwd: string | null;
	processUserIsIn: string | null;
	sshContextString: string | null;
	aliases: AliasMap;
	environmentVariables: Record<string, string>;
	shellContext?: Types.ShellContext | undefined;
};
