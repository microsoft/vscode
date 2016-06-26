/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {EmmetEditorAction} from '../emmetActions';

import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IEditorActionDescriptorData, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

export class IncrementNumberByOneTenthAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.incrementNumberByOneTenth';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('increment_number_by_01', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class IncrementNumberByOneAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.incrementNumberByOne';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('increment_number_by_1', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class IncrementNumberByTenAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.incrementNumberByTen';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('increment_number_by_10', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class DecrementNumberByOneTenthAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.decrementNumberByOneTenth';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('decrement_number_by_01', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class DecrementNumberByOneAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.decrementNumberByOne';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('decrement_number_by_1', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

export class DecrementNumberByTenAction extends EmmetEditorAction {

	static ID = 'editor.emmet.action.decrementNumberByTen';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor, @IConfigurationService configurationService: IConfigurationService) {
		super(descriptor, editor, configurationService);
	}

	public runEmmetAction(_module) {
		if (!_module.run('decrement_number_by_10', this.editorAccessor)) {
			this.editorAccessor.noExpansionOccurred();
		}
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(IncrementNumberByOneTenthAction,
	IncrementNumberByOneTenthAction.ID,
	nls.localize('incrementNumberByOneTenth', "Emmet: Increment by 0.1"), void 0, 'Emmet: Increment by 0.1'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DecrementNumberByOneTenthAction,
	DecrementNumberByOneTenthAction.ID,
	nls.localize('decrementNumberByOneTenth', "Emmet: Decrement by 0.1"), void 0, 'Emmet: Decrement by 0.1'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(IncrementNumberByOneAction,
	IncrementNumberByOneAction.ID,
	nls.localize('incrementNumberByOne', "Emmet: Increment by 1"), void 0, 'Emmet: Increment by 1'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DecrementNumberByOneAction,
	DecrementNumberByOneAction.ID,
	nls.localize('decrementNumberByOne', "Emmet: Decrement by 1"), void 0, 'Emmet: Decrement by 1'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(IncrementNumberByTenAction,
	IncrementNumberByTenAction.ID,
	nls.localize('incrementNumberByTen', "Emmet: Increment by 10"), void 0, 'Emmet: Increment by 10'));

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DecrementNumberByTenAction,
	DecrementNumberByTenAction.ID,
	nls.localize('decrementNumberByTen', "Emmet: Decrement by 10"), void 0, 'Emmet: Decrement by 10'));
