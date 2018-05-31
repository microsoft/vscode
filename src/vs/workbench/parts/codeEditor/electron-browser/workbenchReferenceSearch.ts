/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IInstantiationService, optional, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ReferencesController } from 'vs/editor/contrib/referenceSearch/referencesController';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { TPromise } from 'vs/base/common/winjs.base';
import { ReferencesModel } from 'vs/editor/contrib/referenceSearch/referencesModel';
import { Range } from 'vs/editor/common/core/range';
import { Position, IPosition } from 'vs/editor/common/core/position';
import URI from 'vs/base/common/uri';
import { Location } from 'vs/editor/common/modes';
import { provideReferences, defaultReferenceSearchOptions } from 'vs/editor/contrib/referenceSearch/referenceSearch';
import { IEditorService } from 'vs/platform/editor/common/editor';

export class WorkbenchReferencesController extends ReferencesController {

	public constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService editorService: IEditorService,
		@ITextModelService textModelResolverService: ITextModelService,
		@INotificationService notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@optional(IEnvironmentService) environmentService: IEnvironmentService
	) {
		super(
			false,
			editor,
			contextKeyService,
			editorService,
			textModelResolverService,
			notificationService,
			instantiationService,
			contextService,
			storageService,
			themeService,
			configurationService,
			environmentService
		);
	}
}

registerEditorContribution(WorkbenchReferencesController);

let findReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition) => {

	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illegal argument, position');
	}

	return accessor.get(IEditorService).openEditor({ resource }).then(editor => {
		let control = editor.getControl();
		if (!isCodeEditor(control)) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		let references = provideReferences(control.getModel(), Position.lift(position)).then(references => new ReferencesModel(references));
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.toggleWidget(range, references, defaultReferenceSearchOptions));
	});
};

let showReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition, references: Location[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	return accessor.get(IEditorService).openEditor({ resource }).then(editor => {
		let control = editor.getControl();
		if (!isCodeEditor(control)) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		return TPromise.as(controller.toggleWidget(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			TPromise.as(new ReferencesModel(references)),
			defaultReferenceSearchOptions)).then(() => true);
	});
};

// register commands

CommandsRegistry.registerCommand({
	id: 'editor.action.findReferences',
	handler: findReferencesCommand
});

CommandsRegistry.registerCommand({
	id: 'editor.action.showReferences',
	handler: showReferencesCommand,
	description: {
		description: 'Show references at a position in a file',
		args: [
			{ name: 'uri', description: 'The text document in which to show references', constraint: URI },
			{ name: 'position', description: 'The position at which to show', constraint: Position.isIPosition },
			{ name: 'locations', description: 'An array of locations.', constraint: Array },
		]
	}
});
