/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Location } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { ReferencesController, RequestOptions } from './referencesController';
import { ReferencesModel } from './referencesModel';
import { createCancelablePromise } from 'vs/base/common/async';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { getReferencesAtPosition } from 'vs/editor/contrib/goToDefinition/goToDefinition';

const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(model) {
		return model.references.length > 1 ? nls.localize('meta.titleReference', " – {0} references", model.references.length) : '';
	}
};

const findReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illegal argument, position');
	}

	const codeEditorService = accessor.get(ICodeEditorService);
	return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then(control => {
		if (!isCodeEditor(control) || !control.hasModel()) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		let references = createCancelablePromise(token => getReferencesAtPosition(control.getModel(), Position.lift(position), token).then(references => new ReferencesModel(references)));
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return Promise.resolve(controller.toggleWidget(range, references, defaultReferenceSearchOptions));
	});
};

const showReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: IPosition, references: Location[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	if (!references) {
		throw new Error('missing references');
	}

	const codeEditorService = accessor.get(ICodeEditorService);
	return codeEditorService.openCodeEditor({ resource }, codeEditorService.getFocusedCodeEditor()).then(control => {
		if (!isCodeEditor(control)) {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		return controller.toggleWidget(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			createCancelablePromise(_ => Promise.resolve(new ReferencesModel(references))),
			defaultReferenceSearchOptions
		);
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

