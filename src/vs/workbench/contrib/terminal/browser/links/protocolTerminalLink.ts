/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { URI } from 'vs/base/common/uri';
import { IBufferRange } from 'xterm';
import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';

/**
 * Represents terminal link for protocol link
 * Provided by `TerminalProtocolLinkProvider`.
 */
export class ProtocolTerminalLink extends TerminalLink {
	constructor(
		_terminal: ITerminalInstance,
		range: IBufferRange,
		text: string,
		_viewportY: number,
		_isHighConfidenceLink: boolean,
		readonly uri: URI,
		@IConfigurationService _configurationService: IConfigurationService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITunnelService private readonly _tunnelService: ITunnelService
	) {
		super(
			_terminal,
			range,
			text,
			_viewportY,
			_isHighConfidenceLink,
			_configurationService,
			_instantiationService,
		);
	}

	override action() {
		this._openerService.open(this.uri, {
			allowTunneling: this._terminal.isRemote,
			allowContributedOpeners: true,
		});
	}

	protected override _getHoverText(): IMarkdownString {
		return new MarkdownString(`[${this._getLabel()}](${this.uri.toString()}) (${this._getClickLabel})`, true);
	}

	protected _getLabel() {
		if (this._tunnelService.canTunnel(this.uri)) {
			return localize('followForwardedLink', "Follow link using forwarded port");
		} else {
			return localize('followLink', "Follow link");
		}
	}
}
