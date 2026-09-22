/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { ICustomizationPluginInstallResult, ICustomizationPluginMarketplaceProvider, ICustomizationPluginMarketplaceSnapshot } from '../../../common/customizationHarnessService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';

export class AgentHostPluginMarketplaceProvider extends Disposable implements ICustomizationPluginMarketplaceProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IAgentHostCustomizationService private readonly _customizationService: IAgentHostCustomizationService,
	) {
		super();
	}

	getSnapshot(sessionResource: URI, token: CancellationToken): Promise<ICustomizationPluginMarketplaceSnapshot | undefined> {
		return this._customizationService.getPluginMarketplaceSnapshot(sessionResource, token);
	}

	async refresh(sessionResource: URI, token: CancellationToken): Promise<ICustomizationPluginMarketplaceSnapshot | undefined> {
		const result = await this._customizationService.refreshPluginMarketplaces(sessionResource, token);
		if (result) {
			this._onDidChange.fire();
		}
		return result;
	}

	async install(sessionResource: URI, source: string): Promise<ICustomizationPluginInstallResult> {
		const result = await this._customizationService.installPlugin(sessionResource, source);
		this._onDidChange.fire();
		return result;
	}
}
