/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function convertPaths(msg: DebugProtocol.ProtocolMessage, fixSourcePaths: (toDA: boolean, source: DebugProtocol.Source | undefined) => void) {
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
			break;
	}
}

export function convertToDAPaths(msg: DebugProtocol.ProtocolMessage, fixSourcePaths: (source: DebugProtocol.Source) => void) {
	convertPaths(msg, (toDA: boolean, source: DebugProtocol.Source | undefined) => {
		if (toDA && source) {
			fixSourcePaths(source);
		}
	});
}

export function convertToVSCPaths(msg: DebugProtocol.ProtocolMessage, fixSourcePaths: (source: DebugProtocol.Source) => void) {
	convertPaths(msg, (toDA: boolean, source: DebugProtocol.Source | undefined) => {
		if (!toDA && source) {
			fixSourcePaths(source);
		}
	});
}