/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIgnoreCase } from 'vs/base/common/strings';
import { IConfig, IDebuggerContribution, IDebugSession } from 'vs/workbench/contrib/debug/common/debug';
import { URI as uri } from 'vs/base/common/uri';
import { isAbsolute } from 'vs/base/common/path';
import { deepClone } from 'vs/base/common/objects';

const _formatPIIRegexp = /{([^}]+)}/g;

export function formatPII(value: string, excludePII: boolean, args: { [key: string]: string }): string {
	return value.replace(_formatPIIRegexp, function (match, group) {
		if (excludePII && group.length > 0 && group[0] !== '_') {
			return match;
		}

		return args && args.hasOwnProperty(group) ?
			args[group] :
			match;
	});
}

export function isSessionAttach(session: IDebugSession): boolean {
	return !session.parentSession && session.configuration.request === 'attach' && !isExtensionHostDebugging(session.configuration);
}

export function isExtensionHostDebugging(config: IConfig) {
	if (!config.type) {
		return false;
	}

	const type = config.type === 'vslsShare'
		? (<any>config).adapterProxy.configuration.type
		: config.type;

	return equalsIgnoreCase(type, 'extensionhost') || equalsIgnoreCase(type, 'pwa-extensionhost');
}

// only a debugger contributions with a label, program, or runtime attribute is considered a "defining" or "main" debugger contribution
export function isDebuggerMainContribution(dbg: IDebuggerContribution) {
	return dbg.type && (dbg.label || dbg.program || dbg.runtime);
}

export function getExactExpressionStartAndEnd(lineContent: string, looseStart: number, looseEnd: number): { start: number, end: number } {
	let matchingExpression: string | undefined = undefined;
	let startOffset = 0;

	// Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar
	// Match any character except a set of characters which often break interesting sub-expressions
	let expression: RegExp = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
	let result: RegExpExecArray | null = null;

	// First find the full expression under the cursor
	while (result = expression.exec(lineContent)) {
		let start = result.index + 1;
		let end = start + result[0].length;

		if (start <= looseStart && end >= looseEnd) {
			matchingExpression = result[0];
			startOffset = start;
			break;
		}
	}

	// If there are non-word characters after the cursor, we want to truncate the expression then.
	// For example in expression 'a.b.c.d', if the focus was under 'b', 'a.b' would be evaluated.
	if (matchingExpression) {
		let subExpression: RegExp = /\w+/g;
		let subExpressionResult: RegExpExecArray | null = null;
		while (subExpressionResult = subExpression.exec(matchingExpression)) {
			let subEnd = subExpressionResult.index + 1 + startOffset + subExpressionResult[0].length;
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

// RFC 2396, Appendix A: https://www.ietf.org/rfc/rfc2396.txt
const _schemePattern = /^[a-zA-Z][a-zA-Z0-9\+\-\.]+:/;

export function isUri(s: string | undefined): boolean {
	// heuristics: a valid uri starts with a scheme and
	// the scheme has at least 2 characters so that it doesn't look like a drive letter.
	return !!(s && s.match(_schemePattern));
}

function stringToUri(path: string): string {
	if (typeof path === 'string') {
		if (isUri(path)) {
			return <string><unknown>uri.parse(path);
		} else {
			// assume path
			if (isAbsolute(path)) {
				return <string><unknown>uri.file(path);
			} else {
				// leave relative path as is
			}
		}
	}
	return path;
}

function uriToString(path: string): string {
	if (typeof path === 'object') {
		const u = uri.revive(path);
		if (u.scheme === 'file') {
			return u.fsPath;
		} else {
			return u.toString();
		}
	}
	return path;
}

// path hooks helpers

interface PathContainer {
	path?: string;
}

export function convertToDAPaths(message: DebugProtocol.ProtocolMessage, toUri: boolean): DebugProtocol.ProtocolMessage {

	const fixPath = toUri ? stringToUri : uriToString;

	// since we modify Source.paths in the message in place, we need to make a copy of it (see #61129)
	const msg = deepClone(message);

	convertPaths(msg, (toDA: boolean, source: PathContainer | undefined) => {
		if (toDA && source) {
			source.path = source.path ? fixPath(source.path) : undefined;
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
			source.path = source.path ? fixPath(source.path) : undefined;
		}
	});
	return msg;
}

function convertPaths(msg: DebugProtocol.ProtocolMessage, fixSourcePath: (toDA: boolean, source: PathContainer | undefined) => void): void {

	switch (msg.type) {
		case 'event':
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
		case 'request':
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
		case 'response':
			const response = <DebugProtocol.Response>msg;
			if (response.success) {
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
					default:
						break;
				}
			}
			break;
	}
}
