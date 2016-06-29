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
import * as fileAccessor from 'vs/workbench/parts/emmet/node/fileAccessor';
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

	private updateEmmetPreferences(_emmet: any) {
		let preferences = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.preferences;
		_emmet.loadPreferences(preferences);

		let syntaxProfile = this.configurationService.getConfiguration<IEmmetConfiguration>().emmet.syntaxProfiles;
		if (Object.keys(syntaxProfile).length !== 0) {
			_emmet.loadProfiles(syntaxProfile);
		}
	}

	private resetEmmetPreferences(_emmet: any) {
		_emmet.preferences.reset();
		_emmet.profile.reset();
	}

	abstract runEmmetAction(_emmet: any);

	protected noExpansionOccurred() {
		// default do nothing
	}

	public run(): TPromise<boolean> {
		return new TPromise((c, e) => {
			require(['emmet'], (_emmet) => {
				_emmet.file(fileAccessor);

				try {
					if (!this.editorAccessor.isEmmetEnabledMode()) {
						this.noExpansionOccurred();
						return;
					}
					this.updateEmmetPreferences(_emmet);
					this.runEmmetAction(_emmet);
				} catch (err) {
					//
				} finally {
					this.resetEmmetPreferences(_emmet);
				}
			}, e);
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

	public runEmmetAction(_emmet) {
		if (!_emmet.run(this.emmetActionName, this.editorAccessor)) {
			this.noExpansionOccurred();
		}
	}
}
