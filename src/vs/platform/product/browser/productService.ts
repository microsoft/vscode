/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProductService, IProductConfiguration } from 'vs/platform/product/common/product';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class ProductService implements IProductService {

	private readonly productConfiguration: IProductConfiguration | null;

	constructor() {
		const element = document.getElementById('vscode-remote-product-configuration');
		this.productConfiguration = element ? JSON.parse(element.getAttribute('data-settings')!) : null;
	}

	_serviceBrand: ServiceIdentifier<IProductService>;

	get version(): string { return '1.35.0'; }

	get commit(): string | undefined { return undefined; }

	get nameLong(): string { return ''; }

	get urlProtocol(): string { return ''; }

	get extensionAllowedProposedApi(): readonly string[] { return this.productConfiguration ? this.productConfiguration.extensionAllowedProposedApi : []; }

	get uiExtensions(): readonly string[] | undefined { return this.productConfiguration ? this.productConfiguration.uiExtensions : undefined; }

	get enableTelemetry(): boolean { return false; }

	get sendASmile(): { reportIssueUrl: string, requestFeatureUrl: string } | undefined { return this.productConfiguration ? this.productConfiguration.sendASmile : undefined; }

	get extensionsGallery() { return this.productConfiguration ? this.productConfiguration.extensionsGallery : undefined; }

	get settingsSearchBuildId(): number | undefined { return this.productConfiguration ? this.productConfiguration.settingsSearchBuildId : undefined; }

	get settingsSearchUrl(): string | undefined { return this.productConfiguration ? this.productConfiguration.settingsSearchUrl : undefined; }
}