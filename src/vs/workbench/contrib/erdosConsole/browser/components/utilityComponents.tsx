/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

import { ANSIOutputLine } from '../../../../../base/common/ansiOutput.js';
import { OutputLines } from '../../../../browser/erdosAnsiRenderer/outputLines.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { detectHyperlinks } from '../../common/linkDetector.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

export interface ConsoleOutputLinesProps {
	readonly outputLines: readonly ANSIOutputLine[];
}

export const ConsoleOutputLines = (props: ConsoleOutputLinesProps) => {
	return <OutputLines {...props} />;
};

export interface OutputRunWithLinksProps {
	readonly text: string;
}

export const OutputRunWithLinks = (props: OutputRunWithLinksProps) => {
	const services = useErdosReactServicesContext();

	const clickHandler = async (url: string) => {
		let uri: URI | undefined;
		try {
			uri = URI.parse(url);
		} catch (err) {
			services.notificationService.warn(
				localize('invalidUri', 'The URL "{0}" is invalid: {1}', url, err));
			return;
		}

		services.openerService.open(uri, {
			fromUserGesture: true,
			openExternal: true,
			allowContributedOpeners: true,
		});
	};

	const hyperlinkMatch = detectHyperlinks(props.text);
	if (hyperlinkMatch) {
		const parts = [];
		let lastIndex = 0;
		for (const match of hyperlinkMatch) {
			parts.push(props.text.substring(lastIndex, props.text.indexOf(match)));
			lastIndex = props.text.indexOf(match) + match.length;

			parts.push(
				<a
					key={match}
					className='output-run-hyperlink'
					href='#'
					onClick={clickHandler.bind(null, match)}
				>
					{match}
				</a>
			);
		}

		parts.push(props.text.substring(lastIndex));
		return <React.Fragment>{parts}</React.Fragment>;

	} else {
		return <React.Fragment>{props.text}</React.Fragment>;
	}
};
