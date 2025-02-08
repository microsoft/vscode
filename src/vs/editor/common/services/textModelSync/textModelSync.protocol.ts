/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelChangedEvent } from '../../model/mirrorTextModel.js';

export interface IWorkerTextModelSyncChannelServer {
	$acceptNewModel(data: IRawModelData): void;

	$acceptModelChanged(strURL: string, e: IModelChangedEvent): void;

	$acceptRemovedModel(strURL: string): void;
}

export interface IRawModelData {
	url: string;
	versionId: number;
	lines: string[];
	EOL: string;
}
