/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { TestRun } from '../stores/testRun';
import { Editor } from './editor';

type Props = {
	readonly run: TestRun;
	readonly baseline: TestRun | undefined;
	readonly expand: boolean;
};

export const OutputView = mobxlite.observer(({ run, baseline, expand }: Props) => {

	const [expanded, setExpanded] = React.useState(expand);

	function ensureOutputValue(value: string | undefined): string {
		if (value) {
			return value;
		}

		return '';
	}

	return (
		<div className='request-container'>
			<div className='title' onClick={() => setExpanded(!expanded)}>
				{expanded ? '▼' : '▶'} Output
			</div>
			{
				!expanded
					? null
					: (
						<div className='request-details' style={{ borderLeft: '1px solid #ccc', marginLeft: '7px', paddingLeft: '5px' }}>
							{
								!(run.stdout || (baseline && baseline.stdout))
									? null
									: (
										<>
											<h3>stdout</h3>
											{
												baseline
													? (
														<>
															<h4>stdout from "Compare against" run</h4>
															<div style={{ marginLeft: '-10px' }}>
																<Editor lineNumbers={false} languageId='markdown' contents={ensureOutputValue(baseline.stdout)} />
															</div>
														</>
													)
													: null
											}
											<h4>stdout from "Current" run</h4>
											<div style={{ marginLeft: '-10px' }}>
												<Editor lineNumbers={false} languageId='markdown' contents={ensureOutputValue(run.stdout)} />
											</div>

										</>
									)
							}
							{
								!(run.stderr || (baseline && baseline.stderr))
									? null
									: (
										<>
											<h3>stderr</h3>
											{
												baseline
													? (
														<>
															<h4>stderr from "Compare against" run</h4>
															<div style={{ marginLeft: '-10px' }}>
																<Editor lineNumbers={false} languageId='markdown' contents={ensureOutputValue(baseline.stderr)} />
															</div>
														</>
													)
													: null
											}
											<h4>stderr from "Current" run</h4>
											<div style={{ marginLeft: '-10px' }}>
												<Editor lineNumbers={false} languageId='markdown' contents={ensureOutputValue(run.stderr)} />
											</div>
										</>
									)
							}
						</div>
					)
			}
		</div>
	);
});
