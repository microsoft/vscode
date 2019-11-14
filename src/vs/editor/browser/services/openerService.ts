/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import { matchesScheme, normalizePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IOpener, IOpenerService, IValidator, IExternalUriResolver, OpenOptions, ResolveExternalUriOptions, IResolvedExternalUri, IExternalOpener } from 'vs/platform/opener/common/opener';
import { EditorOpenContext } from 'vs/platform/editor/common/editor';


export class OpenerService implements IOpenerService {

	_serviceBrand: undefined;

	private readonly _openers = new LinkedList<IOpener>();
	private readonly _validators = new LinkedList<IValidator>();
	private readonly _resolvers = new LinkedList<IExternalUriResolver>();

	private _externalOpener: IExternalOpener;
	private _openerAsExternal: IOpener;
	private _openerAsCommand: IOpener;
	private _openerAsEditor: IOpener;

	constructor(
		@ICodeEditorService editorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
	) {
		// Default external opener is going through window.open()
		this._externalOpener = {
			openExternal: href => {
				dom.windowOpenNoOpener(href);
				return Promise.resolve(true);
			}
		};

		// Default opener: maito, http(s), command, and catch-all-editors
		this._openerAsExternal = {
			open: async (target: URI | URL, options?: OpenOptions) => {
				if (options?.openExternal || matchesScheme(target, Schemas.mailto) || matchesScheme(target, Schemas.http) || matchesScheme(target, Schemas.https)) {
					// open externally
					await this._doOpenExternal(target, options);
					return true;
				}
				return false;
			}
		};

		this._openerAsCommand = {
			open: async (target) => {
				if (!matchesScheme(target, Schemas.command)) {
					return false;
				}
				// run command or bail out if command isn't known
				if (!URI.isUri(target)) {
					target = URI.from(target);
				}
				if (!CommandsRegistry.getCommand(target.path)) {
					throw new Error(`command '${target.path}' NOT known`);
				}
				// execute as command
				let args: any = [];
				try {
					args = parse(target.query);
					if (!Array.isArray(args)) {
						args = [args];
					}
				} catch (e) {
					// ignore error
				}
				await commandService.executeCommand(target.path, ...args);
				return true;
			}
		};

		this._openerAsEditor = {
			open: async (target, options: OpenOptions) => {
				if (!URI.isUri(target)) {
					target = URI.from(target);
				}
				let selection: { startLineNumber: number; startColumn: number; } | undefined = undefined;
				const match = /^L?(\d+)(?:,(\d+))?/.exec(target.fragment);
				if (match) {
					// support file:///some/file.js#73,84
					// support file:///some/file.js#L73
					selection = {
						startLineNumber: parseInt(match[1]),
						startColumn: match[2] ? parseInt(match[2]) : 1
					};
					// remove fragment
					target = target.with({ fragment: '' });
				}

				if (target.scheme === Schemas.file) {
					target = normalizePath(target); // workaround for non-normalized paths (https://github.com/Microsoft/vscode/issues/12954)
				}

				await editorService.openCodeEditor(
					{ resource: target, options: { selection, context: options?.fromUserGesture ? EditorOpenContext.USER : EditorOpenContext.API } },
					editorService.getFocusedCodeEditor(),
					options?.openToSide
				);

				return true;
			}
		};
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

	setExternalOpener(externalOpener: IExternalOpener): void {
		this._externalOpener = externalOpener;
	}

	async open(target: URI | URL, options?: OpenOptions): Promise<boolean> {

		// check with contributed validators
		for (const validator of this._validators.toArray()) {
			if (!(await validator.shouldOpen(target))) {
				return false;
			}
		}

		// check with contributed openers
		for (const opener of this._openers.toArray()) {
			const handled = await opener.open(target, options);
			if (handled) {
				return true;
			}
		}

		// use default openers
		for (const opener of [this._openerAsExternal, this._openerAsCommand, this._openerAsEditor]) {
			if (await opener.open(target, options)) {
				break;
			}
		}
		return true;
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

	private async _doOpenExternal(resource: URI | URL, options: OpenOptions | undefined): Promise<boolean> {
		if (URI.isUri(resource)) {
			const { resolved } = await this.resolveExternalUri(resource, options);
			// TODO@Jo neither encodeURI nor toString(true) should be needed
			// once we go with URL and not URI
			return this._externalOpener.openExternal(encodeURI(resolved.toString(true)));
		} else {
			//todo@joh what about resolveExternalUri?
			return this._externalOpener.openExternal(resource.href);
		}
	}

	dispose() {
		this._validators.clear();
	}
}
