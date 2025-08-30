/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { ProxyServerStyles } from './extension';

export type ContentRewriter = (
	serverOrigin: string,
	proxyPath: string,
	url: string,
	contentType: string,
	responseBuffer: Buffer,
	htmlConfig?: ProxyServerHtml
) => Promise<Buffer | string>;

export type PendingProxyServer = {
	externalUri: vscode.Uri;
	proxyPath: string;
	finishProxySetup: (targetOrigin: string) => Promise<void>;
};

export type MaybeAddressInfo = AddressInfo | string | null | undefined;

export const isAddressInfo = (
	addressInfo: MaybeAddressInfo
): addressInfo is AddressInfo =>
	(addressInfo as AddressInfo).address !== undefined &&
	(addressInfo as AddressInfo).family !== undefined &&
	(addressInfo as AddressInfo).port !== undefined;

export class ProxyServerHtml {
	styleDefaults?: string;
	styleOverrides?: string;
	script?: string;
	styles?: ProxyServerStyles;

	constructor(
		styleDefaults?: string,
		styleOverrides?: string,
		script?: string,
		styles?: ProxyServerStyles,

	) {
		this.styleDefaults = styleDefaults;
		this.styleOverrides = styleOverrides;
		this.script = script;
		this.styles = styles;
	}

	resourcesLoaded(): boolean {
		return this.styleDefaults !== undefined
			&& this.styleOverrides !== undefined
			&& this.script !== undefined;
	}
};

export interface ProxyServerHtmlConfig {
	help: ProxyServerHtml;
	preview: ProxyServerHtml;
}

export enum ProxyServerType {
	Help = 'help',
	Preview = 'preview',
}
