/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IOpenerService, IOpener, IValidator, IExternalUriResolver, IExternalOpener, OpenInternalOptions, OpenExternalOptions, ResolveExternalUriOptions, IResolvedExternalUri } from '../../../platform/opener/common/opener.js';
import { IModalDialogPromptInstance, IErdosModalDialogsService, ShowConfirmationModalDialogOptions } from '../../services/erdosModalDialogs/common/erdosModalDialogs.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ICommandService, CommandsRegistry, ICommandEvent } from '../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationResolverService } from '../../services/configurationResolver/common/configurationResolver.js';
import { IFileService, IFileStatWithMetadata } from '../../../platform/files/common/files.js';
import { createFileStat } from './workbenchTestServices.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';
import { IWorkspaceFolder, IWorkspaceFolderData } from '../../../platform/workspace/common/workspace.js';
import { ILanguageRuntimeMetadata } from '../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionMetadata, ILanguageRuntimeSession, ILanguageRuntimeSessionManager } from '../../services/runtimeSession/common/runtimeSessionTypes.js';
import { TestLanguageRuntimeSession } from '../../services/runtimeSession/test/common/testLanguageRuntimeSession.js';


export class TestOpenerService implements IOpenerService {
	_serviceBrand: undefined;
	registerOpener(opener: IOpener): IDisposable {
		return { dispose() { } };
	}
	registerValidator(validator: IValidator): IDisposable {
		throw new Error('Method not implemented.');
	}
	registerExternalUriResolver(resolver: IExternalUriResolver): IDisposable {
		throw new Error('Method not implemented.');
	}
	setDefaultExternalOpener(opener: IExternalOpener): void {
		throw new Error('Method not implemented.');
	}
	registerExternalOpener(opener: IExternalOpener): IDisposable {
		throw new Error('Method not implemented.');
	}
	open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	resolveExternalUri(resource: URI, options?: ResolveExternalUriOptions): Promise<IResolvedExternalUri> {
		throw new Error('Method not implemented.');
	}
}

export class TestErdosModalDialogService implements IErdosModalDialogsService {
	_serviceBrand: undefined;
	showConfirmationModalDialog(options: ShowConfirmationModalDialogOptions): void {
		throw new Error('Method not implemented.');
	}
	showModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): IModalDialogPromptInstance {
		throw new Error('Method not implemented.');
	}
	showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Promise<null> {
		throw new Error('Method not implemented.');
	}
}

export class TestCommandService implements ICommandService {
	declare readonly _serviceBrand: undefined;

	private readonly _instantiationService: TestInstantiationService;

	private readonly _onWillExecuteCommand = new Emitter<ICommandEvent>();
	public readonly onWillExecuteCommand = this._onWillExecuteCommand.event;

	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	public readonly onDidExecuteCommand = this._onDidExecuteCommand.event;

	constructor(instantiationService: TestInstantiationService) {
		this._instantiationService = instantiationService;
	}

	public executeCommand<T>(id: string, ...args: any[]): Promise<T> {
		const command = CommandsRegistry.getCommand(id);
		if (!command) {
			return Promise.reject(new Error(`command '${id}' not found`));
		}

		try {
			this._onWillExecuteCommand.fire({ commandId: id, args });
			const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]) as T;
			this._onDidExecuteCommand.fire({ commandId: id, args });
			return Promise.resolve(result);
		} catch (err) {
			return Promise.reject(err);
		}
	}
}

export class TestRuntimeSessionManager implements ILanguageRuntimeSessionManager {
	public static readonly instance = new TestRuntimeSessionManager();

	private _validateMetadata?: (metadata: ILanguageRuntimeMetadata) => Promise<ILanguageRuntimeMetadata>;

	async managesRuntime(runtime: ILanguageRuntimeMetadata): Promise<boolean> {
		return true;
	}

	async createSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: IRuntimeSessionMetadata): Promise<ILanguageRuntimeSession> {
		return new TestLanguageRuntimeSession(sessionMetadata, runtimeMetadata);
	}

	async restoreSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionMetadata: IRuntimeSessionMetadata): Promise<ILanguageRuntimeSession> {
		return new TestLanguageRuntimeSession(sessionMetadata, runtimeMetadata);
	}

	async validateMetadata(metadata: ILanguageRuntimeMetadata): Promise<ILanguageRuntimeMetadata> {
		if (this._validateMetadata) {
			return this._validateMetadata(metadata);
		}
		return metadata;
	}

	async validateSession(runtimeMetadata: ILanguageRuntimeMetadata, sessionId: string): Promise<boolean> {
		return true;
	}

	setValidateMetadata(handler: (metadata: ILanguageRuntimeMetadata) => Promise<ILanguageRuntimeMetadata>): void {
		this._validateMetadata = handler;
	}
}

export class TestConfigurationResolverService implements IConfigurationResolverService {
	_serviceBrand: undefined;

	get resolvableVariables(): ReadonlySet<string> {
		return new Set();
	}

	resolveAny(_folder: IWorkspaceFolder | undefined, value: any): any {
		return value;
	}

	async resolveAsync(_folder: IWorkspaceFolder | undefined, value: any): Promise<any> {
		return value;
	}

	resolveWithInteraction(_folder: IWorkspaceFolder | undefined, config: any): Promise<any> {
		return Promise.resolve(config);
	}

	resolveWithEnvironment(_environment: IProcessEnvironment, _folder: IWorkspaceFolderData | undefined, value: string): Promise<string> {
		return Promise.resolve(value);
	}

	resolveWithInteractionReplace(_folder: IWorkspaceFolder | undefined, config: any): Promise<any> {
		return Promise.resolve(config);
	}

	contributeVariable(_variable: string, _resolver: () => Promise<string | undefined>): void {
		// Mock implementation - does nothing
	}
}

export class TestDirectoryFileService implements IFileService {
	_serviceBrand: undefined;

	readonly onDidChangeFileSystemProviderRegistrations = Event.None;
	readonly onDidChangeFileSystemProviderCapabilities = Event.None;
	readonly onWillActivateFileSystemProvider = Event.None;
	readonly onDidFilesChange = Event.None;
	readonly onDidRunOperation = Event.None;
	readonly onError = Event.None;

	async stat(resource: URI): Promise<IFileStatWithMetadata> {
		if (resource.fsPath === '/non/existent/directory') {
			throw new Error('File not found');
		}
		return createFileStat(resource, false, false, true, false);
	}

	canHandleResource(_resource: URI): Promise<boolean> { return Promise.resolve(true); }
	hasProvider(_resource: URI): boolean { return true; }
	hasCapability(_resource: URI, _capability: any): boolean { return true; }
	listCapabilities(): any[] { return []; }
	registerProvider(): IDisposable { return { dispose: () => { } }; }
	getProvider(): any { return undefined; }
	activateProvider(_scheme: string): Promise<void> { return Promise.resolve(); }
	canCreateFile(): Promise<true | Error> { return Promise.resolve(true); }
	canMove(): Promise<true | Error> { return Promise.resolve(true); }
	canCopy(): Promise<true | Error> { return Promise.resolve(true); }
	canDelete(): Promise<true | Error> { return Promise.resolve(true); }
	exists(): Promise<boolean> { return Promise.resolve(true); }
	resolve(): Promise<IFileStatWithMetadata> { return this.stat(URI.file('/')); }
	realpath(): Promise<URI> { return Promise.resolve(URI.file('/')); }
	resolveAll(): Promise<any[]> { return Promise.resolve([]); }
	readFile(): Promise<any> { throw new Error('Not implemented'); }
	readFileStream(): Promise<any> { throw new Error('Not implemented'); }
	writeFile(): Promise<IFileStatWithMetadata> { throw new Error('Not implemented'); }
	move(): Promise<IFileStatWithMetadata> { throw new Error('Not implemented'); }
	copy(): Promise<IFileStatWithMetadata> { throw new Error('Not implemented'); }
	delete(): Promise<void> { throw new Error('Not implemented'); }
	del(): Promise<void> { throw new Error('Not implemented'); }
	createFile(): Promise<IFileStatWithMetadata> { throw new Error('Not implemented'); }
	createFolder(): Promise<IFileStatWithMetadata> { throw new Error('Not implemented'); }
	cloneFile(_source: URI, _target: URI): Promise<void> { throw new Error('Not implemented'); }
	watch(): IDisposable { return { dispose: () => { } }; }
	createWatcher(_resource: URI, _options: any): any { 
		return { 
			dispose: () => { },
			onDidChange: Event.None
		}; 
	}
	readonly onDidWatchError = Event.None;
	dispose(): void { }
}
