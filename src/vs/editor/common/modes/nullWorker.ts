/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import Modes = require('vs/editor/common/modes');

export class NullWorker {

	constructor(
		modeId: string,
		participants: Modes.IWorkerParticipant[],
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService
	) {

		// console.log('null worker created');

	}
}
