/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { Mode, IEntryRunContext, IAutoFocus, IModel, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { IResourceInput, IEditorInput, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IConstructorSignature0, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export const CLOSE_ON_FOCUS_LOST_CONFIG = 'workbench.quickOpen.closeOnFocusLost';

export interface IWorkbenchQuickOpenConfiguration {
	workbench: {
		commandPalette: {
			history: number;
			preserveInput: boolean;
		}
	};
}

export class QuickOpenHandler {

	/**
	 * A quick open handler returns results for a given input string. The resolved promise
	 * returns an instance of quick open model. It is up to the handler to keep and reuse an
	 * instance of the same model across multiple calls. This helps in situations where the user is
	 * narrowing down a search and the model is just filtering some items out.
	 *
	 * As such, returning the same model instance across multiple searches will yield best
	 * results in terms of performance when many items are shown.
	 */
	public getResults(searchValue: string): TPromise<IModel<any>> {
		return TPromise.as(null);
	}

	/**
	 * The ARIA label to apply when this quick open handler is active in quick open.
	 */
	public getAriaLabel(): string {
		return null;
	}

	/**
	 * Extra CSS class name to add to the quick open widget to do custom styling of entries.
	 */
	public getClass(): string {
		return null;
	}

	/**
	 * Indicates if the handler can run in the current environment. Return a string if the handler cannot run but has
	 * a good message to show in this case.
	 */
	public canRun(): boolean | string {
		return true;
	}

	/**
	 * Hints to the outside that this quick open handler typically returns results fast.
	 */
	public hasShortResponseTime(): boolean {
		return false;
	}

	/**
	 * Indicates if the handler wishes the quick open widget to automatically select the first result entry or an entry
	 * based on a specific prefix match.
	 */
	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {};
	}

	/**
	 * Indicates to the handler that the quick open widget has been opened.
	 */
	public onOpen(): void {
		return;
	}

	/**
	 * Indicates to the handler that the quick open widget has been closed. Allows to free up any resources as needed.
	 * The parameter canceled indicates if the quick open widget was closed with an entry being run or not.
	 */
	public onClose(canceled: boolean): void {
		return;
	}

	/**
	 * Allows to return a label that will be placed to the side of the results from this handler or null if none.
	 */
	public getGroupLabel(): string {
		return null;
	}

	/**
	 * Allows to return a label that will be used when there are no results found
	 */
	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noResultsMatching', "No results matching");
		}
		return nls.localize('noResultsFound2', "No results found");
	}
}

export interface QuickOpenHandlerHelpEntry {
	prefix: string;
	description: string;
	needsEditor: boolean;
}

/**
 * A lightweight descriptor of a quick open handler.
 */
export class QuickOpenHandlerDescriptor {
	public prefix: string;
	public description: string;
	public contextKey: string;
	public helpEntries: QuickOpenHandlerHelpEntry[];
	public instantProgress: boolean;

	private id: string;
	private ctor: IConstructorSignature0<QuickOpenHandler>;

	constructor(ctor: IConstructorSignature0<QuickOpenHandler>, id: string, prefix: string, contextKey: string, description: string, instantProgress?: boolean);
	constructor(ctor: IConstructorSignature0<QuickOpenHandler>, id: string, prefix: string, contextKey: string, helpEntries: QuickOpenHandlerHelpEntry[], instantProgress?: boolean);
	constructor(ctor: IConstructorSignature0<QuickOpenHandler>, id: string, prefix: string, contextKey: string, param: any, instantProgress: boolean = false) {
		this.ctor = ctor;
		this.id = id;
		this.prefix = prefix;
		this.contextKey = contextKey;
		this.instantProgress = instantProgress;

		if (types.isString(param)) {
			this.description = param;
		} else {
			this.helpEntries = param;
		}
	}

	public getId(): string {
		return this.id;
	}

	public instantiate(instantiationService: IInstantiationService): QuickOpenHandler {
		return instantiationService.createInstance(this.ctor);
	}
}

export const Extensions = {
	Quickopen: 'workbench.contributions.quickopen'
};

export interface IQuickOpenRegistry {

	/**
	 * Registers a quick open handler to the platform.
	 */
	registerQuickOpenHandler(descriptor: QuickOpenHandlerDescriptor): void;

	/**
	 * Registers a default quick open handler to fallback to.
	 */
	registerDefaultQuickOpenHandler(descriptor: QuickOpenHandlerDescriptor): void;

	/**
	 * Get all registered quick open handlers
	 */
	getQuickOpenHandlers(): QuickOpenHandlerDescriptor[];

	/**
	 * Get a specific quick open handler for a given prefix.
	 */
	getQuickOpenHandler(prefix: string): QuickOpenHandlerDescriptor;

	/**
	 * Returns the default quick open handler.
	 */
	getDefaultQuickOpenHandler(): QuickOpenHandlerDescriptor;
}

class QuickOpenRegistry implements IQuickOpenRegistry {
	private handlers: QuickOpenHandlerDescriptor[];
	private defaultHandler: QuickOpenHandlerDescriptor;

	constructor() {
		this.handlers = [];
	}

	public registerQuickOpenHandler(descriptor: QuickOpenHandlerDescriptor): void {
		this.handlers.push(descriptor);

		// sort the handlers by decreasing prefix length, such that longer
		// prefixes take priority: 'ext' vs 'ext install' - the latter should win
		this.handlers.sort((h1, h2) => h2.prefix.length - h1.prefix.length);
	}

	public registerDefaultQuickOpenHandler(descriptor: QuickOpenHandlerDescriptor): void {
		this.defaultHandler = descriptor;
	}

	public getQuickOpenHandlers(): QuickOpenHandlerDescriptor[] {
		return this.handlers.slice(0);
	}

	public getQuickOpenHandler(text: string): QuickOpenHandlerDescriptor {
		return text ? arrays.first(this.handlers, h => strings.startsWith(text, h.prefix), null) : null;
	}

	public getDefaultQuickOpenHandler(): QuickOpenHandlerDescriptor {
		return this.defaultHandler;
	}
}

Registry.add(Extensions.Quickopen, new QuickOpenRegistry());

export interface IEditorQuickOpenEntry {

	/**
	 * The editor input used for this entry when opening.
	 */
	getInput(): IResourceInput | IEditorInput;

	/**
	 * The editor options used for this entry when opening.
	 */
	getOptions(): IEditorOptions;
}

/**
 * A subclass of quick open entry that will open an editor with input and options when running.
 */
export class EditorQuickOpenEntry extends QuickOpenEntry implements IEditorQuickOpenEntry {

	constructor(private _editorService: IWorkbenchEditorService) {
		super();
	}

	public get editorService() {
		return this._editorService;
	}

	public getInput(): IResourceInput | IEditorInput {
		return null;
	}

	public getOptions(): IEditorOptions {
		return null;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		const hideWidget = (mode === Mode.OPEN);

		if (mode === Mode.OPEN || mode === Mode.OPEN_IN_BACKGROUND) {
			const sideBySide = context.keymods.ctrlCmd;

			let openOptions: IEditorOptions;
			if (mode === Mode.OPEN_IN_BACKGROUND) {
				openOptions = { pinned: true, preserveFocus: true };
			} else if (context.keymods.alt) {
				openOptions = { pinned: true };
			}

			const input = this.getInput();
			if (input instanceof EditorInput) {
				let opts = this.getOptions();
				if (opts) {
					opts = objects.mixin(opts, openOptions, true);
				} else if (openOptions) {
					opts = EditorOptions.create(openOptions);
				}

				this.editorService.openEditor(input, opts, sideBySide).done(null, errors.onUnexpectedError);
			} else {
				const resourceInput = <IResourceInput>input;

				if (openOptions) {
					resourceInput.options = objects.assign(resourceInput.options || Object.create(null), openOptions);
				}

				this.editorService.openEditor(resourceInput, sideBySide).done(null, errors.onUnexpectedError);
			}
		}

		return hideWidget;
	}
}

/**
 * A subclass of quick open entry group that provides access to editor input and options.
 */
export class EditorQuickOpenEntryGroup extends QuickOpenEntryGroup implements IEditorQuickOpenEntry {

	public getInput(): IEditorInput | IResourceInput {
		return null;
	}

	public getOptions(): IEditorOptions {
		return null;
	}
}

export class QuickOpenAction extends Action {
	private prefix: string;

	constructor(
		id: string,
		label: string,
		prefix: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);

		this.prefix = prefix;
		this.enabled = !!this.quickOpenService;
	}

	public run(context?: any): TPromise<void> {

		// Show with prefix
		this.quickOpenService.show(this.prefix);

		return TPromise.as(null);
	}
}
