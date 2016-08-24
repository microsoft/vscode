/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="emmet.d.ts" />
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {ICommonCodeEditor, EditorContextKeys} from 'vs/editor/common/editorCommon';
import {EditorAction, ServicesAccessor} from 'vs/editor/common/editorCommonExtensions';
import {ICommandKeybindingsOptions} from 'vs/editor/common/config/config';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

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
		let syntaxProfiles = configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles;
		_emmet.profile.reset();
		_emmet.loadProfiles(syntaxProfiles);
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

export class EmmetActionContext {
	editor: ICommonCodeEditor;
	emmet: typeof emmet;
	editorAccessor: EditorAccessor;

	constructor(editor: ICommonCodeEditor, _emmet: typeof emmet, editorAccessor: EditorAccessor) {
		this.editor = editor;
		this.emmet = _emmet;
		this.editorAccessor = editorAccessor;
	}
}

export abstract class EmmetEditorAction extends EditorAction {

	abstract runEmmetAction(accessor:ServicesAccessor, ctx:EmmetActionContext);

	protected noExpansionOccurred(editor:ICommonCodeEditor) {
		// default do nothing
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): TPromise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const instantiationService = accessor.get(IInstantiationService);

		let editorAccessor = new EditorAccessor(editor, configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles);
		if (!editorAccessor.isEmmetEnabledMode()) {
			this.noExpansionOccurred(editor);
			return ;
		}

		return LazyEmmet.withConfiguredEmmet(configurationService, (_emmet) => {
			editorAccessor.onBeforeEmmetAction();
			instantiationService.invokeFunction((accessor) => {
				this.runEmmetAction(accessor, new EmmetActionContext(editor, _emmet, editorAccessor));
			});
			editorAccessor.onAfterEmmetAction();
		});
	}
}

export class BasicEmmetEditorAction extends EmmetEditorAction {

	private emmetActionName: string;

	constructor(id:string, label:string, alias:string, actionName: string, kbOpts?:ICommandKeybindingsOptions) {
		super({
			id: id,
			label: label,
			alias: alias,
			precondition: EditorContextKeys.Writable,
			kbOpts: kbOpts
		});
		this.emmetActionName = actionName;
	}

	public runEmmetAction(accessor:ServicesAccessor, ctx:EmmetActionContext) {
		if (!ctx.emmet.run(this.emmetActionName, ctx.editorAccessor)) {
			this.noExpansionOccurred(ctx.editor);
		}
	}
}
