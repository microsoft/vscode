/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import * as objects from 'vs/base/common/objects';
import filters = require('vs/base/common/filters');
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import { KeyMod } from 'vs/base/common/keyCodes';
import { Mode, IEntryRunContext, IAutoFocus, IModel, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, IHighlight, QuickOpenEntryGroup, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { EditorOptions, EditorInput } from 'vs/workbench/common/editor';
import { IResourceInput, IEditorInput, IEditorOptions } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { AsyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

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
	public getAutoFocus(searchValue: string, quickNavigateConfiguration?: IQuickNavigateConfiguration): IAutoFocus {
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
export class QuickOpenHandlerDescriptor extends AsyncDescriptor<QuickOpenHandler> {
	public prefix: string;
	public description: string;
	public isDefault: boolean;
	public helpEntries: QuickOpenHandlerHelpEntry[];
	public instantProgress: boolean;
	private id: string;

	constructor(moduleId: string, ctorName: string, prefix: string, description: string, instantProgress?: boolean);
	constructor(moduleId: string, ctorName: string, prefix: string, helpEntries: QuickOpenHandlerHelpEntry[], instantProgress?: boolean);
	constructor(moduleId: string, ctorName: string, prefix: string, param: any, instantProgress: boolean = false) {
		super(moduleId, ctorName);

		this.prefix = prefix;
		this.id = moduleId + ctorName;
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
			let sideBySide = context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;

			let openInBackgroundOptions: IEditorOptions;
			if (mode === Mode.OPEN_IN_BACKGROUND) {
				openInBackgroundOptions = { pinned: true, preserveFocus: true };
			}

			let input = this.getInput();
			if (input instanceof EditorInput) {
				let opts = this.getOptions();
				if (opts) {
					opts = objects.mixin(opts, openInBackgroundOptions, true);
				} else if (openInBackgroundOptions) {
					opts = EditorOptions.create(openInBackgroundOptions);
				}

				this.editorService.openEditor(input, opts, sideBySide).done(null, errors.onUnexpectedError);
			} else {
				const resourceInput = <IResourceInput>input;

				if (openInBackgroundOptions) {
					resourceInput.options = objects.assign(resourceInput.options || Object.create(null), openInBackgroundOptions);
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

	public getInput(): IEditorInput {
		return null;
	}

	public getOptions(): IEditorOptions {
		return null;
	}
}

// Infrastructure for quick open commands

export interface ICommand {
	aliases: string[];
	getResults(input: string): TPromise<QuickOpenEntry[]>;
	getEmptyLabel(input: string): string;
	icon?: string;
}

class CommandEntry extends QuickOpenEntry {

	constructor(private quickOpenService: IQuickOpenService, private prefix: string, private command: ICommand, highlights: IHighlight[]) {
		super(highlights);
		this.command = command;
	}

	public getIcon(): string {
		return this.command.icon || null;
	}

	public getLabel(): string {
		return this.command.aliases[0];
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, command", this.getLabel());
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.quickOpenService.show(`${this.prefix} ${this.command.aliases[0]} `);
		return false;
	}
}

export interface ICommandQuickOpenHandlerOptions {
	prefix: string;
	commands: ICommand[];
	defaultCommand?: ICommand;
}

export abstract class CommandQuickOpenHandler extends QuickOpenHandler {

	private prefix: string;
	private defaultCommand: ICommand;
	private commands: { regexp: RegExp; command: ICommand; }[];

	constructor(
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		options: ICommandQuickOpenHandlerOptions
	) {
		super();

		this.prefix = options.prefix;
		this.commands = options.commands.map(c => ({
			regexp: new RegExp('^(' + c.aliases.join('|') + ')\\b\\W+'),
			command: c
		}));
		this.defaultCommand = options.defaultCommand || null;
	}

	public getResults(input: string): TPromise<QuickOpenModel> {
		let match: RegExpMatchArray;
		let command = arrays.first(this.commands, c => !!(match = input.match(c.regexp)));
		let promise: TPromise<QuickOpenEntry[]>;

		if (command) {
			promise = command.command.getResults(input.substr(match[0].length));
		} else if (this.defaultCommand) {
			promise = this.defaultCommand.getResults(input);
		} else {
			promise = this.getCommands(input);
		}

		return promise.then(e => new QuickOpenModel(e));
	}

	private getCommands(input: string): TPromise<QuickOpenEntry[]> {
		let entries: QuickOpenEntry[] = this.commands
			.map(c => ({ command: c.command, highlights: filters.matchesFuzzy(input, c.command.aliases[0]) }))
			.filter(({ command, highlights }) => !!highlights || command.aliases.some(a => input === a))
			.map(({ command, highlights }) => new CommandEntry(this.quickOpenService, this.prefix, command, highlights));

		return TPromise.as(entries);
	}

	public getClass(): string {
		return null;
	}

	public canRun(): boolean {
		return true;
	}

	public getAutoFocus(input: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}

	public onClose(canceled: boolean): void {
		return;
	}

	public getGroupLabel(): string {
		return null;
	}

	public getEmptyLabel(input: string): string {
		let match: RegExpMatchArray;
		let command = arrays.first(this.commands, c => !!(match = input.match(c.regexp)));

		if (!command) {
			return nls.localize('noCommands', "No commands matching");
		}

		return command.command.getEmptyLabel(input);
	}
}

export class QuickOpenAction extends Action {
	private prefix: string;

	constructor(actionId: string, actionLabel: string, prefix: string, @IQuickOpenService private quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel);

		this.prefix = prefix;
		this.enabled = !!this.quickOpenService;
	}

	public run(context?: any): TPromise<any> {

		// Show with prefix
		this.quickOpenService.show(this.prefix);

		return TPromise.as(null);
	}
}
