/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {ICompatWorkerService, ICompatMode, IRawModelData} from 'vs/editor/common/services/compatWorkerService';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {ILanguageExtensionPoint, IModeService} from 'vs/editor/common/services/modeService';
import {IMirrorModelEvents, MirrorModel} from 'vs/editor/common/model/mirrorModel';
import {onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {ILegacyLanguageDefinition, ModesRegistry} from 'vs/editor/common/modes/modesRegistry';

export class CompatWorkerServiceWorker implements ICompatWorkerService {
	public _serviceBrand: any;
	public isInMainThread = false;
	private _compatModes: {[modeId:string]:ICompatMode;};

	constructor(
		@IResourceService private resourceService: IResourceService,
		@IModeService private modeService: IModeService,
		modesRegistryData: {
			compatModes: ILegacyLanguageDefinition[];
			languages: ILanguageExtensionPoint[];
		}
	) {
		ModesRegistry.registerCompatModes(modesRegistryData.compatModes);
		ModesRegistry.registerLanguages(modesRegistryData.languages);
		this._compatModes = Object.create(null);
	}

	registerCompatMode(compatMode:ICompatMode): void {
		this._compatModes[compatMode.getId()] = compatMode;
	}

	public handleMainRequest(rpcId: string, methodName: string, args: any[]): any {
		if (rpcId === '$') {
			switch (methodName) {
				case 'acceptNewModel':
					return this._acceptNewModel(args[0]);
				case 'acceptDidDisposeModel':
					return this._acceptDidDisposeModel(args[0]);
				case 'acceptModelEvents':
					return this._acceptModelEvents(args[0], args[1]);
				case 'acceptCompatModes':
					return this._acceptCompatModes(args[0]);
				case 'acceptLanguages':
					return this._acceptLanguages(args[0]);
				case 'instantiateCompatMode':
					return this._instantiateCompatMode(args[0]);
			}
		}

		let obj = this._compatModes[rpcId];
		return TPromise.as(obj[methodName].apply(obj, args));
	}

	public CompatWorker(obj: ICompatMode, methodName: string, target: Function, param: any[]): TPromise<any> {
		return target.apply(obj, param);
	}

	private _acceptNewModel(data: IRawModelData): TPromise<void> {
		// Create & insert the mirror model eagerly in the resource service
		let mirrorModel = new MirrorModel(data.versionId, data.value, null, data.url);
		this.resourceService.insert(mirrorModel.uri, mirrorModel);

		// Block worker execution until the mode is instantiated
		return this.modeService.getOrCreateMode(data.modeId).then((mode) => {
			// Changing mode should trigger a remove & an add, therefore:

			// (1) Remove from resource service
			this.resourceService.remove(mirrorModel.uri);

			// (2) Change mode
			mirrorModel.setMode(mode);

			// (3) Insert again to resource service (it will have the new mode)
			this.resourceService.insert(mirrorModel.uri, mirrorModel);
		});
	}

	private _acceptDidDisposeModel(uri: URI): void {
		let model = <MirrorModel>this.resourceService.get(uri);
		this.resourceService.remove(uri);
		model.dispose();
	}

	private _acceptModelEvents(uri: URI, events: IMirrorModelEvents): void {
		let model = <MirrorModel>this.resourceService.get(uri);
		try {
			model.onEvents(events);
		} catch (err) {
			onUnexpectedError(err);
		}
	}

	private _acceptCompatModes(modes:ILegacyLanguageDefinition[]): void {
		ModesRegistry.registerCompatModes(modes);
	}

	private _acceptLanguages(languages:ILanguageExtensionPoint[]): void {
		ModesRegistry.registerLanguages(languages);
	}

	private _instantiateCompatMode(modeId:string): TPromise<void> {
		return this.modeService.getOrCreateMode(modeId).then(_ => void 0);
	}
}
