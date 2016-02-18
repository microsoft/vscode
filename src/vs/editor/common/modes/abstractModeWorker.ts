/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';
import Modes = require('vs/editor/common/modes');
import {TPromise} from 'vs/base/common/winjs.base';

export class AbstractModeWorker {

	private _participants:Modes.IWorkerParticipant[] = [];

	public resourceService:IResourceService;
	public markerService: IMarkerService;

	private _mode:Modes.IMode;

	_validationHelper: ValidationHelper;

	constructor(
		mode: Modes.IMode,
		participants: Modes.IWorkerParticipant[],
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService
	) {

		this._mode = mode;
		this._participants = participants;
		this.resourceService = resourceService;
		this.markerService = markerService;

		this._validationHelper = new ValidationHelper(
			this.resourceService,
			(toValidate) => this.doValidateOnChange(toValidate),
			(resource) => (resource.getMode().getId() === this._mode.getId()),
			500
		);
	}

	_getMode():Modes.IMode {
		return this._mode;
	}

	// ---- validation -----------------------------------------

	public enableValidator(): TPromise<void> {
		this._validationHelper.enable();
		return TPromise.as(null);
	}

	private doValidateOnChange(toValidate:URI[]): void {
		for (var i = 0; i < toValidate.length; i++) {
			this.doValidate(toValidate[i]);
		}
	}

	public doValidate(resource:URI): void {
		return null;
	}

	public configure(options:any): TPromise<boolean> {
		var p = this._doConfigure(options);
		if (p) {
			return p.then(shouldRevalidate => {
				if (shouldRevalidate) {
					this._validationHelper.triggerDueToConfigurationChange();
				}
				return true;
			});
		}
	}

	/**
	 * @return true if you want to revalidate your models
	 */
	_doConfigure(options:any): TPromise<boolean> {
		return TPromise.as(true);
	}
}

