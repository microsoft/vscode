/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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
