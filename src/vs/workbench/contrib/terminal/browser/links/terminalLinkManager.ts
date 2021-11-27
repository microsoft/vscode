/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal, ILinkProvider } from 'xterm';
import { ITerminalExternalLinkProvider, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalProtocolLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalProtocolLinkProvider';
import { TerminalValidatedLocalLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalValidatedLocalLinkProvider';
import { TerminalWordLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalWordLinkProvider';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalExternalLinkProviderAdapter } from 'vs/workbench/contrib/terminal/browser/links/terminalExternalLinkProviderAdapter';

export type XtermLinkMatcherValidationCallback = (uri: string, callback: (isValid: boolean) => void) => void;

/**
 * Responsible for managing registration of link providers/matchers.
 */
export class TerminalLinkManager extends DisposableStore {
	private _standardLinkProviders: ILinkProvider[] = [];
	private _linkProvidersDisposables: IDisposable[] = [];

	private get _xterm(): Terminal {
		return (this._terminal as any)._xterm;
	}

	constructor(
		private _terminal: ITerminalInstance,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		// Protocol links
		this._standardLinkProviders.push(this._instantiationService.createInstance(TerminalProtocolLinkProvider, this._terminal));

		// Validated local links
		if (this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).enableFileLinks) {
			this._standardLinkProviders.push(this._instantiationService.createInstance(TerminalValidatedLocalLinkProvider, this._terminal));
		}

		// Word links
		this._standardLinkProviders.push(this._instantiationService.createInstance(TerminalWordLinkProvider, this._terminal));

		this._registerStandardLinkProviders();
	}

	private _clearLinkProviders(): void {
		dispose(this._linkProvidersDisposables);
		this._linkProvidersDisposables = [];
	}

	private _registerStandardLinkProviders(): void {
		for (const p of this._standardLinkProviders) {
			this._linkProvidersDisposables.push(this._xterm.registerLinkProvider(p));
		}
	}

	registerExternalLinkProvider(linkProvider: ITerminalExternalLinkProvider): IDisposable {
		// Clear and re-register the standard link providers so they are a lower priority that the new one
		this._clearLinkProviders();
		const wrappedLinkProvider = this._instantiationService.createInstance(TerminalExternalLinkProviderAdapter, this._terminal, linkProvider);
		const newLinkProvider = this._xterm.registerLinkProvider(wrappedLinkProvider);
		this._linkProvidersDisposables.push(newLinkProvider);
		this._registerStandardLinkProviders();
		return newLinkProvider;
	}
}
