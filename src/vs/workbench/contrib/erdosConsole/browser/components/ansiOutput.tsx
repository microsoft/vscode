/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './ansiOutput.css';

import React, { CSSProperties } from 'react';
import { ANSIOutputLine, ANSIOutputRun, ANSIStyle } from '../../../../services/erdosConsole/browser/ansiOutput.js';
import { OutputRunWithLinks } from './utilityComponents.js';

interface AnsiOutputLinesProps {
	readonly outputLines: readonly ANSIOutputLine[];
}

export const AnsiOutputLines = (props: AnsiOutputLinesProps) => {
	return (
		<div>
			{props.outputLines.map(outputLine => (
				<div key={outputLine.id}>
					<AnsiOutputLine outputLine={outputLine} />
				</div>
			))}
		</div>
	);
};

interface AnsiOutputLineProps {
	readonly outputLine: ANSIOutputLine;
}

export const AnsiOutputLine = (props: AnsiOutputLineProps) => {
	return (
		<span>
			{props.outputLine.outputRuns.map(run => (
				<AnsiOutputRun key={run.id} outputRun={run} />
			))}
		</span>
	);
};

interface AnsiOutputRunProps {
	readonly outputRun: ANSIOutputRun;
}

const AnsiOutputRun = (props: AnsiOutputRunProps) => {
	const computeStyles = (): CSSProperties => {
		const cssProperties: CSSProperties = {};
		const format = props.outputRun.format;

		if (!format) {
			return cssProperties;
		}

		if (format.styles) {
			format.styles.forEach(style => {
				switch (style) {
					case ANSIStyle.Bold:
						cssProperties.fontWeight = 'bold';
						break;
					case ANSIStyle.Dim:
						cssProperties.opacity = 0.4;
						break;
					case ANSIStyle.Italic:
						cssProperties.fontStyle = 'italic';
						break;
					case ANSIStyle.Underlined:
						cssProperties.textDecorationLine = 'underline';
						cssProperties.textDecorationStyle = 'solid';
						break;
					case ANSIStyle.SlowBlink:
						cssProperties.animation = 'code-blink-key 1s cubic-bezier(1, 0, 0, 1) infinite alternate';
						break;
					case ANSIStyle.RapidBlink:
						cssProperties.animation = 'code-blink-key 0.3s cubic-bezier(1, 0, 0, 1) infinite alternate';
						break;
					case ANSIStyle.Hidden:
						cssProperties.opacity = 0;
						break;
					case ANSIStyle.CrossedOut:
						cssProperties.textDecorationLine = 'line-through';
						cssProperties.textDecorationStyle = 'solid';
						break;
					case ANSIStyle.DoubleUnderlined:
						cssProperties.textDecorationLine = 'underline';
						cssProperties.textDecorationStyle = 'double';
						break;
					case ANSIStyle.Overlined:
						cssProperties.textDecorationLine = 'overline';
						cssProperties.textDecorationStyle = 'solid';
						break;
				}
			});
		}

		if (format.foregroundColor) {
			if (typeof format.foregroundColor === 'string' && !format.foregroundColor.startsWith('ansi')) {
				cssProperties.color = format.foregroundColor;
			} else {
				cssProperties.color = `var(--vscode-erdosConsole-${format.foregroundColor})`;
			}
		}

		if (format.backgroundColor) {
			if (typeof format.backgroundColor === 'string' && !format.backgroundColor.startsWith('ansi')) {
				cssProperties.backgroundColor = format.backgroundColor;
			} else {
				cssProperties.backgroundColor = `var(--vscode-erdosConsole-${format.backgroundColor})`;
			}
		}

		return cssProperties;
	};

	const text = props.outputRun.text;
	const styles = computeStyles();

	if (text.indexOf('http') !== -1) {
		return <span style={styles}><OutputRunWithLinks text={text} /></span>;
	}

	return <span style={styles}>{text}</span>;
};
