/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IOpener, IOpenerService, IValidator, IExternalUriResolver, OpenOptions, ResolveExternalUriOptions, IResolvedExternalUri, IExternalOpener } from 'vs/platform/opener/common/opener';
import { EditorOpenContext } from 'vs/platform/editor/common/editor';

class CommandOpener implements IOpener {

	constructor(@ICommandService private readonly _commandService: ICommandService) { }

	async open(uri: URI, ) {
		// run command or bail out if command isn't known
		if (!equalsIgnoreCase(uri.scheme, Schemas.command)) {
			return false;
		}

		if (!CommandsRegistry.getCommand(uri.path)) {
			throw new Error(`command '${uri.path}' NOT known`);
		}

		// execute as command
		let args: any = [];
		try {
			args = parse(uri.query);
			if (!Array.isArray(args)) {
				args = [args];
			}
		} catch (e) {
			// ignore error
		}
		await this._commandService.executeCommand(uri.path, ...args);
		return true;
	}
}

class EditorOpener implements IOpener {

	constructor(@ICodeEditorService private readonly _editorService: ICodeEditorService) { }

	async open(uri: URI, options?: OpenOptions): Promise<boolean> {

		// finally open in editor
		let selection: { startLineNumber: number; startColumn: number; } | undefined = undefined;
		const match = /^L?(\d+)(?:,(\d+))?/.exec(uri.fragment);
		if (match) {
			// support file:///some/file.js#73,84
			// support file:///some/file.js#L73
			selection = {
				startLineNumber: parseInt(match[1]),
				startColumn: match[2] ? parseInt(match[2]) : 1
			};
			// remove fragment
			uri = uri.with({ fragment: '' });
		}

		if (uri.scheme === Schemas.file) {
			uri = resources.normalizePath(uri); // workaround for non-normalized paths (https://github.com/Microsoft/vscode/issues/12954)
		}

		await this._editorService.openCodeEditor(
			{ resource: uri, options: { selection, context: options?.fromUserGesture ? EditorOpenContext.USER : EditorOpenContext.API } },
			this._editorService.getFocusedCodeEditor(),
			options?.openToSide
		);

		return true;
	}
}

export class OpenerService extends Disposable implements IOpenerService {

	_serviceBrand: undefined;

	private readonly _openers = new LinkedList<IOpener>();
	private readonly _validators = new LinkedList<IValidator>();
	private readonly _resolvers = new LinkedList<IExternalUriResolver>();
	private _externalOpener: IExternalOpener;

	constructor(
		@ICodeEditorService editorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		// Default external opener is going through window.open()
		this._externalOpener = {
			openExternal: href => {
				dom.windowOpenNoOpener(href);
				return Promise.resolve(true);
			}
		};

		//
		this._openers.push({ // default: open externally
			open: async (uri: URI, options: OpenOptions | undefined): Promise<boolean> => {
				const { scheme } = uri;
				if (options?.openExternal || equalsIgnoreCase(scheme, Schemas.mailto) || equalsIgnoreCase(scheme, Schemas.http) || equalsIgnoreCase(scheme, Schemas.https)) {
					return this._doOpenExternal(uri, options);
				}
				return false;
			}
		});
		this._openers.push(new CommandOpener(commandService)); // default: run command
		this._openers.push(new EditorOpener(editorService)); // default: open editor
	}

	registerOpener(opener: IOpener): IDisposable {
		const remove = this._openers.unshift(opener);

		return { dispose: remove };
	}

	registerValidator(validator: IValidator): IDisposable {
		const remove = this._validators.push(validator);

		return { dispose: remove };
	}

	registerExternalUriResolver(resolver: IExternalUriResolver): IDisposable {
		const remove = this._resolvers.push(resolver);

		return { dispose: remove };
	}

	setExternalOpener(externalOpener: IExternalOpener): void {
		this._externalOpener = externalOpener;
	}

	async open(resource: URI, options?: OpenOptions): Promise<boolean> {

		// no scheme ?!?
		if (!resource.scheme) {
			return Promise.resolve(false);
		}

		// check with contributed validators
		for (const validator of this._validators.toArray()) {
			if (!(await validator.shouldOpen(resource))) {
				return false;
			}
		}

		// check with contributed openers
		for (const opener of this._openers.toArray()) {
			const handled = await opener.open(resource, options);
			if (handled) {
				return true;
			}
		}

		return false;
	}

	async resolveExternalUri(resource: URI, options?: ResolveExternalUriOptions): Promise<IResolvedExternalUri> {
		for (const resolver of this._resolvers.toArray()) {
			const result = await resolver.resolveExternalUri(resource, options);
			if (result) {
				return result;
			}
		}

		return { resolved: resource, dispose: () => { } };
	}

	private async _doOpenExternal(resource: URI, options: OpenOptions | undefined): Promise<boolean> {
		const { resolved } = await this.resolveExternalUri(resource, options);

		// TODO@Jo neither encodeURI nor toString(true) should be needed
		// once we go with URL and not URI
		return this._externalOpener.openExternal(encodeURI(resolved.toString(true)));
	}

	dispose() {
		this._validators.clear();
	}
}
