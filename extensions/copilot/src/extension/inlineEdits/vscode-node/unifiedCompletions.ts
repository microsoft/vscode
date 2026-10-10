/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IInlineEditsModelService } from '../../../platform/inlineEdits/common/inlineEditsModelService';
import { observeModelConfigValue } from '../../../platform/inlineEdits/common/modelConfigurationResolution';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { DebugOwner, derived, IObservable } from '../../../util/vs/base/common/observable';
import { unificationStateObservable } from '../../completions/vscode-node/completionsUnificationContribution';

/**
 * Whether NES runs as the single unified inline-completions provider, meaning the separate
 * completions provider is suppressed and NES answers for ghost text as well.
 *
 * Two independent signals say so: the capability baked into the selected model's prompting strategy
 * (which `chat.advanced.inlineEdits.unification` can still override), and VS Code's own
 * `modelUnification` deployment toggle.
 *
 * Every consumer must resolve through this one function. Provider registration turns the answer into
 * a `excludes` list, and each request turns it into a decision about whether to serve ghost text. If
 * the two disagreed, registration could exclude the separate provider while a request declined to
 * stand in for it, leaving the user with no inline suggestion at all.
 */
export function observeUnifiedCompletions(
	owner: DebugOwner,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	modelService: IInlineEditsModelService,
): IObservable<boolean> {
	const unificationState = unificationStateObservable(owner);
	const modelCapability = observeModelConfigValue(owner, configurationService, experimentationService, ConfigKey.TeamInternal.InlineEditsUnification, modelService.supportsUnifiedCompletions);
	return derived(owner, reader => modelCapability.read(reader) || (unificationState.read(reader)?.modelUnification ?? false));
}
