/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import {onUnexpectedError} from 'vs/base/common/errors';
import {values, forEach} from 'vs/base/common/collections';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {match} from 'vs/base/common/glob';
import Event, {Emitter} from 'vs/base/common/event';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IExtensionsService, IGalleryService, IExtensionTipsService, IExtension} from 'vs/workbench/parts/extensions/common/extensions';
import {IModelService} from 'vs/editor/common/services/modelService';
import {EventType} from 'vs/editor/common/editorCommon';

interface ExtensionMap {
	[id: string]: IExtension;
}

enum ExtensionTipReasons {
	// FileExists = 1
	FileOpened = 2,
	FileEdited = 3
}

class ExtensionTip {

	private _resources: { [uri: string]: ExtensionTipReasons } = Object.create(null);
	private _touched = Date.now();
	private _score = -1;

	constructor(public extension: IExtension) {
		//
	}

	resource(uri: URI, reason: ExtensionTipReasons): boolean {
		if (reason !== this._resources[uri.toString()]) {
			this._touched = Date.now();
			this._resources[uri.toString()] = Math.max((this._resources[uri.toString()] || 0), reason);
			this._score = - 1;
			return true;
		}
	}

	get score() {
		if (this._score === -1) {
			forEach(this._resources, entry => this._score += entry.value);
		}
		return this._score;
	}

	compareTo(tip: ExtensionTip): number {
		if (this === tip) {
			return 0;
		}
		let result = tip.score - this.score;
		if (result === 0) {
			result = tip._touched - this._touched;
		}
		return result;
	}
}


export class ExtensionTipsService implements IExtensionTipsService {

	serviceId: any;

	private _onDidChangeTips: Emitter<IExtension[]> = new Emitter<IExtension[]>();
	private _tips: { [id: string]: ExtensionTip } = Object.create(null);
	private _toDispose: IDisposable[] = [];
	private _availableExtensions: Promise<ExtensionMap>;

	constructor(
		@IExtensionsService private _extensionService: IExtensionsService,
		@IGalleryService private _galleryService: IGalleryService,
		@IModelService private _modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService
	) {

		configurationService.loadConfiguration('extensions').then(value => {
			if (value && value.experimentalSuggestions === true) {
				this._init();
			}
		}, onUnexpectedError);
	}

	dispose() {
		this._toDispose = disposeAll(this._toDispose);
	}

	get onDidChangeTips(): Event<IExtension[]> {
		return this._onDidChangeTips.event;
	}

	get tips(): IExtension[] {
		let tips = values(this._tips);
		tips.sort((a, b) => a.compareTo(b));
		return tips.map(tip => tip.extension);
	}

	private _init() {

		if (!this._galleryService.isEnabled()) {
			return;
		}

		this._availableExtensions = this._getAvailableExtensions();

		// don't suggest what got installed
		this._toDispose.push(this._extensionService.onDidInstallExtension(ext => {
			const id = `${ext.publisher}.${ext.name}`;
			let change = false;
			if (delete this._tips[id]) {
				change = true;
			}
			if (change) {
				this._onDidChangeTips.fire(this.tips);
			}
			this._availableExtensions = this._getAvailableExtensions();
		}));


		// we listen for editor models being added and changed
		// when a model is added it gives 2 points, a change gives 3 points
		// such that files you type have bigger impact on the suggest
		// order than those you only look at

		const modelListener: { [uri: string]: IDisposable } = Object.create(null);
		this._toDispose.push({ dispose() { disposeAll(values(modelListener)) } });

		this._toDispose.push(this._modelService.onModelAdded(model => {
			const uri = model.getAssociatedResource();
			this._suggestByResource(uri, ExtensionTipReasons.FileOpened);
			modelListener[uri.toString()] = model.addListener2(EventType.ModelContentChanged2,
				() => this._suggestByResource(uri, ExtensionTipReasons.FileEdited));
		}));

		this._toDispose.push(this._modelService.onModelRemoved(model => {
			const subscription = modelListener[model.getAssociatedResource().toString()];
			if (subscription) {
				subscription.dispose();
				delete modelListener[model.getAssociatedResource().toString()];
			}
		}));

		for (let model of this._modelService.getModels()) {
			this._suggestByResource(model.getAssociatedResource(), ExtensionTipReasons.FileOpened);
		}
	}

	private _getAvailableExtensions(): Promise<ExtensionMap> {
		return this._galleryService.query().then(extensions => {
			let map: ExtensionMap = Object.create(null);
			for (let ext of extensions) {
				map[`${ext.publisher}.${ext.name}`] = ext;
			}

			return this._extensionService.getInstalled().then(installed => {
				for (let ext of installed) {
					delete map[`${ext.publisher}.${ext.name}`];
				}
				return map;
			});
		}, () => {
			return Object.create(null);
		});
	}

	// --- suggest logic

	private _suggestByResource(uri: URI, reason: ExtensionTipReasons): Promise<any> {

		if (!uri) {
			return;
		}

		this._availableExtensions.then(extensions => {
			let change = false;
			forEach(ExtensionTipsService._extensionByPattern, entry => {
				let extension = extensions[entry.key];
				if (extension && match(entry.value, uri.fsPath)) {
					let value = this._tips[entry.key];
					if (!value) {
						value = this._tips[entry.key] = new ExtensionTip(extension);
					}
					if (value.resource(uri, reason)) {
						change = true;
					}
				}
			});

			if (change) {
				this._onDidChangeTips.fire(this.tips);
			}
		}, onUnexpectedError);
	}

	private static _extensionByPattern: { [pattern: string]: string } = {
		'jrieken.vscode-omnisharp': '{**/*.cs,**/project.json,**/global.json,**/*.csproj,**/*.sln}',
		'msjsdiag.debugger-for-chrome': '{**/*.ts,**/*.tsx**/*.js,**/*.jsx,**/*.es6}',
		'lukehoban.Go': '**/*.go',
		'ms-vscode.PowerShell': '{**/*.ps,**/*.ps1}',
		'austin.code-gnu-global': '{**/*.c,**/*.cpp,**/*.h}',
		'Ionide.Ionide-fsharp': '{**/*.fsx,**/*.fsi,**/*.fs,**/*.ml,**/*.mli}',
		'dbaeumer.vscode-eslint': '{**/*.js,**/*.jsx,**/*.es6}',
		'eg2.tslint': '{**/*.ts,**/*.tsx}'
	}
}
