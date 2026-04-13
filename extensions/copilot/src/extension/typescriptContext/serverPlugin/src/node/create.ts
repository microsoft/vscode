/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import { computeContext, nesRename, prepareNesRename } from '../common/api';
import { CharacterBudget, ComputeContextSession, ContextResult, NullLogger, RequestContext, TokenBudgetExhaustedError, type Logger } from '../common/contextProvider';
import { ErrorCode, RenameKind, type CachedContextRunnableResult, type ComputeContextRequest, type ComputeContextResponse, type ContextRunnableResultId, type CustomResponse, type NesRenameRequest, type NesRenameResponse, type PingResponse, type PrepareNesRenameRequest, type PrepareNesRenameResponse, type Range, type RenameGroup } from '../common/protocol';
import { CancellationTokenWithTimer, Sessions } from '../common/typescripts';
const ts = TS();

import type { Host } from '../common/host';
import { PrepareNesRenameResult } from '../common/nesRenameValidator';
import TS from '../common/typescript';
import { NodeHost } from './host';

export class LanguageServerSession extends ComputeContextSession {
	private readonly session: tt.server.Session;

	public readonly logger: Logger;

	constructor(session: tt.server.Session, languageServiceHost: tt.LanguageServiceHost, host: Host) {
		super(languageServiceHost, host, true);
		this.session = session;
		const projectService = Sessions.getProjectService(this.session);
		this.logger = projectService?.logger ?? new NullLogger();
	}

	public logError(error: Error, cmd: string): void {
		this.session.logError(error, cmd);
	}

	public getFileAndProject(args: tt.server.protocol.FileRequestArgs): Sessions.FileAndProject | undefined {
		return Sessions.getFileAndProject(this.session, args);
	}

	public getPositionInFile(args: tt.server.protocol.Location & { position?: number }, file: tt.server.NormalizedPath): number | undefined {
		return Sessions.getPositionInFile(this.session, args, file);
	}

	public *getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService> {
		const projectService = Sessions.getProjectService(this.session);
		if (projectService === undefined) {
			return;
		}
		if (sourceFile === undefined) {
			for (const project of projectService.configuredProjects.values()) {
				const languageService = project.getLanguageService();
				yield languageService;
			}
			for (const project of projectService.inferredProjects) {
				const languageService = project.getLanguageService();
				yield languageService;
			}
			for (const project of projectService.externalProjects) {
				const languageService = project.getLanguageService();
				yield languageService;
			}
		} else {
			const file = ts.server.toNormalizedPath(sourceFile.fileName);
			const scriptInfo = projectService.getScriptInfoForNormalizedPath(file)!;
			yield* scriptInfo ? scriptInfo.containingProjects.map(p => p.getLanguageService()) : [];
		}
	}

	public override getScriptVersion(sourceFile: tt.SourceFile): string | undefined {
		const file = ts.server.toNormalizedPath(sourceFile.fileName);
		const projectService = Sessions.getProjectService(this.session);
		if (projectService === undefined) {
			return undefined;
		}
		const scriptInfo = projectService.getScriptInfoForNormalizedPath(file);
		return scriptInfo?.getLatestVersion();
	}
}

interface FailedHandlerResponse extends tt.server.HandlerResponse {
	response: CustomResponse.Failed;
	responseRequired: boolean;
}

namespace FailedHandlerResponse {
	export function is(value: unknown): value is FailedHandlerResponse {
		const candidate = value as FailedHandlerResponse;
		if (candidate === undefined || candidate === null || typeof candidate !== 'object' || candidate.response === undefined || typeof candidate.response !== 'object' || typeof candidate.responseRequired !== 'boolean') {
			return false;
		}
		return candidate.response.error !== undefined && typeof candidate.response.message === 'string';
	}
}

interface ComputeContextHandlerResponse extends tt.server.HandlerResponse {
	response: ComputeContextResponse.OK | ComputeContextResponse.Failed;
}

interface PrepareNesRenameHandlerResponse extends tt.server.HandlerResponse {
	response: PrepareNesRenameResponse.OK | PrepareNesRenameResponse.Failed;
}

interface NesRenameHandlerResponse extends tt.server.HandlerResponse {
	response: NesRenameResponse.OK | NesRenameResponse.Failed;
}

let installAttempted: boolean = false;
let languageServerSession: LanguageServerSession | undefined = undefined;
let languageServiceHost: tt.LanguageServiceHost | undefined = undefined;
let pingResult: PingResponse.OK | PingResponse.Error = { kind: 'error', message: 'Attempt to install context handler failed' };

type ResolvedInput = {
	languageService: tt.LanguageService;
	program: tt.Program;
	file: tt.server.NormalizedPath;
	pos: number;
	startTime: number;
	timeBudget: number;
	requestStartTime: number;
}
const resolveInput = <T extends tt.server.protocol.FileRequestArgs & tt.server.protocol.Location & { timeBudget?: number; startTime?: number }>(args: T | undefined, defaultTimeBudget: number): ResolvedInput | FailedHandlerResponse => {
	const requestStartTime = Date.now();
	if (args === undefined) {
		return { response: { error: ErrorCode.noArguments, message: 'No arguments provided' }, responseRequired: true };
	}

	const fileAndProject = languageServerSession?.getFileAndProject(args);
	if (fileAndProject === undefined) {
		return { response: { error: ErrorCode.noProject, message: 'No project found' }, responseRequired: true };
	}
	if (typeof args.line !== 'number' || typeof args.offset !== 'number') {
		return { response: { error: ErrorCode.invalidArguments, message: 'No project found' }, responseRequired: true };
	}
	const { file, project } = fileAndProject;
	const pos = languageServerSession?.getPositionInFile(args, file);
	if (pos === undefined) {
		return { response: { error: ErrorCode.invalidPosition, message: 'Position not valid' }, responseRequired: true };
	}

	let startTime = args.startTime ?? requestStartTime;
	let timeBudget = typeof args.timeBudget === 'number' ? args.timeBudget : defaultTimeBudget;
	if (startTime + timeBudget > requestStartTime) {
		// We are already in a timeout. So we let the computation run for defaultTimeBudget.
		// to profit from caching for the next request. In all other cases we take
		// the time budget left since we might be able to provide a little context.
		startTime = requestStartTime;
		timeBudget = defaultTimeBudget;
	}

	// We get the language service here to get the timings outside of the compute context. Accessing the language service
	// updates the project graph if dirty which can be time consuming.
	const languageService = project.getLanguageService();
	const program = languageService.getProgram();
	if (program === undefined) {
		return { response: { error: ErrorCode.noProgram, message: 'No program found' }, responseRequired: true };
	}
	return { languageService, program, file, pos, timeBudget, startTime, requestStartTime };
};

const getLastSymbolRename = (args: { lastSymbolRename?: Range } | undefined): Range | undefined => {
	if (args === undefined || args.lastSymbolRename === undefined) {
		return undefined;
	}
	return {
		start: { line: args.lastSymbolRename.start.line - 1, character: args.lastSymbolRename.start.character - 1 },
		end: { line: args.lastSymbolRename.end.line - 1, character: args.lastSymbolRename.end.character - 1 }
	};
};

const computeContextHandler = (request: ComputeContextRequest): ComputeContextHandlerResponse => {
	const input = resolveInput(request.arguments, 100);
	if (FailedHandlerResponse.is(input)) {
		return input;
	}
	const { languageService, file, pos, timeBudget, startTime, requestStartTime } = input;
	const args = request.arguments!;

	const computeStart = Date.now();
	const primaryCharacterBudget = new CharacterBudget(typeof args.primaryCharacterBudget === 'number' ? args.primaryCharacterBudget : 7 * 1024 * 4);
	const secondaryCharacterBudget = new CharacterBudget(typeof args.secondaryCharacterBudget === 'number' ? args.secondaryCharacterBudget : 8 * 1024 * 4);
	const normalizedPaths: tt.server.NormalizedPath[] = [];
	if (args.neighborFiles !== undefined) {
		for (const file of args.neighborFiles) {
			normalizedPaths.push(ts.server.toNormalizedPath(file));
		}
	}
	const clientSideRunnableResults: Map<ContextRunnableResultId, CachedContextRunnableResult> = args.clientSideRunnableResults !== undefined ? new Map(args.clientSideRunnableResults.map(item => [item.id, item])) : new Map();
	const cancellationToken = new CancellationTokenWithTimer(languageServiceHost?.getCancellationToken ? languageServiceHost.getCancellationToken() : undefined, startTime, timeBudget, languageServerSession?.host.isDebugging() ?? false);
	const requestContext = new RequestContext(languageServerSession!, normalizedPaths, clientSideRunnableResults, !!args.includeDocumentation);
	const result: ContextResult = new ContextResult(primaryCharacterBudget, secondaryCharacterBudget, requestContext);
	try {
		computeContext(result, languageServerSession!, languageService, file, pos, cancellationToken);
	} catch (error) {
		if (!(error instanceof ts.OperationCanceledException) && !(error instanceof TokenBudgetExhaustedError)) {
			if (error instanceof Error) {
				return { response: { error: ErrorCode.exception, message: error.message, stack: error.stack }, responseRequired: true };
			} else {
				return { response: { error: ErrorCode.exception, message: 'Unknown error' }, responseRequired: true };
			}
		}
	}
	const endTime = Date.now();
	result.addTimings(endTime - requestStartTime, endTime - computeStart);
	result.setTimedOut(cancellationToken.isTimedOut());
	return { response: result.toJson(), responseRequired: true };
};

const prepareNesRenameHandler = (request: PrepareNesRenameRequest): PrepareNesRenameHandlerResponse => {
	const input = resolveInput(request.arguments, 50);
	if (FailedHandlerResponse.is(input)) {
		return input;
	}

	const { languageService, file, pos, timeBudget, startTime } = input;

	// All the internal API is 0-based for both line and offset
	const lastSymbolRename = getLastSymbolRename(request.arguments);

	const cancellationToken = new CancellationTokenWithTimer(languageServiceHost?.getCancellationToken ? languageServiceHost.getCancellationToken() : undefined, startTime, timeBudget, languageServerSession?.host.isDebugging() ?? false);
	const result: PrepareNesRenameResult = new PrepareNesRenameResult();
	try {
		prepareNesRename(result, languageServerSession!, languageService, file, pos, request.arguments?.oldName, request.arguments?.newName, lastSymbolRename, cancellationToken);
	} catch (error) {
		if (error instanceof ts.OperationCanceledException) {
			result.setCanRename(RenameKind.no, 'Operation canceled');
		} else {
			if (error instanceof Error) {
				return { response: { error: ErrorCode.exception, message: error.message, stack: error.stack }, responseRequired: true };
			} else {
				return { response: { error: ErrorCode.exception, message: 'Unknown error' }, responseRequired: true };
			}
		}
	}
	result.setTimedOut(cancellationToken.isTimedOut());
	return { response: result.toJsonResponse(), responseRequired: true };
};

const nesRenameHandler = (request: NesRenameRequest): NesRenameHandlerResponse => {
	const input = resolveInput(request.arguments, 0);
	if (FailedHandlerResponse.is(input)) {
		return input;
	}

	const { languageService, file, pos } = input;

	const lastSymbolRename = getLastSymbolRename(request.arguments);
	let result: RenameGroup[];
	try {
		result = nesRename(languageServerSession!, languageService, file, pos, request.arguments?.oldName, request.arguments?.newName, lastSymbolRename);
	} catch (error) {
		if (error instanceof Error) {
			return { response: { error: ErrorCode.exception, message: error.message, stack: error.stack }, responseRequired: true };
		} else {
			return { response: { error: ErrorCode.exception, message: 'Unknown error' }, responseRequired: true };
		}
	}
	return { response: { groups: result }, responseRequired: true };
};

export function create(info: tt.server.PluginCreateInfo): tt.LanguageService {
	if (installAttempted) {
		return info.languageService;
	}
	if (info.session !== undefined) {
		try {

			info.session.addProtocolHandler('_.copilot.ping', () => {
				return { response: pingResult, responseRequired: true };
			});
			try {
				const versionSupported = isSupportedVersion();
				pingResult = { kind: 'ok', session: true, supported: versionSupported, version: ts.version };
				if (versionSupported) {
					languageServerSession = new LanguageServerSession(info.session, info.languageServiceHost, new NodeHost());
					languageServiceHost = info.languageServiceHost;
					info.session.addProtocolHandler('_.copilot.context', computeContextHandler);
					info.session.addProtocolHandler('_.copilot.prepareNesRename', prepareNesRenameHandler);
					info.session.addProtocolHandler('_.copilot.postNesRename', nesRenameHandler);
				}

			} catch (e) {
				if (e instanceof Error) {
					pingResult = { kind: 'error', message: e.message, stack: e.stack };
					info.session.logError(e, '_.copilot.installHandler');
				} else {
					pingResult = { kind: 'error', message: 'Unknown error' };
					info.session.logError(new Error('Unknown error'), '_.copilot.installHandler');
				}
			}
		} catch (error) {
			if (error instanceof Error) {
				info.session.logError(error, '_.copilot.installPingHandler');
			} else {
				info.session.logError(new Error('Unknown error'), '_.copilot.installPingHandler');
			}
		} finally {
			installAttempted = true;
		}
	}

	return info.languageService;
}

function isSupportedVersion(): boolean {
	try {
		const version = ts.versionMajorMinor.split('.');
		if (version.length < 2) {
			return false;
		}
		const major = parseInt(version[0]);
		const minor = parseInt(version[1]);
		return major > 5 || (major === 5 && minor >= 5);
	} catch (e) {
		return false;
	}
}