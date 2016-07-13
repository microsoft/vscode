/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {AsyncDescriptor1, createAsyncDescriptor1} from 'vs/platform/instantiation/common/descriptors';
import {IInstantiationService, optional} from 'vs/platform/instantiation/common/instantiation';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IModeSupportChangedEvent} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {TextualSuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import * as wordHelper from 'vs/editor/common/model/wordHelper';
import {ICompatWorkerService, ICompatMode} from 'vs/editor/common/services/compatWorkerService';

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
	private _eventEmitter: EventEmitter;
	private _simplifiedMode: modes.IMode;

	constructor(modeId:string) {
		this._modeId = modeId;
		this._eventEmitter = new EventEmitter();
		this._simplifiedMode = null;
	}

	public getId(): string {
		return this._modeId;
	}

	public toSimplifiedMode(): modes.IMode {
		if (!this._simplifiedMode) {
			this._simplifiedMode = new SimplifiedMode(this);
		}
		return this._simplifiedMode;
	}

	public addSupportChangedListener(callback: (e: IModeSupportChangedEvent) => void) : IDisposable {
		return this._eventEmitter.addListener2('modeSupportChanged', callback);
	}

	public setTokenizationSupport<T>(callback:(mode:modes.IMode) => T) : IDisposable {
		var supportImpl = callback(this);
		this['tokenizationSupport'] = supportImpl;
		this._eventEmitter.emit('modeSupportChanged', _createModeSupportChangedEvent());

		return {
			dispose: () => {
				if (this['tokenizationSupport'] === supportImpl) {
					delete this['tokenizationSupport'];
					this._eventEmitter.emit('modeSupportChanged', _createModeSupportChangedEvent());
				}
			}
		};
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

class SimplifiedMode implements modes.IMode {

	tokenizationSupport: modes.ITokenizationSupport;

	private _sourceMode: modes.IMode;
	private _eventEmitter: EventEmitter;
	private _id: string;

	constructor(sourceMode: modes.IMode) {
		this._sourceMode = sourceMode;
		this._eventEmitter = new EventEmitter();
		this._id = 'vs.editor.modes.simplifiedMode:' + sourceMode.getId();
		this._assignSupports();

		if (this._sourceMode.addSupportChangedListener) {
			this._sourceMode.addSupportChangedListener((e) => {
				this._assignSupports();
				this._eventEmitter.emit('modeSupportChanged', e);
			});
		}
	}

	public getId(): string {
		return this._id;
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}

	private _assignSupports(): void {
		this.tokenizationSupport = this._sourceMode.tokenizationSupport;
	}
}

export var isDigit:(character:string, base:number)=>boolean = (function () {

	var _0 = '0'.charCodeAt(0),
		_1 = '1'.charCodeAt(0),
		_2 = '2'.charCodeAt(0),
		_3 = '3'.charCodeAt(0),
		_4 = '4'.charCodeAt(0),
		_5 = '5'.charCodeAt(0),
		_6 = '6'.charCodeAt(0),
		_7 = '7'.charCodeAt(0),
		_8 = '8'.charCodeAt(0),
		_9 = '9'.charCodeAt(0),
		_a = 'a'.charCodeAt(0),
		_b = 'b'.charCodeAt(0),
		_c = 'c'.charCodeAt(0),
		_d = 'd'.charCodeAt(0),
		_e = 'e'.charCodeAt(0),
		_f = 'f'.charCodeAt(0),
		_A = 'A'.charCodeAt(0),
		_B = 'B'.charCodeAt(0),
		_C = 'C'.charCodeAt(0),
		_D = 'D'.charCodeAt(0),
		_E = 'E'.charCodeAt(0),
		_F = 'F'.charCodeAt(0);

	return function isDigit(character:string, base:number):boolean {
		var c = character.charCodeAt(0);
		switch (base) {
			case 1:
				return c === _0;
			case 2:
				return c >= _0 && c <= _1;
			case 3:
				return c >= _0 && c <= _2;
			case 4:
				return c >= _0 && c <= _3;
			case 5:
				return c >= _0 && c <= _4;
			case 6:
				return c >= _0 && c <= _5;
			case 7:
				return c >= _0 && c <= _6;
			case 8:
				return c >= _0 && c <= _7;
			case 9:
				return c >= _0 && c <= _8;
			case 10:
				return c >= _0 && c <= _9;
			case 11:
				return (c >= _0 && c <= _9) || (c === _a) || (c === _A);
			case 12:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _b) || (c >= _A && c <= _B);
			case 13:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _c) || (c >= _A && c <= _C);
			case 14:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _d) || (c >= _A && c <= _D);
			case 15:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _e) || (c >= _A && c <= _E);
			default:
				return (c >= _0 && c <= _9) || (c >= _a && c <= _f) || (c >= _A && c <= _F);
		}
	};
})();

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

function _createModeSupportChangedEvent(): IModeSupportChangedEvent {
	return {
		tokenizationSupport: true
	};
}
