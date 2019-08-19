/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { parse } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IOpenerService, IOpener } from 'vs/platform/opener/common/opener';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { IDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { localize } from 'vs/nls';
import { IProductService } from 'vs/platform/product/common/product';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import Severity from 'vs/base/common/severity';

export class OpenerService implements IOpenerService {

	_serviceBrand: any;

	private readonly _opener = new LinkedList<IOpener>();

	constructor(
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@ICommandService private readonly _commandService: ICommandService,
		@IStorageService private readonly _storageService: IStorageService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IProductService private readonly _productService: IProductService
	) {
		//
	}

	registerOpener(opener: IOpener): IDisposable {
		const remove = this._opener.push(opener);
		return { dispose: remove };
	}

	async open(resource: URI, options?: { openToSide?: boolean }): Promise<boolean> {
		// no scheme ?!?
		if (!resource.scheme) {
			return Promise.resolve(false);
		}
		// check with contributed openers
		for (const opener of this._opener.toArray()) {
			const handled = await opener.open(resource, options);
			if (handled) {
				return true;
			}
		}
		// use default openers
		return this._doOpen(resource, options);
	}

	private _doOpen(resource: URI, options?: { openToSide?: boolean }): Promise<boolean> {

		const { scheme, authority, path, query, fragment } = resource;

		if (equalsIgnoreCase(scheme, Schemas.mailto)) {
			// open default mail application
			return this.openExternal(resource);
		}

		if (equalsIgnoreCase(scheme, Schemas.http) || equalsIgnoreCase(scheme, Schemas.https)) {
			let trustedDomains: string[] = ['https://code.visualstudio.com'];
			try {
				const trustedDomainsSrc = this._storageService.get('http.trustedDomains', StorageScope.GLOBAL);
				if (trustedDomainsSrc) {
					trustedDomains = JSON.parse(trustedDomainsSrc);
				}
			} catch (err) { }

			const domainToOpen = `${scheme}://${authority}`;

			if (isDomainTrusted(domainToOpen, trustedDomains)) {
				return this.openExternal(resource);
			} else {
				return this._dialogService.show(
					Severity.Info,
					localize(
						'openExternalLinkAt',
						'Do you want {0} to open the external website?\n{1}',
						this._productService.nameShort,
						resource.toString(true)
					),
					[
						localize('openLink', 'Open Link'),
						localize('cancel', 'Cancel'),
						localize('configureTrustedDomains', 'Configure Trusted Domains')
					],
					{
						cancelId: 1
					}).then((choice) => {
						if (choice === 0) {
							return this.openExternal(resource);
						} else if (choice === 2) {
							return this._commandService.executeCommand('workbench.action.configureTrustedDomains', domainToOpen).then((pickedDomains: string[]) => {
								if (pickedDomains.indexOf(domainToOpen) !== -1) {
									return this.openExternal(resource);
								}
								return Promise.resolve(false);
							});
						}
						return Promise.resolve(false);
					});
			}
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

	openExternal(resource: URI): Promise<boolean> {
		dom.windowOpenNoOpener(encodeURI(resource.toString(true)));

		return Promise.resolve(true);
	}
}

/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 */
function isDomainTrusted(domain: string, trustedDomains: string[]) {
	for (let i = 0; i < trustedDomains.length; i++) {
		if (trustedDomains[i] === '*') {
			return true;
		}

		if (trustedDomains[i] === domain) {
			return true;
		}
	}

	return false;
}
