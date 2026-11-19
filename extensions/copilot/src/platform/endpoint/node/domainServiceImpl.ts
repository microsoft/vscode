/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { runOnChange } from '../../../util/vs/base/common/observable';
import { CopilotToken } from '../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ICAPIClientService } from '../common/capiClient';
import { IDomainChangeEvent, IDomainService } from '../common/domainService';

export class DomainService extends Disposable implements IDomainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeDomains = this._register(new Emitter<IDomainChangeEvent>());
	onDidChangeDomains: Event<IDomainChangeEvent> = this._onDidChangeDomains.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICopilotTokenStore private readonly _tokenStore: ICopilotTokenStore,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService
	) {
		super();
		for (const key of [ConfigKey.Shared.AuthProvider, ConfigKey.Shared.DebugOverrideCAPIUrl, ConfigKey.Shared.DebugOverrideProxyUrl]) {
			this._register(runOnChange(this._configurationService.getConfigObservable(key), () => this._processCopilotToken(this._tokenStore.copilotToken)));
		}
		this._processCopilotToken(this._tokenStore.copilotToken);
		this._register(this._tokenStore.onDidStoreUpdate(() => this._processCopilotToken(this._tokenStore.copilotToken)));
		this._register(this._tokenStore.onDidChangeGitHubEnterpriseUri(() => this._processCopilotToken(this._tokenStore.copilotToken)));

	}

	private _processCAPIModuleChange(token: CopilotToken | undefined): void {
		let capiConfigUrl = this._configurationService.getConfig(ConfigKey.Shared.DebugOverrideCAPIUrl);
		if (capiConfigUrl && capiConfigUrl.endsWith('/')) {
			capiConfigUrl = capiConfigUrl.slice(0, -1);
		}
		let proxyConfigUrl = this._configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl);
		if (proxyConfigUrl) {
			proxyConfigUrl = proxyConfigUrl.replace(/\/$/, '');
		}
		const enterpriseValue = this._configurationService.getConfig(ConfigKey.Shared.AuthProvider) === AuthProviderId.GitHubEnterprise ? this._tokenStore.githubEnterpriseUri?.toString() : undefined;
		const moduleToken = {
			endpoints: {
				api: capiConfigUrl || token?.endpoints?.api,
				proxy: proxyConfigUrl || token?.endpoints?.proxy,
				telemetry: token?.endpoints?.telemetry,
				'origin-tracker': token?.endpoints?.['origin-tracker']
			},
			sku: token?.sku || 'unknown',
		};
		const domainsChanged = this._capiClientService.updateDomains(moduleToken, enterpriseValue);
		if (domainsChanged.capiUrlChanged || domainsChanged.proxyUrlChanged || domainsChanged.telemetryUrlChanged || domainsChanged.dotcomUrlChanged) {
			this._onDidChangeDomains.fire({
				capiUrlChanged: domainsChanged.capiUrlChanged,
				telemetryUrlChanged: domainsChanged.telemetryUrlChanged,
				proxyUrlChanged: domainsChanged.proxyUrlChanged,
				dotcomUrlChanged: domainsChanged.dotcomUrlChanged
			});
		}
	}



	private _processCopilotToken(token: CopilotToken | undefined): void {
		this._processCAPIModuleChange(token);
	}

}
