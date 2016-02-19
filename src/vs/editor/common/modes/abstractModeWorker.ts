/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import Modes = require('vs/editor/common/modes');

export abstract class AbstractModeWorker {

	public resourceService:IResourceService;
	public markerService: IMarkerService;

	private _mode:Modes.IMode;

	constructor(
		mode: Modes.IMode,
		participants: Modes.IWorkerParticipant[],
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService
	) {

		this._mode = mode;
		this.resourceService = resourceService;
		this.markerService = markerService;
	}

	_getMode():Modes.IMode {
		return this._mode;
	}

}

