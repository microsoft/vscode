/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorAction, EditorExtensionsRegistry, IEditorContributionCtor } from 'vs/editor/browser/editorExtensions';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class CodeEditor extends CodeEditorWidget {

	constructor(
		domElement: HTMLElement,
		options: IEditorOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService
	) {
		super(domElement, options, false, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService);
	}

	protected _getContributions(): IEditorContributionCtor[] {
		return EditorExtensionsRegistry.getEditorContributions();
	}

	protected _getActions(): EditorAction[] {
		return EditorExtensionsRegistry.getEditorActions();
	}
}
