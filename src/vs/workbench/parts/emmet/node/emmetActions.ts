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
import {EditorAccessor} from './editorAccessor';
import * as fileAccessor from './fileAccessor';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

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
		super(descriptor, editor, Behaviour.TextFocus);
		this.editorAccessor = new EditorAccessor(editor);
		this.configurationService = configurationService;
	}

	private updateEmmetPreferences(_module: any) {
		let preferences = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_module.preferences.set(key, preferences[key]);
			} catch (err) {
				_module.preferences.define(key, preferences[key]);
			}
		}
		let syntaxProfile = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles;
		if (Object.keys(syntaxProfile).length !== 0) {
			_module.profile.reset();
			_module.loadProfiles(syntaxProfile);
		}
	}

	private resetEmmetPreferences(_module: any) {
		let preferences = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_module.preferences.remove(key);
			} catch (err) {
			}
		}
	}

	abstract runEmmetAction(_module: any);

	public run(): TPromise<boolean> {
		return new TPromise((c, e) => {
			require(['emmet'], (_module) => {
				_module.file(fileAccessor);

				try {
					if (!this.editorAccessor.isEmmetEnabledMode()) {
						this.editorAccessor.noExpansionOccurred();
						return;
					}
					this.updateEmmetPreferences(_module);
					this.runEmmetAction(_module);
				} catch (err) {
					//
				} finally {
					this.resetEmmetPreferences(_module);
				}
			}, e);
		});
	}
}
