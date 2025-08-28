/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './components.css';

import React, { useEffect, useState, KeyboardEvent, useRef } from 'react';

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { LineTokens } from '../../../../../editor/common/tokens/lineTokens.js';
import { ViewLineRenderingData } from '../../../../../editor/common/viewModel.js';
import { OutputRun } from '../../../../browser/erdosAnsiRenderer/outputRun.js';
import { erdosClassNames } from '../../../../../base/common/erdosUtilities.js';
import { RenderLineInput, renderViewLine2 } from '../../../../../editor/common/viewLayout/viewLineRenderer.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { ILanguageIdCodec, ITokenizationSupport, TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { IErdosConsoleInstance } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { ActivityItemInput, ActivityItemInputState } from '../../../../services/erdosConsole/browser/classes/activityItems.js';
import { ttPolicy } from '../erdosConsolePolicy.js';
import { ConsoleOutputLines } from './utilityComponents.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { ActivityItemPrompt, ActivityItemPromptState, ActivityItemStream, ActivityItemOutputHtml } from '../../../../services/erdosConsole/browser/classes/activityItems.js';
import { renderHtml } from '../../../../../base/browser/erdos/renderHtml.js';
import { ActivityItemOutputMessage, ActivityItemOutputPlot } from '../../../../services/erdosConsole/browser/classes/activityItems.js';
import * as nls from '../../../../../nls.js';
import { localize } from '../../../../../nls.js';
import { ErdosButton } from '../../../../../base/browser/ui/erdosComponents/button/erdosButton.js';
import { ActivityItemErrorMessage } from '../../../../services/erdosConsole/browser/classes/activityItems.js';

const colorizeCodeOutoutLines = (
	codeOutputLines: string[],
	tokenizationSupport: ITokenizationSupport,
	languageIdCodec: ILanguageIdCodec
) => {
	const colorizedOutputLines: TrustedHTML[] = [];

	if (!ttPolicy) {
		return colorizedOutputLines;
	}

	let state = tokenizationSupport.getInitialState();

	codeOutputLines.forEach(codeOutputLine => {
		const tokenizeResult = tokenizationSupport.tokenizeEncoded(codeOutputLine, true, state);
		LineTokens.convertToEndOffset(tokenizeResult.tokens, codeOutputLine.length);
		const lineTokens = new LineTokens(tokenizeResult.tokens, codeOutputLine, languageIdCodec);
		const isBasicASCII = ViewLineRenderingData.isBasicASCII(codeOutputLine, true);
		const containsRTL = ViewLineRenderingData.containsRTL(codeOutputLine, isBasicASCII, true);
		const renderLineInput = new RenderLineInput(
			false,
			true,
			codeOutputLine,
			false,
			isBasicASCII,
			containsRTL,
			0,
			lineTokens.inflate(),
			[],
			0,
			0,
			0,
			0,
			0,
			-1,
			'none',
			false,
			false,
			null,
			null,
			0
		);

		const renderLineOutput = renderViewLine2(renderLineInput);

		colorizedOutputLines.push(ttPolicy!.createHTML(renderLineOutput.html));

		state = tokenizeResult.endState;
	});

	return colorizedOutputLines;
};

export interface ActivityInputProps {
	fontInfo: FontInfo;
	activityItemInput: ActivityItemInput;
	erdosConsoleInstance: IErdosConsoleInstance;
}

export const ActivityInput = (props: ActivityInputProps) => {
	const services = useErdosReactServicesContext();

	const [state, setState] = useState(props.activityItemInput.state);
	const [colorizedOutputLines, setColorizedOutputLines] = useState<TrustedHTML[]>([]);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.activityItemInput.onStateChanged(() => {
			setState(props.activityItemInput.state);
		}));

		return () => disposableStore.dispose();
	}, [props.activityItemInput]);

	useEffect(() => {
		const colorizeLines = async () => {
			if (!props.erdosConsoleInstance.attachedRuntimeSession) {
				setColorizedOutputLines([]);
				return;
			}

			const tokenizationSupport = await TokenizationRegistry.getOrCreate(
				props.erdosConsoleInstance.attachedRuntimeSession.runtimeMetadata.languageId
			);

			if (!tokenizationSupport) {
				setColorizedOutputLines([]);
				return;
			}

			const codeOutputLines: string[] = [];
			for (let i = 0; i < props.activityItemInput.codeOutputLines.length; i++) {
				const outputRuns = props.activityItemInput.codeOutputLines[i].outputRuns;

				if (outputRuns.length === 0) {
					codeOutputLines.push('');
				} else if (outputRuns.length === 1 && outputRuns[0].format === undefined) {
					codeOutputLines.push(outputRuns[0].text);
				} else {
					setColorizedOutputLines([]);
					return;
				}
			}

			setColorizedOutputLines(colorizeCodeOutoutLines(
				codeOutputLines,
				tokenizationSupport,
				services.languageService.languageIdCodec
			));
		};

		colorizeLines();
	}, [props.activityItemInput.codeOutputLines, props.erdosConsoleInstance.attachedRuntimeSession, services.languageService.languageIdCodec]);

	const promptLength = Math.max(
		props.activityItemInput.inputPrompt.length,
		props.activityItemInput.continuationPrompt.length
	) + 1;

	const promptWidth = Math.round(promptLength * props.fontInfo.typicalHalfwidthCharacterWidth);

	const classNames = erdosClassNames(
		'activity-input',
		{ 'executing': state === ActivityItemInputState.Executing },
		{ 'cancelled': state === ActivityItemInputState.Cancelled }
	);

	const Prompt = ({ index }: { index: number }) => {
		return (
			<span className='prompt' style={{ width: promptWidth }}>
				{(index === 0 ?
					props.activityItemInput.inputPrompt :
					props.activityItemInput.continuationPrompt) + ' '
				}
			</span>
		);
	}

	if (colorizedOutputLines.length) {
		return (
			<div className={classNames}>
				{state === ActivityItemInputState.Executing && <div className='progress-bar' />}
				{colorizedOutputLines.map((outputLine, index) =>
					<div key={`outputLine-${index}`}>
						<Prompt index={index} />
						<span
							dangerouslySetInnerHTML={{ __html: outputLine }}
							key={`colorizedOutputLine-${index}`}
						/>
					</div>
				)}
			</div>
		);
	} else {
		return (
			<div className={classNames}>
				{state === ActivityItemInputState.Executing && <div className='progress-bar' />}
				{props.activityItemInput.codeOutputLines.map((outputLine, index) =>
					<div key={outputLine.id}>
						<Prompt index={index} />
						{outputLine.outputRuns.map(outputRun =>
							<OutputRun key={outputRun.id} outputRun={outputRun} />
						)}
					</div>
				)}
			</div>
		);
	}
};

export interface ActivityPromptProps {
	activityItemPrompt: ActivityItemPrompt;
	erdosConsoleInstance: IErdosConsoleInstance;
}

export const ActivityPrompt = (props: ActivityPromptProps) => {
	const services = useErdosReactServicesContext();

	const inputRef = useRef<HTMLInputElement>(undefined!);

	const readyInput = () => {
		if (inputRef.current) {
			inputRef.current.scrollIntoView({ behavior: 'auto' });
			inputRef.current.focus();
		}
	};

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.erdosConsoleInstance.onFocusInput(() => {
			readyInput();
		}));

		return () => disposableStore.dispose();
	}, [props.erdosConsoleInstance]);

	useEffect(() => {
		readyInput();
	}, [inputRef]);

	const keyDownHandler = async (e: KeyboardEvent<HTMLDivElement>) => {
		const consumeEvent = () => {
			e.preventDefault();
			e.stopPropagation();
		};

		const noModifierKey = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

		const onlyCtrlKey = e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

		const onlyCmdOrCtrlKey = (isMacintosh ? e.metaKey : e.ctrlKey) &&
			(isMacintosh ? !e.ctrlKey : !e.metaKey) &&
			!e.shiftKey &&
			!e.altKey;

		if (noModifierKey) {
			switch (e.key) {
				case 'Enter': {
					consumeEvent();
					props.erdosConsoleInstance.replyToPrompt(inputRef.current?.value);
					return;
				}

				default: {
					return;
				}
			}
		}

		if (onlyCtrlKey) {
			switch (e.key) {
				case 'c': {
					consumeEvent();
					props.erdosConsoleInstance.interrupt();
					return;
				}

				default: {
					return;
				}
			}
		}

		if (onlyCmdOrCtrlKey) {
			switch (e.key) {
				case 'a': {
					consumeEvent();

					const input = inputRef.current;
					if (!input) {
						return;
					}

					inputRef.current.selectionStart = 0;
					inputRef.current.selectionEnd = input.value.length;

					return;
				}

				case 'v': {
					consumeEvent();

					const input = inputRef.current;
					if (!input) {
						return;
					}

					const clipboard = await services.clipboardService.readText();

					const start = input.selectionStart!;
					const before = input.value.substring(0, start);
					const after = input.value.substring(input.selectionEnd!);
					inputRef.current.value = before + clipboard + after;
					inputRef.current.selectionStart = start + clipboard.length;
					inputRef.current.selectionEnd = start + clipboard.length;

					return;
				}

				default: {
					return;
				}
			}
		}
	};

	let prompt;
	switch (props.activityItemPrompt.state) {
		case ActivityItemPromptState.Unanswered:
			prompt = (
				<input
					ref={inputRef}
					className='input-field'
					type={props.activityItemPrompt.password ? 'password' : 'text'}
					onKeyDown={keyDownHandler}
				/>
			);
			break;

		case ActivityItemPromptState.Answered:
			prompt = props.activityItemPrompt.password ?
				null :
				<span>{props.activityItemPrompt.answer}</span>;
			break;

		case ActivityItemPromptState.Interrupted:
			prompt = null;
			break;
	}

	return (
		<div className='activity-prompt'>
			<ConsoleOutputLines outputLines={props.activityItemPrompt.outputLines.slice(0, -1)} />
			<div className='prompt-line'>
				{props.activityItemPrompt.outputLines.slice(-1).map(outputLine =>
					outputLine.outputRuns.map(outputRun =>
						<OutputRun key={outputRun.id} outputRun={outputRun} />
					)
				)}
				{prompt}
			</div>
		</div>
	);
};

export interface ActivityOutputStreamProps {
	activityItemStream: ActivityItemStream;
}

export const ActivityOutputStream = (props: ActivityOutputStreamProps) => {
	return (
		<ConsoleOutputLines outputLines={props.activityItemStream.outputLines} />
	);
};

export interface ActivityErrorStreamProps {
	activityItemStream: ActivityItemStream;
}

export const ActivityErrorStream = (props: ActivityErrorStreamProps) => {
	return (
		<div className='activity-error-stream'>
			<ConsoleOutputLines outputLines={props.activityItemStream.outputLines} />
		</div>
	);
};

export interface ActivityOutputHtmlProps {
	activityItemOutputHtml: ActivityItemOutputHtml;
}

export const ActivityOutputHtml = (props: ActivityOutputHtmlProps) => {

	return (
		<div className='activity-output-html'>
			{renderHtml(props.activityItemOutputHtml.html)}
		</div>
	);
};

export interface ActivityOutputMessageProps {
	activityItemOutputMessage: ActivityItemOutputMessage;
}

export const ActivityOutputMessage = (props: ActivityOutputMessageProps) => {
	return (
		<ConsoleOutputLines outputLines={props.activityItemOutputMessage.outputLines} />
	);
};

export interface ActivityOutputPlotProps {
	activityItemOutputPlot: ActivityItemOutputPlot;
}

const linkTitle = nls.localize('activityOutputPlotLinkTitle', "Select this plot in the Plots pane.");

export const ActivityOutputPlot = (props: ActivityOutputPlotProps) => {
	const handleClick = (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
		props.activityItemOutputPlot.onSelected();
	};

	return (
		<>
			<ConsoleOutputLines outputLines={props.activityItemOutputPlot.outputLines} />
			<a className='activity-output-plot'
				title={linkTitle}
				onClick={handleClick}>
				<img src={props.activityItemOutputPlot.plotUri} />
				<span className='inspect codicon codicon-erdos-search' />
			</a>
		</>
	);
};

export interface ActivityErrorMessageProps {
	activityItemErrorMessage: ActivityItemErrorMessage;
}

export const ActivityErrorMessage = (props: ActivityErrorMessageProps) => {
	const activityErrorMessageRef = useRef<HTMLDivElement>(undefined!);

	const [showTraceback, setShowTraceback] = useState(false);

	useEffect(() => {
		if (showTraceback) {
			activityErrorMessageRef.current?.scrollIntoView({ behavior: 'auto' });
		}
	}, [showTraceback]);

	const Traceback = () => {
		const pressedHandler = () => {
			setShowTraceback(!showTraceback);
		};

		return (
			<div className='traceback'>
				<ErdosButton className='toggle-traceback' onPressed={pressedHandler}>
					{showTraceback ?
						<>
							<div className='expansion-indicator codicon codicon-erdos-triangle-down'></div>
							<div className='link-text'>{localize('erdosHideTraceback', "Hide Traceback")}</div>

						</> :
						<>
							<div className='expansion-indicator codicon codicon-erdos-triangle-right'></div>
							<div className='link-text'>{localize('erdosShowTraceback', "Show Traceback")}</div>
						</>
					}
				</ErdosButton>
				{showTraceback &&
					<div className='traceback-lines'>
						<div />
						<div>
							<ConsoleOutputLines outputLines={props.activityItemErrorMessage.tracebackOutputLines} />
						</div>
					</div>
				}
			</div>
		);
	};

	return (
		<div ref={activityErrorMessageRef} className='activity-error-message'>
			<div className='error-bar'></div>
			<div className='error-information'>
				{props.activityItemErrorMessage.messageOutputLines.length > 0 &&
					<ConsoleOutputLines outputLines={props.activityItemErrorMessage.messageOutputLines} />
				}
				{props.activityItemErrorMessage.tracebackOutputLines.length > 0 &&
					<Traceback />
				}
			</div>
		</div>
	);
};
