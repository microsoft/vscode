/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const ignoredQueryWords = new Set(['a', 'after', 'an', 'and', 'for', 'from', 'in', 'is', 'of', 'the', 'to', 'when']);

/** Normalizes fixture values for case-insensitive semantic checks. */
function normalize(value) {
	return String(value ?? '').toLocaleLowerCase();
}

/** Returns meaningful words from a reported title or symptom. */
function meaningfulWords(value) {
	return (normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 2 && !ignoredQueryWords.has(word));
}

/** Checks that the query contains terms independently derived from the report input. */
function containsDerivedQueryTerms(searchCase, query) {
	const reportWords = new Set([
		...meaningfulWords(searchCase.input?.title),
		...meaningfulWords(searchCase.input?.symptom),
		...(searchCase.input?.relevantTerms ?? []).flatMap(meaningfulWords),
	]);
	const queryWords = meaningfulWords(query).filter(word => !['issue', 'microsoft', 'repo', 'state', 'vscode', 'title', 'body'].includes(word));
	return reportWords.size > 0
		&& queryWords.length >= 2
		&& queryWords.length <= 5
		&& queryWords.filter(word => reportWords.has(word)).length >= Math.min(2, reportWords.size);
}

/** Checks that a retry is meaningfully broader while retaining distinctive report terms. */
function isBroaderQuery(searchCase, firstQuery, retryQuery) {
	const firstTerms = meaningfulWords(firstQuery).filter(word => !['issue', 'microsoft', 'repo', 'state', 'vscode'].includes(word));
	const retryTerms = meaningfulWords(retryQuery).filter(word => !['issue', 'microsoft', 'repo', 'state', 'vscode'].includes(word));
	const reportWords = [...new Set([
		...meaningfulWords(searchCase.input?.title),
		...meaningfulWords(searchCase.input?.symptom),
		...(searchCase.input?.relevantTerms ?? []).flatMap(meaningfulWords),
	])];
	return !retryQuery.includes('"')
		&& retryTerms.length >= 2
		&& retryTerms.length < firstTerms.length
		&& reportWords.filter(word => normalize(retryQuery).includes(word)).length >= Math.min(2, reportWords.length);
}

/** Checks the fixed anonymous endpoint while allowing optional search policy parameters. */
function isExactlyEncodedAnonymousUrl(value, query) {
	try {
		const url = new URL(value);
		const encodedQueries = [...String(value).matchAll(/[?&]q=([^&]*)/gu)];
		return url.protocol === 'https:'
			&& url.hostname === 'api.github.com'
			&& url.port === ''
			&& url.username === ''
			&& url.password === ''
			&& url.pathname === '/search/issues'
			&& encodedQueries.length === 1
			&& encodedQueries[0][1] === encodeURIComponent(query);
	} catch {
		return false;
	}
}

/** Evaluates transport selection, repository scope, and query construction. */
function evaluateTransport(searchCase, violations) {
	const transcript = searchCase.transcript ?? [];
	const capability = transcript.find(event => event.kind === 'capability' && event.name === 'githubCli');
	const searches = transcript.filter(event => event.kind === 'search');
	const ghSearches = searches.filter(event => event.transport === 'gh');
	const anonymousSearches = searches.filter(event => event.transport === 'anonymousRest');
	const expectedTransport = searchCase.expected?.transport;
	const expectedSearchCount = searchCase.expected?.searchCount ?? 1;

	if (expectedTransport === 'gh') {
		if (capability?.installed !== true || capability?.authenticated !== true || ghSearches.length !== expectedSearchCount || anonymousSearches.length !== 0) {
			violations.push(`${searchCase.id}: An already authenticated GitHub CLI was not used exclusively.`);
			return;
		}
		for (const search of ghSearches) {
			const args = search.command?.arguments ?? [];
			const repositoryIndex = args.indexOf('--repo');
			const stateIndex = args.indexOf('--state');
			const firstFlagIndex = args.findIndex((argument, index) => index >= 2 && argument.startsWith('--'));
			const queryArguments = args.slice(2, firstFlagIndex === -1 ? args.length : firstFlagIndex);
			const expectedState = searchCase.input?.state;
			const hasState = expectedState === 'all' ? stateIndex === -1 : args[stateIndex + 1] === expectedState;
			const hasSeparatePlainQueryWords = queryArguments.length >= 2
				&& queryArguments.every(argument => argument.trim() && !/\s/u.test(argument) && !/^(?:is:issue|repo:)/u.test(argument))
				&& queryArguments.join(' ') === search.query;
			if (!search.query?.trim() || /(?:^|\s)(?:is:issue|repo:)/u.test(search.query) || search.repository !== 'microsoft/vscode' || search.issueOnly !== true || search.state !== expectedState || search.command?.executable !== 'gh' || args[0] !== 'search' || args[1] !== 'issues' || !hasSeparatePlainQueryWords || args[repositoryIndex + 1] !== 'microsoft/vscode' || !hasState) {
				violations.push(`${searchCase.id}: GitHub CLI search is not fixed to the requested microsoft/vscode issue scope with transport-specific syntax.`);
			}
		}
		if (!containsDerivedQueryTerms(searchCase, ghSearches[0]?.query)) {
			violations.push(`${searchCase.id}: Search query does not contain focused terms derived from the reported title, symptom, and relevant terms.`);
		}
	} else if (expectedTransport === 'anonymousRest') {
		if (capability?.installed === true && capability?.authenticated === true || anonymousSearches.length !== expectedSearchCount || ghSearches.length !== 0) {
			violations.push(`${searchCase.id}: An unusable GitHub CLI did not fall back exclusively to anonymous REST search.`);
			return;
		}
		let firstHasFixedScope = false;
		for (const [index, search] of anonymousSearches.entries()) {
			const query = search.query ?? '';
			const expectedState = searchCase.input?.state;
			const hasStateScope = expectedState === 'all' ? !/\bstate:(?:open|closed)\b/u.test(query) : query.includes(`state:${expectedState}`);
			const issueQualifiers = query.match(/(?:^|\s)is:(?:issue|pr)(?=\s|$)/gu) ?? [];
			const repositoryQualifiers = query.match(/(?:^|\s)repo:\S+/gu) ?? [];
			const hasFixedScope = !!query.trim() && issueQualifiers.length === 1 && issueQualifiers[0].trim() === 'is:issue' && repositoryQualifiers.length === 1 && repositoryQualifiers[0].trim() === 'repo:microsoft/vscode' && hasStateScope;
			firstHasFixedScope ||= index === 0 && hasFixedScope;
			if (!hasFixedScope) {
				violations.push(`${searchCase.id}: Anonymous search query is not fixed to microsoft/vscode issues with a nonempty q value.`);
			}
			if (!isExactlyEncodedAnonymousUrl(search.url, query)) {
				violations.push(`${searchCase.id}: Anonymous Search Issues URL does not exactly encode its query.`);
			}
		}
		if (firstHasFixedScope && !containsDerivedQueryTerms(searchCase, anonymousSearches[0]?.query)) {
			violations.push(`${searchCase.id}: Search query does not contain focused terms derived from the reported title, symptom, and relevant terms.`);
		}
	} else {
		violations.push(`${searchCase.id}: Expected transport must be gh or anonymousRest.`);
	}
}

/** Evaluates the required broader retry after an empty focused search. */
function evaluateBroadening(searchCase, violations) {
	if (searchCase.expected?.broadensOnNoResults !== true) {
		return;
	}
	const searches = (searchCase.transcript ?? []).filter(event => event.kind === 'search');
	if (searches.length !== 2 || searches[0]?.results?.length !== 0 || !isBroaderQuery(searchCase, searches[0]?.query ?? '', searches[1]?.query ?? '')) {
		violations.push(`${searchCase.id}: Empty focused results were not retried once with a broader unquoted query.`);
	}
}

/** Evaluates concise, evidence-based match presentation and strong-match routing. */
function evaluatePresentation(searchCase, violations) {
	const transcript = searchCase.transcript ?? [];
	const summary = transcript.find(event => event.kind === 'assistant' && event.purpose === 'searchSummary');
	const outcome = transcript.find(event => event.kind === 'outcome');
	const strongMatch = searchCase.expected?.strongMatch;
	if (strongMatch === undefined) {
		return;
	}
	const candidateInspection = transcript.find(event => event.kind === 'candidateInspection' && event.number === strongMatch);
	if (!candidateInspection || !Array.isArray(candidateInspection.fields) || !candidateInspection.fields.includes('title') || !candidateInspection.fields.includes('body')) {
		violations.push(`${searchCase.id}: Strong match was not inspected by title and body before relevance was judged.`);
	}
	const summaryText = normalize(summary?.text);
	if (meaningfulWords(summary?.text).length > 80) {
		violations.push(`${searchCase.id}: Result summary is not concise.`);
	}
	if (!summaryText.includes(`#${strongMatch}`) && !summaryText.includes(`/issues/${strongMatch}`)) {
		violations.push(`${searchCase.id}: Strong match is not identified in the result summary.`);
	}
	const presentedMatches = summary?.matches ?? [];
	const strongMatchPresentation = presentedMatches.find(match => match.number === strongMatch);
	const relevanceTerms = searchCase.expected?.relevanceTerms ?? [];
	if (!strongMatchPresentation || relevanceTerms.filter(term => normalize(strongMatchPresentation.relevance).includes(normalize(term))).length < 2) {
		violations.push(`${searchCase.id}: Strong-match summary does not explain the shared symptom terms.`);
	}
	for (const match of presentedMatches) {
		const relevanceWordCount = meaningfulWords(match.relevance).length;
		if (relevanceWordCount < 3 || relevanceWordCount > 40) {
			violations.push(`${searchCase.id}: Presented match #${match.number} has no concise relevance explanation.`);
		}
	}
	if (outcome?.preferredEvidenceDestination !== strongMatch || outcome?.published !== false) {
		violations.push(`${searchCase.id}: Strong match is not preferred as the unpublished destination for new evidence.`);
	}
}

/** Checks that recovery copy preserves work and gives an actionable next step. */
function isUsefulRecovery(recovery) {
	const text = recovery?.text ?? '';
	return meaningfulWords(text).length >= 8
		&& /\b(?:investigation|draft|report|details|evidence)\b/iu.test(text)
		&& /\b(?:browser search|continue|refine|retry|later)\b/iu.test(text);
}

/** Evaluates no-result and recoverable failure behavior. */
function evaluateRecovery(searchCase, violations) {
	const transcript = searchCase.transcript ?? [];
	const search = transcript.filter(event => event.kind === 'search').at(-1);
	const recovery = transcript.find(event => event.kind === 'assistant' && event.purpose === 'recovery');
	const outcome = transcript.find(event => event.kind === 'outcome');
	if (searchCase.expected?.resolution === 'noMatchingIssue') {
		if (search?.results?.length !== 0 || outcome?.resolution !== 'noMatchingIssue' || outcome?.recoverable !== true || !outcome?.nextStep || !isUsefulRecovery(recovery)) {
			violations.push(`${searchCase.id}: No-result search does not preserve a useful next step.`);
		}
		return;
	}
	const failure = searchCase.expected?.failure;
	if (failure && (search?.error !== failure || outcome?.reason !== failure || outcome?.recoverable !== true || !outcome?.fallback || !isUsefulRecovery(recovery))) {
		violations.push(`${searchCase.id}: ${failure} failure does not preserve the investigation and a useful fallback.`);
	}
}

/** Evaluates background-only capability probing and the search-only safety boundary. */
function evaluateSafety(searchCase, violations) {
	const transcript = searchCase.transcript ?? [];
	const capability = transcript.find(event => event.kind === 'capability' && event.name === 'githubCli');
	if (capability?.visible !== false) {
		violations.push(`${searchCase.id}: GitHub CLI capability check is not marked as background-only.`);
	}
	const narratedProbe = transcript.find(event => event.kind === 'assistant' && event.purpose !== 'searchSummary' && event.purpose !== 'recovery' && /\b(?:gh|github cli|authenticated|authentication|sign[ -]?in|installed)\b/iu.test(event.text ?? ''));
	if (narratedProbe) {
		violations.push(`${searchCase.id}: Internal GitHub CLI capability probing was narrated to the user.`);
	}
	const setupRequest = transcript.find(event => event.kind === 'assistant' && /(?:\b(?:install|download)\b.{0,30}\b(?:gh|github cli)\b)|(?:\b(?:authenticate|log[ -]?in|sign[ -]?in)\b.{0,30}\b(?:gh|github)\b)|(?:\b(?:gh|github)\b.{0,30}\b(?:authenticate|log[ -]?in|sign[ -]?in)\b)|(?:\b(?:create|register)\b.{0,20}\b(?:github )?account\b)/iu.test(event.text ?? ''));
	if (setupRequest) {
		violations.push(`${searchCase.id}: Search flow asks the user to install GitHub CLI, sign in, or create an account.`);
	}
	for (const event of transcript) {
		if (event.kind === 'action' || event.kind === 'toolCall') {
			violations.push(`${searchCase.id}: Search-only flow performed forbidden action ${event.name}.`);
		}
	}
	const publishedOutcome = transcript.find(event => event.kind === 'outcome' && event.published !== false);
	if (publishedOutcome) {
		violations.push(`${searchCase.id}: Search-only flow did not explicitly remain unpublished.`);
	}
}

/** Evaluates a deterministic Issue Wizard duplicate-search scenario. */
export function evaluateSearchScenario(scenario) {
	const violations = [];
	if (scenario.repository !== 'microsoft/vscode') {
		violations.push('Scenario repository is not microsoft/vscode.');
	}
	if (!Array.isArray(scenario.cases) || scenario.cases.length === 0) {
		violations.push('Scenario must contain at least one search case.');
		return { passed: false, violations };
	}
	for (const [index, searchCase] of scenario.cases.entries()) {
		if (!searchCase || typeof searchCase.id !== 'string' || !searchCase.input || !Array.isArray(searchCase.transcript) || !searchCase.expected) {
			violations.push(`Scenario case at index ${index} is malformed.`);
			continue;
		}
		evaluateTransport(searchCase, violations);
		evaluateBroadening(searchCase, violations);
		evaluatePresentation(searchCase, violations);
		evaluateRecovery(searchCase, violations);
		evaluateSafety(searchCase, violations);
	}
	return {
		passed: violations.length === 0,
		violations
	};
}
