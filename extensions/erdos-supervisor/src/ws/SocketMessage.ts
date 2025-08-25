/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export enum SocketMessageKind {
	Jupyter = 'jupyter',

	Kernel = 'kernel',
}

export interface SocketMessage {
	kind: SocketMessageKind;
}
