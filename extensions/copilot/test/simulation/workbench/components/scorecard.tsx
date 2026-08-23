/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrowRight12Regular } from '@fluentui/react-icons';
import * as fs from 'fs';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { ScoreCard, parseScoreCard } from '../stores/amlResults';
import { AMLProvider } from '../stores/amlSimulations';

export const Scorecard = mobxlite.observer(
	({ amlProvider }: { amlProvider: AMLProvider }) => {

		const [scorecard, setScorecard] = React.useState<ScoreCard | null>(null);
		const [compareScorecard, setCompareScorecard] = React.useState<ScoreCard | null>(null);
		const [expanded, setExpanded] = React.useState<boolean>(true);

		React.useEffect(() => {
			(async () => {
				if (!amlProvider.selected || !amlProvider.selected.scoreCardCsvPath) {
					setScorecard(null);
				} else {
					const scorecard = parseScoreCard(await fs.promises.readFile(amlProvider.selected.scoreCardCsvPath, 'utf8'));
					setScorecard(scorecard);
				}

				if (!amlProvider.compareAgainstRun || !amlProvider.compareAgainstRun.scoreCardCsvPath) {
					setCompareScorecard(null);
				} else {
					const compareScorecard = parseScoreCard(await fs.promises.readFile(amlProvider.compareAgainstRun.scoreCardCsvPath, 'utf8'));
					setCompareScorecard(compareScorecard);
				}
			})();
		}, [amlProvider.selected, amlProvider.compareAgainstRun]);

		const getHighlightStyle = (selectedValue: number, compareValue: number, isHigherBetter: boolean) => {
			if (selectedValue === compareValue) {
				return {};
			}
			const isBetter: boolean = isHigherBetter ? selectedValue > compareValue : selectedValue < compareValue;
			return { color: isBetter ? 'green' : 'red' };
		};

		return scorecard && (
			<div className='scorecard-container'>
				<span className='scorecard-header' onClick={() => setExpanded(!expanded)}>
					<span style={{ fontSize: '0.7em' }}>{expanded ? '▼' : '▶'}</span> Score Card
				</span>
				{expanded && (
					<table className='scorecard-table'>
						<thead>
							<tr>
								<th>Metric</th>
								<th>Mean</th>
								<th>Median</th>
								<th>Standard Error</th>
								<th>Confidence Interval</th>
								<th>Count</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>{scorecard.metric}</td>
								<td style={compareScorecard ? getHighlightStyle(scorecard.mean, compareScorecard.mean, true) : {}}>
									{compareScorecard ? <>{compareScorecard.mean}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{scorecard.mean}
								</td>
								<td style={compareScorecard ? getHighlightStyle(scorecard.median, compareScorecard.median, true) : {}}>
									{compareScorecard ? <>{compareScorecard.median}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{scorecard.median}
								</td>
								<td style={compareScorecard ? getHighlightStyle(scorecard.stdErr, compareScorecard.stdErr, false) : {}}>
									{compareScorecard ? <>{compareScorecard.stdErr}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{scorecard.stdErr}
								</td>
								<td>
									{compareScorecard ? <>[{compareScorecard.confidenceInterval[0]}, {compareScorecard.confidenceInterval[1]}]<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}[{scorecard.confidenceInterval[0]}, {scorecard.confidenceInterval[1]}]
								</td>
								<td>{compareScorecard ? <>{compareScorecard.count}<ArrowRight12Regular style={{ verticalAlign: 'middle' }} /></> : ''}{scorecard.count}</td>
							</tr>
						</tbody>
					</table>
				)}
			</div>
		);
	}
);
