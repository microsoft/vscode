/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import { ResourceMap } from '../../../base/common/map.js';
import { parse } from '../../../base/common/marshalling.js';
import { matchesScheme, matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { normalizePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ICodeEditorService } from './codeEditorService.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { EditorOpenSource } from '../../../platform/editor/common/editor.js';
import { extractSelection, IExternalOpener, IExternalUriResolver, IOpener, IOpenerService, IResolvedExternalUri, IValidator, OpenOptions, ResolveExternalUriOptions } from '../../../platform/opener/common/opener.js';

class CommandOpener implements IOpener {

	constructor(@ICommandService private readonly _commandService: ICommandService) { }

	async open(target: URI | string, options?: OpenOptions): Promise<boolean> {
		if (!matchesScheme(target, Schemas.command)) {
			return false;
		}

		if (!options?.allowCommands) {
			// silently ignore commands when command-links are disabled, also
			// suppress other openers by returning TRUE
			return true;
		}

		if (typeof target === 'string') {
			target = URI.parse(target);
		}

		if (Array.isArray(options.allowCommands)) {
			// Only allow specific commands
			if (!options.allowCommands.includes(target.path)) {
				// Suppress other openers by returning TRUE
				return true;
			}
		}

		// execute as command
		let args: any = [];
		try {
			args = parse(decodeURIComponent(target.query));
		} catch {
			// ignore and retry
			try {
				args = parse(target.query);
			} catch {
				// ignore error
			}
		}
		if (!Array.isArray(args)) {
			args = [args];
		}
		await this._commandService.executeCommand(target.path, ...args);
		return true;
	}
}

class EditorOpener implements IOpener {

	constructor(@ICodeEditorService private readonly _editorService: ICodeEditorService) { }

	async open(target: URI | string, options: OpenOptions) {
		if (typeof target === 'string') {
			target = URI.parse(target);
		}
		const { selection, uri } = extractSelection(target);
		target = uri;

		if (target.scheme === Schemas.file) {
			target = normalizePath(target); // workaround for non-normalized paths (https://github.com/microsoft/vscode/issues/12954)
		}

		await this._editorService.openCodeEditor(
			{
				resource: target,
				options: {
					selection,
					source: options?.fromUserGesture ? EditorOpenSource.USER : EditorOpenSource.API,
					...options?.editorOptions
				}
			},
			this._editorService.getFocusedCodeEditor(),
			options?.openToSide
		);

		return true;
	}
}

export class OpenerService implements IOpenerService {

	declare readonly _serviceBrand: undefined;

	private readonly _openers = new LinkedList<IOpener>();
	private readonly _validators = new LinkedList<IValidator>();
	private readonly _resolvers = new LinkedList<IExternalUriResolver>();
	private readonly _resolvedUriTargets = new ResourceMap<URI>(uri => uri.with({ path: null, fragment: null, query: null }).toString());

	private _defaultExternalOpener: IExternalOpener;
	private readonly _externalOpeners = new LinkedList<IExternalOpener>();

	constructor(
		@ICodeEditorService editorService: ICodeEditorService,
		@ICommandService commandService: ICommandService
	) {
		// Default external opener is going through window.open()
		this._defaultExternalOpener = {
			openExternal: async href => {
				// ensure to open HTTP/HTTPS links into new windows
				// to not trigger a navigation. Any other link is
				// safe to be set as HREF to prevent a blank window
				// from opening.
				if (matchesSomeScheme(href, Schemas.http, Schemas.https)) {
					dom.windowOpenNoOpener(href);
				} else {
					mainWindow.location.href = href;
				}
				return true;
			}
		};

		// Default opener: any external, maito, http(s), command, and catch-all-editors
		this._openers.push({
			open: async (target: URI | string, options?: OpenOptions) => {
				if (options?.openExternal || matchesSomeScheme(target, Schemas.mailto, Schemas.http, Schemas.https, Schemas.vsls)) {
					// open externally
					await this._doOpenExternal(target, options);
					return true;
				}
				return false;
			}
		});
		this._openers.push(new CommandOpener(commandService));
		this._openers.push(new EditorOpener(editorService));
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

	setDefaultExternalOpener(externalOpener: IExternalOpener): void {
		this._defaultExternalOpener = externalOpener;
	}

	registerExternalOpener(opener: IExternalOpener): IDisposable {
		const remove = this._externalOpeners.push(opener);
		return { dispose: remove };
	}

	async open(target: URI | string, options?: OpenOptions): Promise<boolean> {
		// check with contributed validators
		const targetURI = typeof target === 'string' ? URI.parse(target) : target;
		// validate against the original URI that this URI resolves to, if one exists
		const validationTarget = this._resolvedUriTargets.get(targetURI) ?? target;
		for (const validator of this._validators) {
			if (!(await validator.shouldOpen(validationTarget, options))) {
				return false;
			}
		}

		// check with contributed openers
		for (const opener of this._openers) {
			const handled = await opener.open(target, options);
			if (handled) {
				return true;
			}
		}

		return false;
	}

	async resolveExternalUri(resource: URI, options?: ResolveExternalUriOptions): Promise<IResolvedExternalUri> {
		for (const resolver of this._resolvers) {
			try {
				const result = await resolver.resolveExternalUri(resource, options);
				if (result) {
					if (!this._resolvedUriTargets.has(result.resolved)) {
						this._resolvedUriTargets.set(result.resolved, resource);
					}
					return result;
				}
			} catch {
				// noop
			}
		}

		throw new Error('Could not resolve external URI: ' + resource.toString());
	}

	private async _doOpenExternal(resource: URI | string, options: OpenOptions | undefined): Promise<boolean> {

		//todo@jrieken IExternalUriResolver should support `uri: URI | string`
		const uri = typeof resource === 'string' ? URI.parse(resource) : resource;
		let externalUri: URI;

		try {
			externalUri = (await this.resolveExternalUri(uri, options)).resolved;
		} catch {
			externalUri = uri;
		}

		let href: string;
		if (typeof resource === 'string' && uri.toString() === externalUri.toString()) {
			// open the url-string AS IS
			href = resource;
		} else {
			// open URI using the toString(noEncode)+encodeURI-trick
			href = encodeURI(externalUri.toString(true));
		}

		if (options?.allowContributedOpeners) {
			const preferredOpenerId = typeof options?.allowContributedOpeners === 'string' ? options?.allowContributedOpeners : undefined;
			for (const opener of this._externalOpeners) {
				const didOpen = await opener.openExternal(href, {
					sourceUri: uri,
					preferredOpenerId,
				}, CancellationToken.None);
				if (didOpen) {
					return true;
				}
			}
		}

		return this._defaultExternalOpener.openExternal(href, { sourceUri: uri }, CancellationToken.None);
	}

	dispose() {
		this._validators.clear();
	}
}
