/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { IDebuggerContribution, IDebugSession, IConfigPresentation, State } from './debug.js';
import { URI as uri } from '../../../../base/common/uri.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { deepClone } from '../../../../base/common/objects.js';
import { Schemas } from '../../../../base/common/network.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Position } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';

const _formatPIIRegexp = /{([^}]+)}/g;

export function formatPII(value: string, excludePII: boolean, args: { [key: string]: string } | undefined): string {
	return value.replace(_formatPIIRegexp, function (match, group) {
		if (excludePII && group.length > 0 && group[0] !== '_') {
			return match;
		}

		return args && args.hasOwnProperty(group) ?
			args[group] :
			match;
	});
}

/**
 * Filters exceptions (keys marked with "!") from the given object. Used to
 * ensure exception data is not sent on web remotes, see #97628.
 */
export function filterExceptionsFromTelemetry<T extends { [key: string]: unknown }>(data: T): Partial<T> {
	const output: Partial<T> = {};
	for (const key of Object.keys(data) as (keyof T & string)[]) {
		if (!key.startsWith('!')) {
			output[key] = data[key];
		}
	}

	return output;
}


export function isSessionAttach(session: IDebugSession): boolean {
	return session.configuration.request === 'attach' && !getExtensionHostDebugSession(session) && (!session.parentSession || isSessionAttach(session.parentSession));
}

/**
 * Returns the session or any parent which is an extension host debug session.
 * Returns undefined if there's none.
 */
export function getExtensionHostDebugSession(session: IDebugSession): IDebugSession | void {
	let type = session.configuration.type;
	if (!type) {
		return;
	}

	if (type === 'vslsShare') {
		type = (session.configuration as { adapterProxy?: { configuration?: { type?: string } } }).adapterProxy?.configuration?.type || type;
	}

	if (equalsIgnoreCase(type, 'extensionhost') || equalsIgnoreCase(type, 'pwa-extensionhost')) {
		return session;
	}

	return session.parentSession ? getExtensionHostDebugSession(session.parentSession) : undefined;
}

// only a debugger contributions with a label, program, or runtime attribute is considered a "defining" or "main" debugger contribution
export function isDebuggerMainContribution(dbg: IDebuggerContribution) {
	return dbg.type && (dbg.label || dbg.program || dbg.runtime);
}

/**
 * Note- uses 1-indexed numbers
 */
export function getExactExpressionStartAndEnd(lineContent: string, looseStart: number, looseEnd: number): { start: number; end: number } {
	let matchingExpression: string | undefined = undefined;
	let startOffset = 0;

	// Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar, ...foo
	// Match any character except a set of characters which often break interesting sub-expressions
	const expression: RegExp = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
	let result: RegExpExecArray | null = null;

	// First find the full expression under the cursor
	while (result = expression.exec(lineContent)) {
		const start = result.index + 1;
		const end = start + result[0].length;

		if (start <= looseStart && end >= looseEnd) {
			matchingExpression = result[0];
			startOffset = start;
			break;
		}
	}

	// Handle spread syntax: if the expression starts with '...', extract just the identifier
	if (matchingExpression) {
		const spreadMatch = matchingExpression.match(/^\.\.\.(.+)/);
		if (spreadMatch) {
			matchingExpression = spreadMatch[1];
			startOffset += 3; // Skip the '...' prefix
		}
	}

	// If there are non-word characters after the cursor, we want to truncate the expression then.
	// For example in expression 'a.b.c.d', if the focus was under 'b', 'a.b' would be evaluated.
	if (matchingExpression) {
		const subExpression: RegExp = /(\w|\p{L})+/gu;
		let subExpressionResult: RegExpExecArray | null = null;
		while (subExpressionResult = subExpression.exec(matchingExpression)) {
			const subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
			if (subEnd >= looseEnd) {
				break;
			}
		}

		if (subExpressionResult) {
			matchingExpression = matchingExpression.substring(0, subExpression.lastIndex);
		}
	}

	return matchingExpression ?
		{ start: startOffset, end: startOffset + matchingExpression.length - 1 } :
		{ start: 0, end: 0 };
}

export async function getEvaluatableExpressionAtPosition(languageFeaturesService: ILanguageFeaturesService, model: ITextModel, position: Position, token?: CancellationToken): Promise<{ range: IRange; matchingExpression: string } | null> {
	if (languageFeaturesService.evaluatableExpressionProvider.has(model)) {
		const supports = languageFeaturesService.evaluatableExpressionProvider.ordered(model);

		const results = coalesce(await Promise.all(supports.map(async support => {
			try {
				return await support.provideEvaluatableExpression(model, position, token ?? CancellationToken.None);
			} catch (err) {
				return undefined;
			}
		})));

		if (results.length > 0) {
			let matchingExpression = results[0].expression;
			const range = results[0].range;

			if (!matchingExpression) {
				const lineContent = model.getLineContent(position.lineNumber);
				matchingExpression = lineContent.substring(range.startColumn - 1, range.endColumn - 1);
			}

			return { range, matchingExpression };
		}
	} else { // old one-size-fits-all strategy
		const lineContent = model.getLineContent(position.lineNumber);
		const { start, end } = getExactExpressionStartAndEnd(lineContent, position.column, position.column);

		// use regex to extract the sub-expression #9821
		const matchingExpression = lineContent.substring(start - 1, end);
		return {
			matchingExpression,
			range: new Range(position.lineNumber, start, position.lineNumber, start + matchingExpression.length)
		};
	}

	return null;
}

// RFC 2396, Appendix A: https://www.ietf.org/rfc/rfc2396.txt
const _schemePattern = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;

export function isUriString(s: string | undefined): boolean {
	// heuristics: a valid uri starts with a scheme and
	// the scheme has at least 2 characters so that it doesn't look like a drive letter.
	return !!(s && s.match(_schemePattern));
}

function stringToUri(source: PathContainer): string | undefined {
	if (typeof source.path === 'string') {
		if (typeof source.sourceReference === 'number' && source.sourceReference > 0) {
			// if there is a source reference, don't touch path
		} else {
			if (isUriString(source.path)) {
				return <string><unknown>uri.parse(source.path);
			} else {
				// assume path
				if (isAbsolute(source.path)) {
					return <string><unknown>uri.file(source.path);
				} else {
					// leave relative path as is
				}
			}
		}
	}
	return source.path;
}

function uriToString(source: PathContainer): string | undefined {
	if (typeof source.path === 'object') {
		const u = uri.revive(source.path);
		if (u) {
			if (u.scheme === Schemas.file) {
				return u.fsPath;
			} else {
				return u.toString();
			}
		}
	}
	return source.path;
}

// path hooks helpers

interface PathContainer {
	path?: string;
	sourceReference?: number;
}

export function convertToDAPaths(message: DebugProtocol.ProtocolMessage, toUri: boolean): DebugProtocol.ProtocolMessage {

	const fixPath = toUri ? stringToUri : uriToString;

	// since we modify Source.paths in the message in place, we need to make a copy of it (see #61129)
	const msg = deepClone(message);

	convertPaths(msg, (toDA: boolean, source: PathContainer | undefined) => {
		if (toDA && source) {
			source.path = fixPath(source);
		}
	});
	return msg;
}

export function convertToVSCPaths(message: DebugProtocol.ProtocolMessage, toUri: boolean): DebugProtocol.ProtocolMessage {

	const fixPath = toUri ? stringToUri : uriToString;

	// since we modify Source.paths in the message in place, we need to make a copy of it (see #61129)
	const msg = deepClone(message);

	convertPaths(msg, (toDA: boolean, source: PathContainer | undefined) => {
		if (!toDA && source) {
			source.path = fixPath(source);
		}
	});
	return msg;
}

function convertPaths(msg: DebugProtocol.ProtocolMessage, fixSourcePath: (toDA: boolean, source: PathContainer | undefined) => void): void {

	switch (msg.type) {
		case 'event': {
			const event = <DebugProtocol.Event>msg;
			switch (event.event) {
				case 'output':
					fixSourcePath(false, (<DebugProtocol.OutputEvent>event).body.source);
					break;
				case 'loadedSource':
					fixSourcePath(false, (<DebugProtocol.LoadedSourceEvent>event).body.source);
					break;
				case 'breakpoint':
					fixSourcePath(false, (<DebugProtocol.BreakpointEvent>event).body.breakpoint.source);
					break;
				default:
					break;
			}
			break;
		}
		case 'request': {
			const request = <DebugProtocol.Request>msg;
			switch (request.command) {
				case 'setBreakpoints':
					fixSourcePath(true, (<DebugProtocol.SetBreakpointsArguments>request.arguments).source);
					break;
				case 'breakpointLocations':
					fixSourcePath(true, (<DebugProtocol.BreakpointLocationsArguments>request.arguments).source);
					break;
				case 'source':
					fixSourcePath(true, (<DebugProtocol.SourceArguments>request.arguments).source);
					break;
				case 'gotoTargets':
					fixSourcePath(true, (<DebugProtocol.GotoTargetsArguments>request.arguments).source);
					break;
				case 'launchVSCode':
					request.arguments.args.forEach((arg: PathContainer | undefined) => fixSourcePath(false, arg));
					break;
				default:
					break;
			}
			break;
		}
		case 'response': {
			const response = <DebugProtocol.Response>msg;
			if (response.success && response.body) {
				switch (response.command) {
					case 'stackTrace':
						(<DebugProtocol.StackTraceResponse>response).body.stackFrames.forEach(frame => fixSourcePath(false, frame.source));
						break;
					case 'loadedSources':
						(<DebugProtocol.LoadedSourcesResponse>response).body.sources.forEach(source => fixSourcePath(false, source));
						break;
					case 'scopes':
						(<DebugProtocol.ScopesResponse>response).body.scopes.forEach(scope => fixSourcePath(false, scope.source));
						break;
					case 'setFunctionBreakpoints':
						(<DebugProtocol.SetFunctionBreakpointsResponse>response).body.breakpoints.forEach(bp => fixSourcePath(false, bp.source));
						break;
					case 'setBreakpoints':
						(<DebugProtocol.SetBreakpointsResponse>response).body.breakpoints.forEach(bp => fixSourcePath(false, bp.source));
						break;
					case 'disassemble':
						{
							const di = <DebugProtocol.DisassembleResponse>response;
							di.body?.instructions.forEach(di => fixSourcePath(false, di.location));
						}
						break;
					case 'locations':
						fixSourcePath(false, (<DebugProtocol.LocationsResponse>response).body?.source);
						break;
					default:
						break;
				}
			}
			break;
		}
	}
}

export function getVisibleAndSorted<T extends { presentation?: IConfigPresentation }>(array: T[]): T[] {
	return array.filter(config => !config.presentation?.hidden).sort((first, second) => {
		if (!first.presentation) {
			if (!second.presentation) {
				return 0;
			}
			return 1;
		}
		if (!second.presentation) {
			return -1;
		}
		if (!first.presentation.group) {
			if (!second.presentation.group) {
				return compareOrders(first.presentation.order, second.presentation.order);
			}
			return 1;
		}
		if (!second.presentation.group) {
			return -1;
		}
		if (first.presentation.group !== second.presentation.group) {
			return first.presentation.group.localeCompare(second.presentation.group);
		}

		return compareOrders(first.presentation.order, second.presentation.order);
	});
}

function compareOrders(first: number | undefined, second: number | undefined): number {
	if (typeof first !== 'number') {
		if (typeof second !== 'number') {
			return 0;
		}

		return 1;
	}
	if (typeof second !== 'number') {
		return -1;
	}

	return first - second;
}

export async function saveAllBeforeDebugStart(configurationService: IConfigurationService, editorService: IEditorService): Promise<void> {
	const saveBeforeStartConfig: string = configurationService.getValue('debug.saveBeforeStart', { overrideIdentifier: editorService.activeTextEditorLanguageId });
	if (saveBeforeStartConfig !== 'none') {
		await editorService.saveAll();
		if (saveBeforeStartConfig === 'allEditorsInActiveGroup') {
			const activeEditor = editorService.activeEditorPane;
			if (activeEditor && activeEditor.input.resource?.scheme === Schemas.untitled) {
				// Make sure to save the active editor in case it is in untitled file it wont be saved as part of saveAll #111850
				await editorService.save({ editor: activeEditor.input, groupId: activeEditor.group.id });
			}
		}
	}
	await configurationService.reloadConfiguration();
}

export const sourcesEqual = (a: DebugProtocol.Source | undefined, b: DebugProtocol.Source | undefined): boolean =>
	!a || !b ? a === b : a.name === b.name && a.path === b.path && a.sourceReference === b.sourceReference;

/**
 * Resolves the best child session to focus when a parent session is selected.
 * Always prefer child sessions over parent wrapper sessions to ensure console responsiveness.
 * Fixes issue #152407: Using debug console picker when not paused leaves console unresponsive.
 */
export function resolveChildSession(session: IDebugSession, allSessions: readonly IDebugSession[]): IDebugSession {
	// Always focus child session instead of parent wrapper session #152407
	const childSessions = allSessions.filter(s => s.parentSession === session);
	if (childSessions.length > 0) {
		// Prefer stopped child session if available #112595
		const stoppedChildSession = childSessions.find(s => s.state === State.Stopped);
		if (stoppedChildSession) {
			return stoppedChildSession;
		} else {
			// If no stopped child, focus the first available child session
			return childSessions[0];
		}
	}
	// Return the original session if it has no children
	return session;
}
