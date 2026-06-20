/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorNoTelemetry } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { fromAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';

export const defaultAgentHostWorkspaceTrustRequestMessage = localize('agentHost.workspaceTrust.request', "An agent session will be able to read files, run commands, and make changes in this folder.");

export class AgentHostWorkspaceTrust {

	constructor(
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
	) { }

	async isTrusted(uri: URI): Promise<boolean> {
		const trustUri = this._toWorkspaceTrustUri(uri);
		await this._workspaceTrustManagementService.workspaceTrustInitialized;
		if (this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return true;
		}
		return (await this._workspaceTrustManagementService.getUriTrustInfo(trustUri)).trusted;
	}

	async ensureTrusted(uri: URI, message = defaultAgentHostWorkspaceTrustRequestMessage): Promise<boolean> {
		if (await this.isTrusted(uri)) {
			return true;
		}

		return !!(await this._workspaceTrustRequestService.requestResourcesTrust({ uri: this._toWorkspaceTrustUri(uri), message }));
	}

	async requireTrusted(uri: URI, message?: string): Promise<void> {
		if (!await this.ensureTrusted(uri, message)) {
			throw new ErrorNoTelemetry(localize('agentHost.workspaceTrust.required', "Workspace trust is required to start an agent session in this folder."));
		}
	}

	private _toWorkspaceTrustUri(uri: URI): URI {
		return fromAgentHostUri(uri);
	}
}
