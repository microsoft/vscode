/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './outputRun.css';

import React, { CSSProperties, MouseEvent } from 'react';

import { localize } from '../../../nls.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import * as platform from '../../../base/common/platform.js';
import { toLocalResource } from '../../../base/common/resources.js';
import { ANSIColor, ANSIOutputRun, ANSIStyle } from '../../../base/common/ansiOutput.js';
import { OutputRunWithLinks } from '../../contrib/erdosConsole/browser/components/utilityComponents.js';
import { useErdosReactServicesContext } from '../../../base/browser/erdosReactRendererContext.js';

const numberRegex = /^\d+$/;
const fileURLThatNeedsASlash = /^(file:\/\/)([a-zA-Z]:)/;
const fileURLWithLine = /^(file:\/\/\/.+):(\d+)$/;
const fileURLWithLineAndColumn = /^(file:\/\/\/.+):(\d+):(\d+)$/;

export interface OutputRunProps {
	readonly outputRun: ANSIOutputRun;
}

enum ColorType {
	Foreground,
	Background
}

export const OutputRun = (props: OutputRunProps) => {
	const services = useErdosReactServicesContext();

	const buildHyperlinkURL = () => {
		if (!props.outputRun.hyperlink) {
			return undefined;
		}

		let url = props.outputRun.hyperlink.url;
		let uri: URI;
		try {
			uri = URI.parse(url);
		} catch (e) {
			console.error('Failed to parse URL:', e);
			return url;
		}

		if (uri.scheme !== Schemas.file) {
			return url;
		}

		if (platform.isWindows) {
			url = url
				.replace(/\\/g, '/')
				.replace(fileURLThatNeedsASlash, '$1/$2');
		}

		if (platform.isWeb) {
			uri = toLocalResource(
				uri,
				services.workbenchEnvironmentService.remoteAuthority,
				services.pathService.defaultUriScheme
			);
			url = uri.toString();
		}

		const line = props.outputRun.hyperlink.params?.get('line') || undefined;
		if (!line) {
			{
				const match = url.match(fileURLWithLineAndColumn);
				if (match && match.length === 4) {
					return `${match[1]}#${match[2]},${match[3]}`;
				}
			}

			{
				const match = url.match(fileURLWithLine);
				if (match && match.length === 3) {
					return `${match[1]}#${match[2]},1`;
				}
			}

			return url;
		}
		const lineMatch = line.match(numberRegex);
		if (!lineMatch) {
			return url;
		}

		url += `#${lineMatch[0]}`;

		const col = props.outputRun.hyperlink.params?.get('col') || undefined;
		if (!col) {
			return url;
		}
		const colMatch = col.match(numberRegex);
		if (!colMatch) {
			return url;
		}

		url += `,${colMatch[0]}`;

		return url;
	};

	const hyperlinkClickHandler = (e: MouseEvent<HTMLElement>) => {
		e.preventDefault();
		e.stopPropagation();

		const url = buildHyperlinkURL();
		if (url) {
			services.openerService.open(url);
		} else {
			services.notificationService.error(localize(
				'erdos.unableToOpenHyperlink',
				"The hyperlink could not be opened."
			));
		}
	};

	const computeStyles = (styles?: ANSIStyle[]): CSSProperties => {
		let cssProperties: CSSProperties = {};
		if (styles) {
			styles.forEach(style => {
				switch (style) {
					case ANSIStyle.Bold: {
						cssProperties = {
							...cssProperties,
							...{
								fontWeight: 'bold'
							}
						};
						break;
					}

					case ANSIStyle.Dim: {
						cssProperties = {
							...cssProperties,
							...{
								fontWeight: 'lighter'
							}
						};
						break;
					}

					case ANSIStyle.Italic: {
						cssProperties = {
							...cssProperties,
							...{
								fontStyle: 'italic'
							}
						};
						break;
					}

					case ANSIStyle.Underlined: {
						cssProperties = {
							...cssProperties,
							...{
								textDecorationLine: 'underline',
								textDecorationStyle: 'solid'
							}
						};
						break;
					}

					case ANSIStyle.SlowBlink: {
						cssProperties = {
							...cssProperties,
							...{
								animation: 'erdosOutputRun-blink 1s linear infinite'
							}
						};
						break;
					}

					case ANSIStyle.RapidBlink: {
						cssProperties = {
							...cssProperties,
							...{
								animation: 'erdosOutputRun-blink 0.5s linear infinite'
							}
						};
						break;
					}

					case ANSIStyle.Hidden: {
						cssProperties = {
							...cssProperties,
							...{
								visibility: 'hidden'
							}
						};
						break;
					}

					case ANSIStyle.CrossedOut: {
						cssProperties = {
							...cssProperties,
							...{
								textDecorationLine: 'line-through',
								textDecorationStyle: 'solid'
							}
						};
						break;
					}

					case ANSIStyle.DoubleUnderlined: {
						cssProperties = {
							...cssProperties,
							...{
								textDecorationLine: 'underline',
								textDecorationStyle: 'double'
							}
						};
						break;
					}
				}
			});
		}

		return cssProperties;
	};

	const computeForegroundBackgroundColor = (
		colorType: ColorType,
		color?: ANSIColor | string
	): CSSProperties => {
		switch (color) {
			case undefined: {
				return {};
			}

			case ANSIColor.Black:
			case ANSIColor.Red:
			case ANSIColor.Green:
			case ANSIColor.Yellow:
			case ANSIColor.Blue:
			case ANSIColor.Magenta:
			case ANSIColor.Cyan:
			case ANSIColor.White:
			case ANSIColor.BrightBlack:
			case ANSIColor.BrightRed:
			case ANSIColor.BrightGreen:
			case ANSIColor.BrightYellow:
			case ANSIColor.BrightBlue:
			case ANSIColor.BrightMagenta:
			case ANSIColor.BrightCyan:
			case ANSIColor.BrightWhite: {
				if (colorType === ColorType.Foreground) {
					return { color: `var(--vscode-erdosConsole-${color})` };
				} else {
					return { background: `var(--vscode-erdosConsole-${color})` };
				}
			}

			default: {
				if (colorType === ColorType.Foreground) {
					return { color: color };
				} else {
					return { background: color };
				}
			}
		}
	};

	const computeCSSProperties = (outputRun: ANSIOutputRun): CSSProperties => {
		return !outputRun.format ?
			{} :
			{
				...computeStyles(outputRun.format.styles),
				...computeForegroundBackgroundColor(
					ColorType.Foreground,
					outputRun.format.foregroundColor
				),
				...computeForegroundBackgroundColor(
					ColorType.Background,
					outputRun.format.backgroundColor
				),
			};
	};

	if (!props.outputRun.hyperlink) {
		if (props.outputRun.text.indexOf('http') === -1) {
			return (
				<span className='output-run' style={computeCSSProperties(props.outputRun)}>
					{props.outputRun.text}
				</span>
			);
		} else {
			return (
				<span className='output-run' style={computeCSSProperties(props.outputRun)}>
					<OutputRunWithLinks text={props.outputRun.text} />
				</span>
			);
		}
	} else {
		return (
			<a className='output-run-hyperlink' href='#' onClick={hyperlinkClickHandler}>
				<span className='output-run' style={computeCSSProperties(props.outputRun)}>
					{props.outputRun.text}
				</span>
			</a>
		);
	}
};