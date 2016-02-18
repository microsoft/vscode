/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {TPromise} from 'vs/base/common/winjs.base';

export class AbstractModeWorker {

	private _participants:Modes.IWorkerParticipant[] = [];

	public resourceService:IResourceService;
	public markerService: IMarkerService;

	private _mode:Modes.IMode;

	_validationHelper: ValidationHelper;

	constructor(mode: Modes.IMode, participants: Modes.IWorkerParticipant[], @IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService) {

		this._mode = mode;
		this._participants = participants;
		this.resourceService = resourceService;
		this.markerService = markerService;

		this._validationHelper = new ValidationHelper(
			this.resourceService,
			(changed, notChanged, dueToConfigurationChange) => this._newValidate(changed, notChanged, dueToConfigurationChange),
			(resource) => this._shouldIncludeModelInValidation(resource),
			500
		);
	}

	_getMode():Modes.IMode {
		return this._mode;
	}

	_getWorkerParticipants<T extends Modes.IWorkerParticipant>(select:(p:Modes.IWorkerParticipant)=>boolean):T[] {
		return <T[]> this._participants.filter(select);
	}

	// ---- validation -----------------------------------------

	_shouldIncludeModelInValidation(resource:EditorCommon.IMirrorModel): boolean {
		return resource.getMode().getId() === this._mode.getId();
	}

	public enableValidator(): TPromise<void> {
		this._validationHelper.enable();
		return TPromise.as(null);
	}

	private _newValidate(changed:URI[], notChanged:URI[], dueToConfigurationChange:boolean): void {
		this.doValidateOnChange(changed, notChanged, dueToConfigurationChange);
	}

	public _getContextForValidationParticipants(resource:URI):any {
		return null;
	}

	public doValidateOnChange(changed:URI[], notChanged:URI[], dueToConfigurationChange:boolean): void {
		if (dueToConfigurationChange) {
			for (var i = 0; i < changed.length; i++) {
				this.doValidate(changed[i]);
			}
			for (var i = 0; i < notChanged.length; i++) {
				this.doValidate(notChanged[i]);
			}
		} else {
			for (var i = 0; i < changed.length; i++) {
				this.doValidate(changed[i]);
			}
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

