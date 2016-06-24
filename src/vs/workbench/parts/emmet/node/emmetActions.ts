/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference path="emmet.d.ts" />
'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import {EditorAccessor} from './editorAccessor';
import {IQuickOpenService, IInputOptions} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {assign} from 'vs/base/common/objects';
import nls = require('vs/nls');

export abstract class EmmetEditorAction extends EditorAction {

	protected editorAccessor: EditorAccessor;

	private disposables: IDisposable[];
	private emmetDefaultPreferences: {} = {};

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService private configurationService: IConfigurationService) {
		super(descriptor, editor, Behaviour.TextFocus);
		this.disposables = [];
		this.editorAccessor = new EditorAccessor(editor);

		require(['emmet'], (_module) => {
			this.backupDefaultPreferences(_module);

			const disposable = configurationService.onDidUpdateConfiguration(e => this.updateEmmetConfig(_module, e.config));
			this.disposables.push(disposable);
		});
	}

	private backupDefaultPreferences(_module: any) {
		const preferences = _module.preferences.list();
		for (let index = 0; index < preferences.length; index++) {
			const key = preferences[index];
			this.emmetDefaultPreferences[key.name] = key.value;
		}
	}

	private updateEmmetConfig(_module: any, config: any) {
		const editorPreferences = config.emmet.preferences;
		this.updateEmmetPreferences(_module, editorPreferences);

		const editorSyntaxProfiles = config.emmet.syntaxProfiles;
		this.updateEmmetSyntaxPofiles(_module, editorSyntaxProfiles);
	}

	private updateEmmetPreferences(_module: any, editorPreferences: {}) {
		const emmetPreferences = _module.preferences.list();
		for (let index = 0; index < emmetPreferences.length; index++) {
			const key = emmetPreferences[index];
			emmetPreferences[key.name] = key.value;
			delete emmetPreferences[index];
		}

		const allPreferences = assign({}, emmetPreferences, editorPreferences);
		for (let key in allPreferences) {
			const inEmmetDefault = this.emmetDefaultPreferences.hasOwnProperty(key);
			const inEmmet = emmetPreferences.hasOwnProperty(key);
			const inEditor = editorPreferences.hasOwnProperty(key);
			if (!inEmmetDefault && !inEditor) {
				_module.preferences.remove(key);
				continue;
			}
			if (inEmmet && !inEditor) {
				_module.preferences.set(key, this.emmetDefaultPreferences[key]);
				continue;
			}
			if (!inEmmet && inEditor) {
				_module.preferences.define(key, editorPreferences[key]);
				continue;
			}

			_module.preferences.set(key, editorPreferences[key]);
		}
	}

	private updateEmmetSyntaxPofiles(_module: any, editorSyntaxProfiles: {}) {
		_module.profile.reset();
		_module.loadProfiles(editorSyntaxProfiles);
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
					this.runEmmetAction(_module);
				} catch (err) {
					//
				} finally {
				}
			}, e);
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
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
