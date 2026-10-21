/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../base/common/htmlContent.js';
import { localize } from '../../../nls.js';
import { ArtifactAutomationConfiguration, isArtifactOptionEnabled } from './artifactIntegration.js';
import { ArtifactIntegrationState } from './artifactIntegrationStore.js';
import { ArtifactAutomationNotice } from './artifactRuntime.js';

export function getArtifactAutomationNotices(previous: ArtifactIntegrationState, current: ArtifactIntegrationState): readonly ArtifactAutomationNotice[] {
	const notices: ArtifactAutomationNotice[] = [];
	const previousBindings = new Map(previous.bindings.map(binding => [binding.id, binding]));
	for (const binding of current.bindings) {
		// Bindings are stored on their first change, so a new one had every option off before it.
		const before: Pick<ArtifactAutomationConfiguration, 'revision' | 'values'> = previousBindings.get(binding.id)?.configuration ?? { revision: -1, values: {} };
		if (before.revision === binding.configuration.revision) {
			continue;
		}
		for (const option of binding.options) {
			const value = binding.configuration.values[option.id];
			if (before.values[option.id] === value) {
				continue;
			}
			const enabled = isArtifactOptionEnabled(option, value);
			const wasEnabled = isArtifactOptionEnabled(option, before.values[option.id]);
			if (!enabled && !wasEnabled) {
				continue;
			}
			const kind = enabled ? wasEnabled ? 'changed' : 'enabled' : 'disabled';
			const title = kind === 'enabled'
				? localize('artifactAutomationEnabledNotice', "{0} enabled for {1}", option.label, binding.artifact.label)
				: kind === 'changed'
					? localize('artifactAutomationChangedNotice', "{0} updated for {1}", option.label, binding.artifact.label)
					: localize('artifactAutomationDisabledNotice', "{0} disabled for {1}", option.label, binding.artifact.label);
			const paragraphs = [title];
			const paragraph = (text: string) => paragraphs.push(text);
			if (enabled) {
				paragraph(option.description);
				const choice = option.kind === 'enum' ? option.choices.find(choice => choice.value === value) : undefined;
				if (choice) {
					paragraph(localize('artifactAutomationSelectedMode', "Mode: {0}", choice.label));
					if (choice.description) {
						paragraph(choice.description);
					}
				}
				if (binding.configuration.grants?.[option.id]?.kind === 'agent') {
					paragraph(localize('artifactAutomationAgentGrant', "Requested by the agent and confirmed by you."));
				}
			} else {
				const disablement = binding.configuration.disablements[option.id];
				if (disablement) {
					paragraph(disablement.reason);
				}
				paragraph(localize('artifactAutomationStoppedNotice', "No new automatic runs will start for this rule. Pending runs will be cancelled; work already sent may still finish. Completed changes are not undone."));
				const remaining = binding.options.filter(candidate => isArtifactOptionEnabled(candidate, binding.configuration.values[candidate.id]));
				paragraph(remaining.length
					? localize('artifactAutomationRemainingNotice', "Still enabled: {0}.", remaining.map(option => option.label).join(', '))
					: localize('artifactAutomationNoneRemainingNotice', "No automation rules remain enabled for this artifact integration."));
			}
			notices.push({ session: binding.session, artifact: binding.artifact, kind, content: paragraphs.map(escapeMarkdownSyntaxTokens).join('\n\n') });
		}
	}
	return notices;
}
