/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {AsyncDescriptor1, createAsyncDescriptor1} from 'vs/platform/instantiation/common/descriptors';
import {IInstantiationService, optional} from 'vs/platform/instantiation/common/instantiation';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import * as modes from 'vs/editor/common/modes';
import {TextualSuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import * as wordHelper from 'vs/editor/common/model/wordHelper';
import {ICompatWorkerService, ICompatMode} from 'vs/editor/common/services/compatWorkerService';
import {CharCode} from 'vs/base/common/charCode';

export function createWordRegExp(allowInWords:string = ''): RegExp {
	return wordHelper.createWordRegExp(allowInWords);
}

export class ModeWorkerManager<W> {

	private _descriptor: modes.IModeDescriptor;
	private _workerDescriptor: AsyncDescriptor1<string, W>;
	private _superWorkerModuleId: string;
	private _instantiationService: IInstantiationService;
	private _workerPiecePromise:TPromise<W>;

	constructor(
		descriptor:modes.IModeDescriptor,
		workerModuleId:string,
		workerClassName:string,
		superWorkerModuleId:string,
		instantiationService: IInstantiationService
	) {
		this._descriptor = descriptor;
		this._workerDescriptor = createAsyncDescriptor1(workerModuleId, workerClassName);
		this._superWorkerModuleId = superWorkerModuleId;
		this._instantiationService = instantiationService;
		this._workerPiecePromise = null;
	}

	public worker<T>(runner:(worker:W)=>TPromise<T>): TPromise<T>
	public worker<T>(runner:(worker:W)=>T): TPromise<T> {
		return this._getOrCreateWorker().then(runner);
	}

	private _getOrCreateWorker(): TPromise<W> {
		if (!this._workerPiecePromise) {
			// TODO@Alex: workaround for missing `bundles` config

			// First, load the code of the worker super class
			let superWorkerCodePromise = (this._superWorkerModuleId ? ModeWorkerManager._loadModule(this._superWorkerModuleId) : TPromise.as(null));

			this._workerPiecePromise = superWorkerCodePromise.then(() => {
				// Second, load the code of the worker (without instantiating it)
				return ModeWorkerManager._loadModule(this._workerDescriptor.moduleName);
			}).then(() => {
				// Finally, create the mode worker instance
				return this._instantiationService.createInstance<string, W>(this._workerDescriptor, this._descriptor.id);
			});
		}

		return this._workerPiecePromise;
	}

	private static _loadModule(moduleName:string): TPromise<any> {
		return new TPromise((c, e, p) => {
			// Use the global require to be sure to get the global config
			(<any>self).require([moduleName], c, e);
		}, () => {
			// Cannot cancel loading code
		});
	}
}

export abstract class AbstractMode implements modes.IMode {

	private _modeId: string;

	constructor(modeId:string) {
		this._modeId = modeId;
	}

	public getId(): string {
		return this._modeId;
	}
}

export abstract class CompatMode extends AbstractMode implements ICompatMode {

	public compatWorkerService:ICompatWorkerService;

	constructor(modeId:string, compatWorkerService:ICompatWorkerService) {
		super(modeId);
		this.compatWorkerService = compatWorkerService;

		if (this.compatWorkerService) {
			this.compatWorkerService.registerCompatMode(this);
		}
	}

}

export function isDigit(character:string, base:number): boolean {
	let c = character.charCodeAt(0);
	switch (base) {
		case 1:
			return c === CharCode.Digit0;
		case 2:
			return c >= CharCode.Digit0 && c <= CharCode.Digit1;
		case 3:
			return c >= CharCode.Digit0 && c <= CharCode.Digit2;
		case 4:
			return c >= CharCode.Digit0 && c <= CharCode.Digit3;
		case 5:
			return c >= CharCode.Digit0 && c <= CharCode.Digit4;
		case 6:
			return c >= CharCode.Digit0 && c <= CharCode.Digit5;
		case 7:
			return c >= CharCode.Digit0 && c <= CharCode.Digit6;
		case 8:
			return c >= CharCode.Digit0 && c <= CharCode.Digit7;
		case 9:
			return c >= CharCode.Digit0 && c <= CharCode.Digit8;
		case 10:
			return c >= CharCode.Digit0 && c <= CharCode.Digit9;
		case 11:
			return (c >= CharCode.Digit0 && c <= CharCode.Digit9) || (c === CharCode.a) || (c === CharCode.A);
		case 12:
			return (c >= CharCode.Digit0 && c <= CharCode.Digit9) || (c >= CharCode.a && c <= CharCode.b) || (c >= CharCode.A && c <= CharCode.B);
		case 13:
			return (c >= CharCode.Digit0 && c <= CharCode.Digit9) || (c >= CharCode.a && c <= CharCode.c) || (c >= CharCode.A && c <= CharCode.C);
		case 14:
			return (c >= CharCode.Digit0 && c <= CharCode.Digit9) || (c >= CharCode.a && c <= CharCode.d) || (c >= CharCode.A && c <= CharCode.D);
		case 15:
			return (c >= CharCode.Digit0 && c <= CharCode.Digit9) || (c >= CharCode.a && c <= CharCode.e) || (c >= CharCode.A && c <= CharCode.E);
		default:
			return (c >= CharCode.Digit0 && c <= CharCode.Digit9) || (c >= CharCode.a && c <= CharCode.f) || (c >= CharCode.A && c <= CharCode.F);
	}
}

export class FrankensteinMode extends AbstractMode {

	constructor(
		descriptor: modes.IModeDescriptor,
		@IConfigurationService configurationService: IConfigurationService,
		@optional(IEditorWorkerService) editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id);

		if (editorWorkerService) {
			modes.SuggestRegistry.register(this.getId(), new TextualSuggestSupport(editorWorkerService, configurationService), true);
		}
	}
}
