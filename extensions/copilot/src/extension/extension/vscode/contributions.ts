/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NesActivationTelemetryContribution } from '../../../platform/inlineEdits/common/nesActivationStatusTelemetry.contribution';
import { asContributionFactory, IExtensionContributionFactory } from '../../common/contributions';
import * as contextContribution from '../../context/vscode/context.contribution';
import { LifecycleTelemetryContrib } from '../../telemetry/common/lifecycleTelemetryContrib';
import { GithubTelemetryForwardingContrib } from '../../telemetry/vscode/githubTelemetryForwardingContrib';

// ###############################################################################
// ###                                                                         ###
// ###      Contributions that run in both web and node.js extension host.     ###
// ###                                                                         ###
// ###  !!! Prefer to list contributions in HERE to support them anywhere !!!  ###
// ###                                                                         ###
// ###############################################################################

const vscodeContributions: IExtensionContributionFactory[] = [
	asContributionFactory(LifecycleTelemetryContrib),
	asContributionFactory(NesActivationTelemetryContribution),
	asContributionFactory(GithubTelemetryForwardingContrib),
	contextContribution,
];

export default vscodeContributions;
