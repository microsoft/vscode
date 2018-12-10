/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equalsIgnoreCase } from 'vs/base/common/strings';
import { IConfig } from 'vs/workbench/parts/debug/common/debug';
import { URI as uri } from 'vs/base/common/uri';
import { isAbsolute_posix, isAbsolute_win32 } from 'vs/base/common/paths';
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

export function isExtensionHostDebugging(config: IConfig) {
	return config.type && equalsIgnoreCase(config.type === 'vslsShare' ? (<any>config).adapterProxy.configuration.type : config.type, 'extensionhost');
}

export function getExactExpressionStartAndEnd(lineContent: string, looseStart: number, looseEnd: number): { start: number, end: number } {
	let matchingExpression: string | undefined = undefined;
	let startOffset = 0;

	// Some example supported expressions: myVar.prop, a.b.c.d, myVar?.prop, myVar->prop, MyClass::StaticProp, *myVar
	// Match any character except a set of characters which often break interesting sub-expressions
	let expression: RegExp = /([^()\[\]{}<>\s+\-/%~#^;=|,`!]|\->)+/g;
	let result: RegExpExecArray | undefined = undefined;

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
		let subExpressionResult: RegExpExecArray | undefined = undefined;
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

export function isUri(s: string) {
	// heuristics: a valid uri starts with a scheme and
	// the scheme has at least 2 characters so that it doesn't look like a drive letter.
	return s && s.match(_schemePattern);
}

export function stringToUri(source: DebugProtocol.Source): void {
	if (typeof source.path === 'string') {
		if (isUri(source.path)) {
			(<any>source).path = uri.parse(source.path);
		} else {
			// assume path
			if (isAbsolute_posix(source.path) || isAbsolute_win32(source.path)) {
				(<any>source).path = uri.file(source.path);
			} else {
				// leave relative path as is
			}
		}
	}
}

export function uriToString(source: DebugProtocol.Source): void {
	if (typeof source.path === 'object') {
		const u = uri.revive(source.path);
		if (u.scheme === 'file') {
			source.path = u.fsPath;
		} else {
			source.path = u.toString();
		}
	}
}

// path hooks helpers

export function convertToDAPaths(message: DebugProtocol.ProtocolMessage, fixSourcePaths: (source: DebugProtocol.Source) => void): DebugProtocol.ProtocolMessage {

	// since we modify Source.paths in the message in place, we need to make a copy of it (see #61129)
	const msg = deepClone(message);

	convertPaths(msg, (toDA: boolean, source: DebugProtocol.Source | undefined) => {
		if (toDA && source) {
			fixSourcePaths(source);
		}
	});
	return msg;
}

export function convertToVSCPaths(message: DebugProtocol.ProtocolMessage, fixSourcePaths: (source: DebugProtocol.Source) => void): DebugProtocol.ProtocolMessage {

	// since we modify Source.paths in the message in place, we need to make a copy of it (see #61129)
	const msg = deepClone(message);

	convertPaths(msg, (toDA: boolean, source: DebugProtocol.Source | undefined) => {
		if (!toDA && source) {
			fixSourcePaths(source);
		}
	});
	return msg;
}

function convertPaths(msg: DebugProtocol.ProtocolMessage, fixSourcePaths: (toDA: boolean, source: DebugProtocol.Source | undefined) => void): void {
	switch (msg.type) {
		case 'event':
			const event = <DebugProtocol.Event>msg;
			switch (event.event) {
				case 'output':
					fixSourcePaths(false, (<DebugProtocol.OutputEvent>event).body.source);
					break;
				case 'loadedSource':
					fixSourcePaths(false, (<DebugProtocol.LoadedSourceEvent>event).body.source);
					break;
				case 'breakpoint':
					fixSourcePaths(false, (<DebugProtocol.BreakpointEvent>event).body.breakpoint.source);
					break;
				default:
					break;
			}
			break;
		case 'request':
			const request = <DebugProtocol.Request>msg;
			switch (request.command) {
				case 'setBreakpoints':
					fixSourcePaths(true, (<DebugProtocol.SetBreakpointsArguments>request.arguments).source);
					break;
				case 'source':
					fixSourcePaths(true, (<DebugProtocol.SourceArguments>request.arguments).source);
					break;
				case 'gotoTargets':
					fixSourcePaths(true, (<DebugProtocol.GotoTargetsArguments>request.arguments).source);
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
						const r1 = <DebugProtocol.StackTraceResponse>response;
						r1.body.stackFrames.forEach(frame => fixSourcePaths(false, frame.source));
						break;
					case 'loadedSources':
						const r2 = <DebugProtocol.LoadedSourcesResponse>response;
						r2.body.sources.forEach(source => fixSourcePaths(false, source));
						break;
					case 'scopes':
						const r3 = <DebugProtocol.ScopesResponse>response;
						r3.body.scopes.forEach(scope => fixSourcePaths(false, scope.source));
						break;
					case 'setFunctionBreakpoints':
						const r4 = <DebugProtocol.SetFunctionBreakpointsResponse>response;
						r4.body.breakpoints.forEach(bp => fixSourcePaths(false, bp.source));
						break;
					case 'setBreakpoints':
						const r5 = <DebugProtocol.SetBreakpointsResponse>response;
						r5.body.breakpoints.forEach(bp => fixSourcePaths(false, bp.source));
						break;
					default:
						break;
				}
			}
			break;
	}
}
