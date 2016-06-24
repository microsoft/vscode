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
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import nls = require('vs/nls');

interface IEmmetConfiguration {
	emmet: {
		preferences: any;
		syntaxProfiles: any;
		triggerExpansionOnTab: boolean
	};
}

export abstract class EmmetEditorAction extends EditorAction {

	protected editorAccessor: EditorAccessor;
	private configurationService:IConfigurationService = null;

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
			} catch(err) {
				_module.preferences.define(key, preferences[key]);
			}
		}
		let syntaxProfile = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles;
		_module.profile.reset();
		_module.loadProfiles(syntaxProfile);
	}

	private resetEmmetPreferences(_module: any) {
		let preferences = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		for (let key in preferences) {
			try {
				_module.preferences.remove(key);
			} catch(err) {
			}
		}
	}

	abstract runEmmetAction(_module: any);

	public run(): TPromise<boolean> {
		return new TPromise((c, e) => {
			require(['emmet'], (_module) => {
				try {
					if (!this.editorAccessor.isEmmetEnabledMode()) {
						this.editorAccessor.noExpansionOccurred();
						return;
					}
					this.updateEmmetPreferences(_module);
					this.runEmmetAction(_module);
					this.resetEmmetPreferences(_module);
				} catch (err) {
					//
				} finally {
				}
			}, e);
		});
	}
}

export class ExpandAbbreviationAction extends EmmetEditorAction {
	static ID = 'editor.emmet.action.expandAbbreviation';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('expand_abbreviation', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class RemoveTagAction extends EmmetEditorAction {
	static ID = 'editor.emmet.action.removeTag';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('remove_tag', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class UpdateTagAction extends EmmetEditorAction {
	static ID = 'editor.emmet.action.updateTag';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		let options: IInputOptions = {
			prompt: nls.localize('enterTag', "Enter Tag"),
			placeHolder: nls.localize('tag', "Tag")
		};
		this.quickOpenService.input(options).then(tag => {
			this.wrapAbbreviation(_module, tag);
		});
	}

	private wrapAbbreviation(_module: any, tag) {
		if (!_module.run('update_tag', this.editorAccessor, tag)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class WrapWithAbbreviationAction extends EmmetEditorAction {
	static ID = 'editor.emmet.action.wrapWithAbbreviation';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		let options: IInputOptions = {
			prompt: nls.localize('enterAbbreviation', "Enter Abbreviation"),
			placeHolder: nls.localize('abbreviation', "Abbreviation")
		};
		this.quickOpenService.input(options).then(abbreviation => {
			this.wrapAbbreviation(_module, abbreviation);
		});
	}

	private wrapAbbreviation(_module: any, abbreviation) {
		if (!_module.run('wrap_with_abbreviation', this.editorAccessor, abbreviation)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}
