/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Value } from '@sinclair/typebox/value';
import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsCitationManager } from '../citationManager';
import { ICompletionsLogTargetService } from '../logger';
import { ICompletionsTextDocumentManagerService } from '../textDocumentManager';
import * as Snippy from './';
import * as SnippyCompute from './compute';
import { codeReferenceLogger } from './logger';
import { MatchError } from './snippy.proto';
import { snippyTelemetry } from './telemetryHandlers';

function isError(payload: unknown): payload is MatchError {
	return Value.Check(MatchError, payload);
}

async function snippyRequest<T>(accessor: ServicesAccessor, requestFn: () => T): Promise<ReturnType<typeof requestFn> | undefined> {
	const instantiationService = accessor.get(IInstantiationService);
	const res = await requestFn();

	if (isError(res)) {
		snippyTelemetry.handleSnippyNetworkError({
			instantiationService,
			origin: String(res.code),
			reason: res.reason,
			message: res.msg,
		});

		return;
	}

	return res;
}

function isMatchError<T extends object>(response: T | MatchError): response is MatchError {
	return 'kind' in response && response.kind === 'failure';
}

export async function fetchCitations(accessor: ServicesAccessor, uri: string, completionText: string, insertionOffset: number) {
	const instantiationService = accessor.get(IInstantiationService);
	const logTarget = accessor.get(ICompletionsLogTargetService);
	const documentManager = accessor.get(ICompletionsTextDocumentManagerService);
	const citationManager = accessor.get(ICompletionsCitationManager);
	const insertionDoc = await documentManager.getTextDocument({ uri });

	// If the match occurred in a file that no longer exists, bail.
	if (!insertionDoc) {
		codeReferenceLogger.debug(logTarget, `Expected document matching ${uri}, got nothing.`);
		return;
	}

	// The document text will include the completion at this point
	const docText = insertionDoc.getText();

	// If the document + the completion isn't long enough, we know we shouldn't call snippy
	if (!SnippyCompute.hasMinLexemeLength(docText)) {
		return;
	}

	// If the document + the completion isn't long enough, we know we shouldn't call snippy
	if (!SnippyCompute.hasMinLexemeLength(docText)) {
		return;
	}

	let potentialMatchContext = completionText;

	// In many cases, we will get completion that is shorter than 65 tokens,
	// e.g. a single line or word completion.
	// When a completion is too short, we should try and get the preceding tokens and
	// pass that to snippy as part of the context.
	if (!SnippyCompute.hasMinLexemeLength(completionText)) {
		const textWithoutCompletion = docText.slice(0, insertionOffset);
		const minLexemeStartOffset = SnippyCompute.offsetLastLexemes(
			textWithoutCompletion,
			SnippyCompute.MinTokenLength
		);
		potentialMatchContext = docText.slice(minLexemeStartOffset, insertionOffset + completionText.length);
	}

	// Depending on where in the document the suggestion was inserted, we may still not have enough context
	// to detect a match.
	if (!SnippyCompute.hasMinLexemeLength(potentialMatchContext)) {
		return;
	}

	const matchResponse = await instantiationService.invokeFunction(acc => snippyRequest(acc, () => Snippy.Match(acc, potentialMatchContext)));

	if (!matchResponse || isMatchError(matchResponse) || !matchResponse.snippets.length) {
		// No match response from Snippy
		codeReferenceLogger.info(logTarget, 'No match found');
		return;
	}

	codeReferenceLogger.info(logTarget, 'Match found');

	const { snippets } = matchResponse;

	const citationPromises = snippets.map(async snippet => {
		const response = await instantiationService.invokeFunction(acc => snippyRequest(acc, () => Snippy.FilesForMatch(acc, { cursor: snippet.cursor })));

		if (!response || isMatchError(response)) {
			return;
		}

		const files = response.file_matches;
		const licenseStats = response.license_stats;

		return {
			match: snippet,
			files,
			licenseStats,
		};
	});

	const citations = await Promise.all(citationPromises);
	const filtered = citations.filter(c => c !== undefined);
	// This shouldn't ever happen, but we should handle it nonetheless.
	if (!filtered.length) {
		return;
	}

	for (const citation of filtered) {
		const licensesSet = new Set(Object.keys(citation.licenseStats?.count ?? {}));

		if (licensesSet.has('NOASSERTION')) {
			licensesSet.delete('NOASSERTION');
			licensesSet.add('unknown');
		}

		const allLicenses = Array.from(licensesSet).sort();

		const offsetStart = insertionOffset;
		const offsetEnd = insertionOffset + citation.match.matched_source.length;

		const start = insertionDoc.positionAt(offsetStart);
		const end = insertionDoc.positionAt(offsetEnd);
		await citationManager.handleIPCodeCitation({
			inDocumentUri: uri,
			offsetStart,
			offsetEnd,
			version: insertionDoc.version,
			location: { start, end },
			matchingText: potentialMatchContext,
			details: allLicenses.map(license => ({
				license,
				url: citation.match.github_url,
			})),
		});
	}
}
