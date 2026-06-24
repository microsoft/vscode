/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrowRight12Regular } from '@fluentui/react-icons';
import * as fs from 'fs';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { ScoreCardByLanguage, parseScoreCardByLanguage } from '../stores/amlResults';
import { AMLProvider } from '../stores/amlSimulations';

export const ScorecardByLanguage = mobxlite.observer(
	({ amlProvider }: { amlProvider: AMLProvider }) => {

		const [scoreCardByLanguage, setScoreCardByLanguage] = React.useState<ScoreCardByLanguage[] | null>(null);
		const [compareScoreCardByLanguage, setCompareScoreCardByLanguage] = React.useState<ScoreCardByLanguage[] | null>(null);
		const [expanded, setExpanded] = React.useState<boolean>(true);

		React.useEffect(() => {
			(async () => {
				if (!amlProvider.selected || !amlProvider.selected.scoreCardByLanguageJsonPath) {
					setScoreCardByLanguage(null);
				} else {
					const scoreCardByLanguage = parseScoreCardByLanguage(await fs.promises.readFile(amlProvider.selected.scoreCardByLanguageJsonPath, 'utf8'));
					setScoreCardByLanguage(scoreCardByLanguage);

					if (!amlProvider.compareAgainstRun || !amlProvider.compareAgainstRun.scoreCardByLanguageJsonPath) {
						setCompareScoreCardByLanguage(null);
					} else {
						const compareScoreCardByLanguage = parseScoreCardByLanguage(await fs.promises.readFile(amlProvider.compareAgainstRun.scoreCardByLanguageJsonPath, 'utf8'));
						setCompareScoreCardByLanguage(compareScoreCardByLanguage);
					}
				}
			})();
		}, [amlProvider.selected, amlProvider.compareAgainstRun]);

		const formatPercentage = (value: number) => {
			return `${(value * 100).toFixed(2)}%`;
		};

		const getHighlightStyle = (selectedValue: number, compareValue: number) => {
			if (selectedValue === compareValue) {
				return {};
			}
			return { color: selectedValue > compareValue ? 'green' : 'red' };
		};

		const getCompareScore = (language: string, field: keyof ScoreCardByLanguage) => {
			const compareScore = compareScoreCardByLanguage?.find(score => score.language === language);
			return compareScore ? compareScore[field] : '-';
		};

		return scoreCardByLanguage && (
			<div className='scorecard-container'>
				<span className='scorecard-header' onClick={() => setExpanded(!expanded)}>
					<span style={{ fontSize: '0.7em' }}>{expanded ? '▼' : '▶'}</span> Score Card per Language
				</span>
				{expanded && (
					<table className='scorecard-table'>
						<thead>
							<tr>
								<th>Language</th>
								<th>Total Test Cases</th>
								<th>Scored Cases</th>
								<th>Unscored Cases</th>
								<th>Mean Score</th>
							</tr>
						</thead>
						<tbody>
							{scoreCardByLanguage.map((score, index) => (
								<tr key={index}>
									<td>{score.language}</td>
									<td>{compareScoreCardByLanguage ? <>{getCompareScore(score.language, 'testCasesCount')}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{score.testCasesCount}</td>
									<td>{compareScoreCardByLanguage ? <>{getCompareScore(score.language, 'scoredCount')}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{score.scoredCount}</td>
									<td>{compareScoreCardByLanguage ? <>{getCompareScore(score.language, 'unscoredCount')}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{score.unscoredCount}</td>
									<td style={compareScoreCardByLanguage ? getHighlightStyle(score.meanScore, getCompareScore(score.language, 'meanScore') as number) : {}}>
										{compareScoreCardByLanguage ? <>{formatPercentage(getCompareScore(score.language, 'meanScore') as number)}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{formatPercentage(score.meanScore)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		);
	}
);
