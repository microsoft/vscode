/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./../browser/media/repl';
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IEditorContributionCtor} from 'vs/editor/browser/editorBrowser';
import {CodeEditorWidget} from 'vs/editor/browser/widget/codeEditorWidget';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ICommandService} from 'vs/platform/commands/common/commands';

export class ReplEditor extends CodeEditorWidget {
	constructor(
		domElement:HTMLElement,
		options:IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService);
	}

	protected _getContributions(): IEditorContributionCtor[] {
		return [].concat(EditorBrowserRegistry.getEditorContributions()).concat(CommonEditorRegistry.getEditorContributions());
	}

	protected _getActions(): EditorAction[] {
		return CommonEditorRegistry.getEditorActions();
	}
}
