/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export enum SocketMessageKind {
	Jupyter = 'jupyter',

	Kernel = 'kernel',
}

export interface SocketMessage {
	kind: SocketMessageKind;
}
