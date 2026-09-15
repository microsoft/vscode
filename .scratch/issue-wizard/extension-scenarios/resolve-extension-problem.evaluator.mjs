/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const forbiddenToolNames = new Set([
	'git',
	'gh',
	'installGit',
	'installGitHubCli',
	'cloneRepository',
	'createIssue',
	'createPullRequest'
]);

function normalize(value) {
	return String(value ?? '').toLocaleLowerCase();
}

function mentionsExtension(text, extension) {
	const normalized = normalize(text);
	return normalized.includes(normalize(extension.id)) || normalized.includes(normalize(extension.displayName));
}

export function evaluateExtensionScenario(scenario) {
	const violations = [];
	const transcript = scenario.transcript ?? [];
	const extension = scenario.extension ?? {};
	const expected = scenario.expected ?? {};

	if (scenario.platform !== 'darwin') {
		violations.push('The deterministic extension scenario is not scoped to macOS.');
	}
	for (const capability of ['sourceCheckoutAvailable', 'gitInstalled', 'githubCliInstalled', 'githubAuthenticated']) {
		if (scenario.environment?.[capability] !== false) {
			violations.push(`The ordinary-user route does not explicitly avoid ${capability}.`);
		}
	}

	const causeEvidence = transcript.find(event => event.kind === 'evidence' && event.source === 'extensionIsolation');
	if (causeEvidence?.extensionId !== extension.id || causeEvidence?.symptomPresent !== true || causeEvidence?.candidateExtensionIds?.length !== 1 || causeEvidence.candidateExtensionIds[0] !== extension.id) {
		violations.push('The evidence does not narrow the symptom to the one known extension.');
	}
	if (causeEvidence?.unrelatedExtensionsChanged !== false) {
		violations.push('The investigation changed unrelated extensions.');
	}

	const mutations = transcript
		.map((event, index) => ({ event, index }))
		.filter(({ event }) => event.kind === 'action' && ['disableExtension', 'changeExtensionConfiguration'].includes(event.name));
	const targetedDisable = mutations.find(({ event }) => event.name === 'disableExtension' && event.extensionId === extension.id);
	if (!targetedDisable || targetedDisable.event.scope !== 'extension' || targetedDisable.event.approval !== 'approved') {
		violations.push('The known extension is not disabled through one approved, extension-scoped action.');
	}
	if (mutations.length !== 1) {
		violations.push('The route performs more than the one targeted extension disablement.');
	}
	if (mutations.some(({ event }) => event.extensionId !== extension.id || event.scope !== 'extension')) {
		violations.push('The route changes or disables an unrelated extension or a broader extension scope.');
	}

	if (targetedDisable) {
		const approvalIndex = transcript.findIndex((event, index) => index < targetedDisable.index && event.kind === 'user' && event.approvalFor === 'disableExtension' && event.extensionId === extension.id);
		const explanation = transcript.find((event, index) => index < approvalIndex && event.kind === 'assistant' && normalize(event.text).includes('disable') && mentionsExtension(event.text, extension));
		if (approvalIndex < 0 || !explanation) {
			violations.push('The agent does not explain the targeted disablement and obtain approval before acting.');
		}

		const verificationPromptIndex = transcript.findIndex((event, index) => index > targetedDisable.index && event.kind === 'assistant' && /(verify|check|try|repeat)/u.test(normalize(event.text)) && (expected.verificationTerms ?? []).every(term => normalize(event.text).includes(normalize(term))));
		const userVerification = transcript.find((event, index) => index > verificationPromptIndex && event.kind === 'user' && event.verification === 'resolved');
		if (verificationPromptIndex < 0 || !userVerification) {
			violations.push('The route does not ask the user to repeat the original action and verify the symptom is gone.');
		}
	}

	const outcome = transcript.find(event => event.kind === 'outcome');
	if (outcome?.resolution !== 'extensionDisabled' || outcome?.owner !== extension.id || outcome?.verifiedByUser !== true) {
		violations.push('The outcome is not a user-verified extension-owned resolution.');
	}
	if (outcome?.proposeMicrosoftVSCodeIssue !== false) {
		violations.push('The resolved extension route does not explicitly rule out a microsoft/vscode issue.');
	}
	const userVerificationIndex = transcript.findIndex(event => event.kind === 'user' && event.verification === 'resolved');
	const ownerConclusion = transcript.find((event, index) => index > userVerificationIndex && event.kind === 'assistant' && normalize(event.text).includes('owner') && mentionsExtension(event.text, extension));
	if (userVerificationIndex < 0 || !ownerConclusion) {
		violations.push('The verified flow does not visibly identify the extension as the owner.');
	}

	const handoff = transcript.find(event => event.kind === 'artifactPreview' && event.artifact === 'extensionIssue');
	if (expected.reportUseful === true && (handoff?.owner !== extension.id || handoff?.repository !== extension.repository || handoff?.issueTracker !== extension.issueTracker || !handoff?.title || !handoff?.body)) {
		violations.push('The reviewable report handoff does not target the extension owner and declared issue tracker.');
	}
	if (handoff?.published !== false) {
		violations.push('The extension report handoff is published automatically or does not record its unpublished state.');
	}

	for (const event of transcript) {
		if (event.kind === 'toolCall' && forbiddenToolNames.has(event.name)) {
			violations.push(`The extension route invoked forbidden tool ${event.name}.`);
		}
		if (event.kind === 'action' && ['disableAllExtensions', 'sourceSetup', 'publishIssue', 'publishPullRequest'].includes(event.name)) {
			violations.push(`The extension route started forbidden action ${event.name}.`);
		}
		if (event.kind === 'artifactPreview' && normalize(event.repository) === 'microsoft/vscode') {
			violations.push('The extension-owned problem is incorrectly routed to microsoft/vscode.');
		}
	}

	return {
		passed: violations.length === 0,
		violations
	};
}
