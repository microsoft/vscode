/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../../../../platform/authentication/common/copilotToken';
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { Disposable } from '../../../../../../util/vs/base/common/lifecycle';
import { onCopilotToken } from '../auth/copilotTokenNotifier';

interface UserConfigProperties {
	copilot_trackingId: string;
	organizations_list?: string;
	enterprise_list?: string;
	sku?: string;
}

function propertiesFromCopilotToken(copilotToken: Omit<CopilotToken, 'token'>): UserConfigProperties | undefined {
	const trackingId = copilotToken.getTokenValue('tid');
	const organizationsList = copilotToken.organizationList;
	const enterpriseList = copilotToken.enterpriseList;
	const sku = copilotToken.getTokenValue('sku');

	if (!trackingId) { return; }
	// The tracking id is also updated in reporters directly
	// in the AppInsightsReporter class and set in the `ai.user.id` tag.
	const props: UserConfigProperties = { copilot_trackingId: trackingId };
	if (organizationsList) { props.organizations_list = organizationsList.toString(); }
	if (enterpriseList) { props.enterprise_list = enterpriseList.toString(); }
	if (sku) { props.sku = sku; }
	return props;
}

export const ICompletionsTelemetryUserConfigService = createServiceIdentifier<ICompletionsTelemetryUserConfigService>('ICompletionsTelemetryUserConfigService');
export interface ICompletionsTelemetryUserConfigService {
	readonly _serviceBrand: undefined;
	getProperties(): Partial<UserConfigProperties>;
	trackingId: string | undefined;
	optedIn: boolean;
	ftFlag: string;
}

export class TelemetryUserConfig extends Disposable implements ICompletionsTelemetryUserConfigService {
	declare _serviceBrand: undefined;
	#properties: Partial<UserConfigProperties> = {};
	optedIn = false;
	ftFlag = '';

	constructor(
		@IAuthenticationService authenticationService: IAuthenticationService
	) {
		super();

		this._register(onCopilotToken(authenticationService, copilotToken => this.updateFromToken(copilotToken)));

		const maybeToken = authenticationService.copilotToken;
		if (maybeToken) {
			this.updateFromToken(maybeToken);
		}
	}

	getProperties() {
		return this.#properties;
	}

	get trackingId() {
		return this.#properties.copilot_trackingId;
	}

	updateFromToken(copilotToken: Omit<CopilotToken, 'token'>) {
		const properties = propertiesFromCopilotToken(copilotToken);
		if (properties) {
			this.#properties = properties;
			this.optedIn = copilotToken.getTokenValue('rt') === '1';
			this.ftFlag = copilotToken.getTokenValue('ft') ?? '';
		}
	}
}
