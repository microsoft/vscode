/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import {Registry} from 'vs/platform/platform';
import {ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import Event, {Emitter} from 'vs/base/common/event';

export interface ILegacyLanguageDefinition {
	id: string;
	extensions: string[];
	filenames?: string[];
	firstLine?: string;
	aliases: string[];
	mimetypes: string[];
	moduleId: string;
	ctorName: string;
}

// Define extension point ids
export var Extensions = {
	ModesRegistry: 'editor.modesRegistry'
};

export class EditorModesRegistry {

	private _workerParticipants: Modes.IWorkerParticipantDescriptor[];
	private _compatModes: ILegacyLanguageDefinition[];
	private _languages: ILanguageExtensionPoint[];

	private _onDidAddCompatMode: Emitter<ILegacyLanguageDefinition> = new Emitter<ILegacyLanguageDefinition>();
	public onDidAddCompatMode: Event<ILegacyLanguageDefinition> = this._onDidAddCompatMode.event;

	private _onDidAddLanguage: Emitter<ILanguageExtensionPoint> = new Emitter<ILanguageExtensionPoint>();
	public onDidAddLanguage: Event<ILanguageExtensionPoint> = this._onDidAddLanguage.event;

	constructor() {
		this._workerParticipants = [];
		this._compatModes = [];
		this._languages = [];
	}

	// --- worker participants registration

	public registerWorkerParticipant(modeId:string, moduleId:string, ctorName?:string):void {
		this._workerParticipants.push({
			modeId: modeId,
			moduleId: moduleId,
			ctorName: ctorName
		});
	}

	public _getAllWorkerParticipants(): Modes.IWorkerParticipantDescriptor[] {
		return this._workerParticipants;
	}

	public _setWorkerParticipants(participants:Modes.IWorkerParticipantDescriptor[]): void {
		this._workerParticipants = participants;
	}

	public getWorkerParticipants(modeId:string):Modes.IWorkerParticipantDescriptor[] {
		return this._workerParticipants.filter(p => p.modeId === modeId);
	}


	public registerCompatMode(def:ILegacyLanguageDefinition): void {
		this._compatModes.push(def);
		this._onDidAddCompatMode.fire(def);
	}

	public getCompatModes(): ILegacyLanguageDefinition[] {
		return this._compatModes.slice(0);
	}


	public registerLanguage(def:ILanguageExtensionPoint): void {
		this._languages.push(def);
		this._onDidAddLanguage.fire(def);
	}

	public getLanguages(): ILanguageExtensionPoint[] {
		return this._languages.slice(0);
	}
}

export var ModesRegistry = new EditorModesRegistry();
Registry.add(Extensions.ModesRegistry, ModesRegistry);
