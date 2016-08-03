/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="emmet.d.ts" />
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';

import {EditorAccessor} from 'vs/workbench/parts/emmet/node/editorAccessor';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import * as emmet from 'emmet';

interface IEmmetConfiguration {
	emmet: {
		preferences: any;
		syntaxProfiles: any;
		triggerExpansionOnTab: boolean
	};
}

class LazyEmmet {

	private static _INSTANCE = new LazyEmmet();

	public static withConfiguredEmmet(configurationService:IConfigurationService, callback:(_emmet: typeof emmet) => void): TPromise<void> {
		return LazyEmmet._INSTANCE.withEmmetPreferences(configurationService, callback);
	}

	private _emmetPromise: TPromise<typeof emmet>;

	constructor() {
		this._emmetPromise = null;
	}

	public withEmmetPreferences(configurationService:IConfigurationService, callback:(_emmet: typeof emmet) => void): TPromise<void> {
		return this._loadEmmet().then((_emmet: typeof emmet) => {
			this._withEmmetPreferences(configurationService, _emmet, callback);
		});
	}

	private _loadEmmet(): TPromise<typeof emmet> {
		if (!this._emmetPromise) {
			this._emmetPromise = new TPromise<typeof emmet>((c, e) => {
				require(['emmet'], c, e);
			});
		}
		return this._emmetPromise;
	}

	private updateEmmetPreferences(configurationService:IConfigurationService, _emmet: typeof emmet) {
		let preferences = configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_emmet.preferences.set(key, preferences[key]);
			} catch (err) {
				_emmet.preferences.define(key, preferences[key]);
			}
		}
		let syntaxProfile = configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles;
		_emmet.profile.reset();
		_emmet.loadProfiles(syntaxProfile);
	}

	private resetEmmetPreferences(configurationService:IConfigurationService, _emmet: typeof emmet) {
		let preferences = configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_emmet.preferences.remove(key);
			} catch (err) {
			}
		}
	}

	private _withEmmetPreferences(configurationService:IConfigurationService, _emmet:typeof emmet, callback:(_emmet: typeof emmet) => void): void {
		try {
			this.updateEmmetPreferences(configurationService, _emmet);
			callback(_emmet);
		} finally {
			this.resetEmmetPreferences(configurationService, _emmet);
		}
	}
}

export abstract class EmmetEditorAction extends EditorAction {

	protected editorAccessor: EditorAccessor;
	private configurationService: IConfigurationService = null;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, configurationService: IConfigurationService) {
		super(descriptor, editor, Behaviour.Writeable);
		this.editorAccessor = new EditorAccessor(editor);
		this.configurationService = configurationService;
	}

	abstract runEmmetAction(_emmet: typeof emmet);

	protected noExpansionOccurred() {
		// default do nothing
	}

	public run(): TPromise<void> {
		if (!this.editorAccessor.isEmmetEnabledMode()) {
			this.noExpansionOccurred();
			return ;
		}

		return LazyEmmet.withConfiguredEmmet(this.configurationService, (_emmet) => {
			this.editorAccessor.onBeforeEmmetAction();
			this.runEmmetAction(_emmet);
			this.editorAccessor.onAfterEmmetAction();
		});
	}
}

export class BasicEmmetEditorAction extends EmmetEditorAction {

	private emmetActionName: string;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService, actionName: string) {
		super(descriptor, editor, configurationService);
		this.editorAccessor = new EditorAccessor(editor);
		this.emmetActionName = actionName;
	}

	public runEmmetAction(_emmet: typeof emmet) {
		if (!_emmet.run(this.emmetActionName, this.editorAccessor)) {
			this.noExpansionOccurred();
		}
	}
}
