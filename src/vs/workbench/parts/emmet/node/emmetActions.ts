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

export abstract class EmmetEditorAction extends EditorAction {

	protected editorAccessor: EditorAccessor;
	private configurationService: IConfigurationService = null;

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, configurationService: IConfigurationService) {
		super(descriptor, editor, Behaviour.Writeable);
		this.editorAccessor = new EditorAccessor(editor);
		this.configurationService = configurationService;
	}

	private updateEmmetPreferences(_emmet: typeof emmet) {
		let preferences = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_emmet.preferences.set(key, preferences[key]);
			} catch (err) {
				_emmet.preferences.define(key, preferences[key]);
			}
		}
		let syntaxProfile = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles;
		_emmet.profile.reset();
		_emmet.loadProfiles(syntaxProfile);
	}

	private resetEmmetPreferences(_emmet: typeof emmet) {
		let preferences = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_emmet.preferences.remove(key);
			} catch (err) {
			}
		}
	}

	abstract runEmmetAction(_emmet: typeof emmet);

	protected noExpansionOccurred() {
		// default do nothing
	}

	public run(): TPromise<boolean> {
		if (!this.editorAccessor.isEmmetEnabledMode()) {
			this.noExpansionOccurred();
			return ;
		}

		return this._withEmmet().then((_emmet) => {
			this._withEmmetPreferences(_emmet, () => {
				this.editorAccessor.onBeforeEmmetAction();
				this.runEmmetAction(_emmet);
				this.editorAccessor.onAfterEmmetAction();
			});

			return true;
		});
	}

	private _withEmmet(): TPromise<typeof emmet> {
		return new TPromise<typeof emmet>((c, e) => {
			require(['emmet'], c, e);
		});
	}

	private _withEmmetPreferences(_emmet:typeof emmet, callback:() => void): void {
		try {
			this.updateEmmetPreferences(_emmet);
			callback();
		} finally {
			this.resetEmmetPreferences(_emmet);
		}
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
