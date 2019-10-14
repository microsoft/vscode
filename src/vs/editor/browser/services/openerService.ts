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
import { IOpener, IOpenerService, IValidator, IExternalUriResolver, OpenOptions } from 'vs/platform/opener/common/opener';

export class OpenerService extends Disposable implements IOpenerService {

	_serviceBrand: undefined;

	private readonly _openers = new LinkedList<IOpener>();
	private readonly _validators = new LinkedList<IValidator>();
	private readonly _resolvers = new LinkedList<IExternalUriResolver>();

	constructor(
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
	}

	registerOpener(opener: IOpener): IDisposable {
		const remove = this._openers.push(opener);
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

		// use default openers
		return this._doOpen(resource, options);
	}

	public async resolveExternalUri(resource: URI, options?: { readonly allowTunneling?: boolean }): Promise<{ resolved: URI, dispose(): void }> {
		for (const resolver of this._resolvers.toArray()) {
			const result = await resolver.resolveExternalUri(resource, options);
			if (result) {
				return result;
			}
		}
		return { resolved: resource, dispose: () => { } };
	}

	private _doOpen(resource: URI, options: OpenOptions | undefined): Promise<boolean> {

		const { scheme, path, query, fragment } = resource;

		if (equalsIgnoreCase(scheme, Schemas.mailto) || (options && options.openExternal)) {
			// open default mail application
			return this._doOpenExternal(resource, options);
		}

		if (equalsIgnoreCase(scheme, Schemas.http) || equalsIgnoreCase(scheme, Schemas.https)) {
			// open link in default browser
			return this._doOpenExternal(resource, options);
		} else if (equalsIgnoreCase(scheme, Schemas.command)) {
			// run command or bail out if command isn't known
			if (!CommandsRegistry.getCommand(path)) {
				return Promise.reject(`command '${path}' NOT known`);
			}
			// execute as command
			let args: any = [];
			try {
				args = parse(query);
				if (!Array.isArray(args)) {
					args = [args];
				}
			} catch (e) {
				//
			}
			return this._commandService.executeCommand(path, ...args).then(() => true);

		} else {
			let selection: { startLineNumber: number; startColumn: number; } | undefined = undefined;
			const match = /^L?(\d+)(?:,(\d+))?/.exec(fragment);
			if (match) {
				// support file:///some/file.js#73,84
				// support file:///some/file.js#L73
				selection = {
					startLineNumber: parseInt(match[1]),
					startColumn: match[2] ? parseInt(match[2]) : 1
				};
				// remove fragment
				resource = resource.with({ fragment: '' });
			}

			if (resource.scheme === Schemas.file) {
				resource = resources.normalizePath(resource); // workaround for non-normalized paths (https://github.com/Microsoft/vscode/issues/12954)
			}

			return this._editorService.openCodeEditor(
				{ resource, options: { selection, } },
				this._editorService.getFocusedCodeEditor(),
				options && options.openToSide
			).then(() => true);
		}
	}

	private async _doOpenExternal(resource: URI, options: OpenOptions | undefined): Promise<boolean> {
		const { resolved } = await this.resolveExternalUri(resource, options);
		dom.windowOpenNoOpener(encodeURI(resolved.toString(true)));
		return Promise.resolve(true);
	}

	dispose() {
		this._validators.clear();
	}
}
