/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../log/common/logService';
import * as SnippyCompute from './snippyCompute';
import { SnippyFetchService } from './snippyFetcher';
import { SnippyNotifier } from './snippyNotifier';
import { ISnippyService } from './snippyService';
import * as types from './snippyTypes';

export class SnippyService implements ISnippyService {
	_serviceBrand: undefined;

	private readonly notifier: SnippyNotifier;
	private readonly fetcher: SnippyFetchService;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		this.notifier = this.instantiationService.createInstance(SnippyNotifier);
		this.fetcher = this.instantiationService.createInstance(SnippyFetchService);
	}

	public async handlePostInsertion(documentUri: URI, documentBeforeEdits: StringText, singleEdit: StringReplacement): Promise<void> {

		const sourceToCheck = this.computeSourceToCheck(documentBeforeEdits, singleEdit);
		if (!sourceToCheck) {
			return;
		}

		const matchResponse = await this.fetcher.fetchMatch(sourceToCheck.source, CancellationToken.None);
		if (!matchResponse) {
			throw new Error(`Failed to parse match response: ${matchResponse}`);
		}
		if (matchResponse.isError()) {
			throw new Error(`Failed to match: ${matchResponse.err.msg}`);
		}
		if (matchResponse.val.snippets.length === 0) {
			// no match found
			return;
		}

		const { snippets } = matchResponse.val;

		const citationPromises = snippets.map(async (snippet) => {
			const response = await this.fetcher.fetchFilesForMatch(snippet.cursor, CancellationToken.None);
			if (!response) {
				throw new Error(`Failed to parse files-for-match response: ${response}`);
			}
			if (response.isError()) {
				throw new Error(`Failed to fetch files for match: ${response.err.msg}`);
			}
			const { file_matches: files, license_stats: licenseStats } = response.val;
			return {
				match: snippet,
				files,
				licenseStats
			} satisfies types.SnippetStatistics;
		});

		this.notifier.notify();

		const citations = await Promise.all(citationPromises);
		for (const citation of citations) {
			const licensesSet = new Set(Object.keys(citation.licenseStats?.count ?? {}));

			if (licensesSet.delete('NOASSERTION')) {
				licensesSet.add('unknown');
			}

			const allLicenses = Array.from(licensesSet).sort();

			const matchLocation = `[Ln ${sourceToCheck.startPosition.lineNumber}, Col ${sourceToCheck.startPosition.column}]`;
			const shortenedMatchText = `${citation.match.matched_source
				.slice(0, 100)
				.replace(/[\r\n\t]+|^[ \t]+/gm, ' ')
				.trim()}...`;

			this.logService.info([
				'[CODE REFERENCING]',
				documentUri,
				`Similar code with ${pluralize(allLicenses.length, 'license type')}`,
				`[${allLicenses.join(', ')}]`,
				`${citation.match.github_url.replace(/,\s*$/, '')}&editor=vscode`,
				matchLocation,
				shortenedMatchText
			].join(' '));
		}
	}

	private computeSourceToCheck(documentBeforeEdits: StringText, singleEdit: StringReplacement) {

		if (singleEdit.newText === '') { // If the edit is a deletion, snippy shouldn't do anything (?)
			return;
		}

		const edit = StringEdit.single(singleEdit);
		const newRanges = edit.getNewRanges();
		const newTotalRange = newRanges.reduce((acc, range) => acc.join(range));
		const documentAfterEdits = edit.applyOnText(documentBeforeEdits);

		const sourceToCheck = SnippyCompute.computeMatchSource(documentAfterEdits.value.slice(0, newTotalRange.start), singleEdit.newText);
		if ('reason' in sourceToCheck) {
			this.logService.debug(`Skipping Snippy check: ${sourceToCheck.reason}`);
			return;
		}

		const trans = documentAfterEdits.getTransformer();
		const startPosition = trans.getPosition(sourceToCheck.startOffset);

		return {
			source: sourceToCheck.source,
			startPosition,
		};
	}

}

const pluralize = (count: number, noun: string, suffix = 's') => `${count} ${noun}${count !== 1 ? suffix : ''}`;
