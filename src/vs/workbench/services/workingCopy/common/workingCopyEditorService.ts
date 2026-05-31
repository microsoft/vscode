/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { EditorsOrder, IEditorIdentifier } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IWorkingCopy, IWorkingCopyIdentifier } from './workingCopy.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../editor/common/editorService.js';

export const IWorkingCopyEditorService = createDecorator<IWorkingCopyEditorService>('workingCopyEditorService');

export interface IWorkingCopyEditorHandler {

	/**
	 * Whether the handler is capable of opening the specific backup in
	 * an editor.
	 */
	handles(workingCopy: IWorkingCopyIdentifier): boolean | Promise<boolean>;

	/**
	 * Whether the provided working copy is opened in the provided editor.
	 */
	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean;

	/**
	 * Create an editor that is suitable of opening the provided working copy.
	 */
	createEditor(workingCopy: IWorkingCopyIdentifier): EditorInput | Promise<EditorInput>;
}

export interface IWorkingCopyEditorService {

	readonly _serviceBrand: undefined;

	/**
	 * An event fired whenever a handler is registered.
	 */
	readonly onDidRegisterHandler: Event<IWorkingCopyEditorHandler>;

	/**
	 * Register a handler to the working copy editor service.
	 */
	registerHandler(handler: IWorkingCopyEditorHandler): IDisposable;

	/**
	 * Finds the first editor that can handle the provided working copy.
	 */
	findEditor(workingCopy: IWorkingCopy): IEditorIdentifier | undefined;
}

export class WorkingCopyEditorService extends Disposable implements IWorkingCopyEditorService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidRegisterHandler = this._register(new Emitter<IWorkingCopyEditorHandler>());
	readonly onDidRegisterHandler = this._onDidRegisterHandler.event;

	private readonly handlers = new Set<IWorkingCopyEditorHandler>();

	constructor(@IEditorService private readonly editorService: IEditorService) {
		super();
	}

	registerHandler(handler: IWorkingCopyEditorHandler): IDisposable {

		// Add to registry and emit as event
		this.handlers.add(handler);
		this._onDidRegisterHandler.fire(handler);

		return toDisposable(() => this.handlers.delete(handler));
	}

	findEditor(workingCopy: IWorkingCopy): IEditorIdentifier | undefined {
		for (const editorIdentifier of this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
			if (this.isOpen(workingCopy, editorIdentifier.editor)) {
				return editorIdentifier;
			}
		}

		return undefined;
	}

	private isOpen(workingCopy: IWorkingCopy, editor: EditorInput): boolean {
		for (const handler of this.handlers) {
			if (handler.isOpen(workingCopy, editor)) {
				return true;
			}
		}

		return false;
	}
}

// Register Service
registerSingleton(IWorkingCopyEditorService, WorkingCopyEditorService, InstantiationType.Delayed);
