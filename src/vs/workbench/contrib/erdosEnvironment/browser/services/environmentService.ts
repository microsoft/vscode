/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILanguageRuntimeService, ILanguageRuntimeMetadata, LanguageRuntimeSessionMode } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionService, RuntimeClientType, IRuntimeClientInstance, RuntimeStartMode } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { RuntimeClientState } from '../../../../services/languageRuntime/common/languageRuntimeClientInstance.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { EnvironmentClientInstance } from '../../../../services/languageRuntime/common/languageRuntimeEnvironmentClient.js';
import { PackageInfo } from '../../../../services/languageRuntime/common/erdosEnvironmentComm.js';
import { 
	IErdosEnvironmentService, 
	IPythonEnvironment, 
	IRPackage, 
	IPythonPackage,
	PythonEnvironmentType 
} from '../../common/environmentTypes.js';

interface PythonRuntimeExtraData {
	pythonPath: string;
	ipykernelBundle?: unknown;
	externallyManaged?: boolean;
	supported?: boolean;
	environmentType?: string;
	environmentName?: string;
	environmentPath?: string;
	sysPrefix?: string;
	tools?: string[];
	workspaceFolder?: string;
	displayName?: string;
	description?: string;
	envKind?: string;
}

export class EnvironmentService extends Disposable implements IErdosEnvironmentService {
	
	declare readonly _serviceBrand: undefined;
	
	private readonly _onDidChangeEnvironments = this._register(new Emitter<void>());
	readonly onDidChangeEnvironments = this._onDidChangeEnvironments.event;
	
	private readonly _onDidChangePackages = this._register(new Emitter<string>());
	readonly onDidChangePackages = this._onDidChangePackages.event;
	
	private readonly _onDidChangeActiveEnvironment = this._register(new Emitter<string>());
	readonly onDidChangeActiveEnvironment = this._onDidChangeActiveEnvironment.event;
	
	// Debug counters to track event firing
	private environmentsChangedFireCount = 0;
	private activeEnvironmentChangedFireCount = 0;
	
	private _pythonEnvironmentsCache: IPythonEnvironment[] = [];
	private _rPackagesCache = new Map<string, IRPackage[]>();
	private _pythonPackagesCache = new Map<string, IPythonPackage[]>();
	
	// Track environment clients for proper disposal
	private _environmentClients = new Map<string, EnvironmentClientInstance>();
	
	constructor(
		@ILanguageRuntimeService private readonly languageRuntimeService: ILanguageRuntimeService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		
		this._register(this.languageRuntimeService.onDidRegisterRuntime((runtime) => {
			this.environmentsChangedFireCount++;
			
			// CRITICAL FIX: Clear the Python environments cache when new runtimes are registered
			// This ensures that the next call to getPythonEnvironments() will refresh and see all runtimes
			if (runtime.languageId === 'python') {
				this._pythonEnvironmentsCache = [];
			}
			
			this._onDidChangeEnvironments.fire();
		}));
		
		this._register(this.runtimeSessionService.onDidChangeForegroundSession((session) => {
			if (session) {
				this.activeEnvironmentChangedFireCount++;
				this._onDidChangeActiveEnvironment.fire(session.runtimeMetadata.languageId);
			}
		}));
		
		// Listen for runtime sessions starting (following plots pattern)
		this._register(this.runtimeSessionService.onDidStartRuntime((session) => {
			this.attachToRuntimeSession(session);
		}));
		
		this.initializeEnvironments();
	}
	
	private getOrCreateEnvironmentClient(client: IRuntimeClientInstance<any, any>, runtimeId: string, languageId: string): EnvironmentClientInstance {
		// Check if we already have a client for this runtime
		let environmentClient = this._environmentClients.get(runtimeId);
		if (!environmentClient) {
			// Create new client and register for disposal
			environmentClient = new EnvironmentClientInstance(client, languageId);
			this._register(environmentClient);
			this._environmentClients.set(runtimeId, environmentClient);
		}
		return environmentClient;
	}
	
	private async waitForClientReady(client: IRuntimeClientInstance<any, any>, timeoutMs: number): Promise<void> {
		if (client.clientState.get() === RuntimeClientState.Connected) {
			return;
		}
		
		return new Promise((resolve, reject) => {
			let disposed = false;
			
			const timeoutHandle = setTimeout(() => {
				if (!disposed) {
					disposed = true;
					reject(new Error(`Client ${client.getClientId()} did not become ready within ${timeoutMs}ms`));
				}
			}, timeoutMs);
			
			const clientStateEvent = Event.fromObservable(client.clientState);
			const disposable = clientStateEvent((state: RuntimeClientState) => {
				if (!disposed) {
					if (state === RuntimeClientState.Connected) {
						disposed = true;
						clearTimeout(timeoutHandle);
						disposable.dispose();
						resolve();
					} else if (state === RuntimeClientState.Closed) {
						disposed = true;
						clearTimeout(timeoutHandle);
						disposable.dispose();
						reject(new Error(`Client ${client.getClientId()} was closed before becoming ready`));
					}
				}
			});
		});
	}
	
	private async waitForSessionReady(session: any, timeoutMs: number = 15000): Promise<void> {
		if (session.dynState && !session.dynState.busy) {
			return;
		}
		
		return new Promise<void>((resolve, reject) => {
			let disposed = false;
			let checkCount = 0;
			const maxChecks = Math.floor(timeoutMs / 500);
			
			const timeoutHandle = setTimeout(() => {
				if (!disposed) {
					disposed = true;
					reject(new Error(`Session ${session.sessionId} did not become idle within ${timeoutMs}ms`));
				}
			}, timeoutMs);
			
			const checkInterval = setInterval(() => {
				if (disposed) {
					clearInterval(checkInterval);
					return;
				}
				
				checkCount++;
				
				try {
					if (session.dynState && !session.dynState.busy) {
						disposed = true;
						clearTimeout(timeoutHandle);
						clearInterval(checkInterval);
						resolve();
					} else if (checkCount >= maxChecks) {
						disposed = true;
						clearTimeout(timeoutHandle);
						clearInterval(checkInterval);
						reject(new Error(`Session ${session.sessionId} still not idle after ${maxChecks} checks`));
					}
				} catch (error) {
					// Continue checking, don't fail on individual check errors
				}
			}, 500);
		});
	}
	
	private async initializeEnvironments(): Promise<void> {
		await this.refreshPythonEnvironments();
	}
	
	private attachToRuntimeSession(session: any): void {
		if (!session) {
			this.logService.error(`[ErdosEnvironmentService] Received null session.`);
			return;
		}

		// Create environment client for this session (async operation)
		this.createEnvironmentClientForSession(session).then(() => {
			// Trigger refresh for packages after client is created
			const languageId = session.runtimeMetadata.languageId;
			if (languageId === 'r') {
				this.refreshRPackages(session.runtimeMetadata.runtimeId).catch(error => {
					this.logService.error(`Failed to refresh R packages for ${session.sessionId}: ${error}`);
				});
			} else if (languageId === 'python') {
				this.refreshPythonPackages(session.runtimeMetadata.runtimeId).catch(error => {
					// Extract proper error message, handling nested objects
					let errorMessage: string;
					if (error instanceof Error) {
						errorMessage = error.message;
					} else if (error && typeof error === 'object' && 'message' in error) {
						errorMessage = typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
					} else {
						errorMessage = String(error);
					}
					
					const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
					this.logService.error(`Failed to refresh Python packages for ${session.sessionId}:`);
					this.logService.error(`  Message: ${errorMessage}`);
					this.logService.error(`  Details: ${errorDetails}`);
				});
			}
		}).catch(error => {
			this.logService.error(`Failed to attach environment client to runtime ${session.sessionId}: ${error}`);
		});
	}
	
	private async createEnvironmentClientForSession(session: any): Promise<void> {
		
		try {
			const existingClients: IRuntimeClientInstance<any, any>[] = await session.listClients(RuntimeClientType.Environment);
			
			if (existingClients.length > 1) {
				const clientIds = existingClients.map((client: IRuntimeClientInstance<any, any>) => client.getClientId()).join(', ');
				this.logService.warn(
					`Session ${session.dynState.sessionName} has multiple environment clients: ` +
					`${clientIds}`);
			}
			
			const client = existingClients.length > 0 ?
				existingClients[0] :
				await session.createClient(RuntimeClientType.Environment, {});
			
			if (!client) {
				this.logService.error(`Failed to create environment client for session ${session.sessionId}`);
				return;
			}
			
			
		} catch (error) {
			this.logService.error(`Failed to create environment client for runtime ${session.sessionId}: ${error}`);
			throw error;
		}
	}
	
	async getPythonEnvironments(): Promise<IPythonEnvironment[]> {
		if (this._pythonEnvironmentsCache.length === 0) {
			await this.refreshPythonEnvironmentsInternal(false); // Don't fire event to avoid infinite loop
		}
		return this._pythonEnvironmentsCache;
	}
	
	async refreshPythonEnvironments(): Promise<void> {
		await this.refreshPythonEnvironmentsInternal(true); // Fire event for external refresh calls
	}
	
	private async refreshPythonEnvironmentsInternal(fireEvent: boolean): Promise<void> {
		
		const allRuntimes = this.languageRuntimeService.registeredRuntimes;
		
		const pythonRuntimes = allRuntimes.filter(runtime => runtime.languageId === 'python');
		
		const environments: IPythonEnvironment[] = [];
		const activeSession = this.runtimeSessionService.getConsoleSessionForLanguage('python');
		
		// Convert registered runtimes to environment objects
		for (const runtime of pythonRuntimes) {
			const extraData = runtime.extraRuntimeData as PythonRuntimeExtraData | undefined;
			const environment: IPythonEnvironment = {
				name: extraData?.environmentName || runtime.runtimeName,
				path: runtime.runtimePath,
				type: this.mapPythonEnvironmentType(runtime),
				version: runtime.languageVersion,
				isActive: activeSession?.runtimeMetadata.runtimeId === runtime.runtimeId,
				runtimeId: runtime.runtimeId,
				displayName: extraData?.displayName || runtime.runtimeName,
				description: extraData?.description,
				environmentPath: extraData?.environmentPath,
				sysPrefix: extraData?.sysPrefix,
				tools: extraData?.tools || [],
				workspaceFolder: extraData?.workspaceFolder
			};
			environments.push(environment);
		}

		this._pythonEnvironmentsCache = environments;

		if (fireEvent) {
			this.environmentsChangedFireCount++;
			this._onDidChangeEnvironments.fire();
		}
	}
	
	private mapPythonEnvironmentType(runtimeMetadata: ILanguageRuntimeMetadata): PythonEnvironmentType {
		// Extract environment type from runtime metadata's extraRuntimeData
		const extraData = runtimeMetadata.extraRuntimeData as PythonRuntimeExtraData | undefined;
		
		if (extraData?.environmentType) {
			// Map from Python extension API values to our PythonEnvironmentType enum for UI display
			// Python extension API returns only: 'Conda', 'VirtualEnvironment', 'Unknown'
			switch (extraData.environmentType) {
				case 'Conda':
					return PythonEnvironmentType.Conda;
				case 'VirtualEnvironment':
					return PythonEnvironmentType.VirtualEnv;
				case 'Unknown':
					return PythonEnvironmentType.Unknown;
			}
		}
		
		// If no environment type data available, return Unknown
		return PythonEnvironmentType.Unknown;
	}

	private getEnvironmentTypeForRuntime(runtimeId: string): string | undefined {
		// Find the runtime metadata for the given runtimeId
		const runtime = this.languageRuntimeService.getRegisteredRuntime(runtimeId);
		if (!runtime) {
			return undefined;
		}

		const extraData = runtime.extraRuntimeData as PythonRuntimeExtraData | undefined;
		return extraData?.environmentType;
	}
	
	getActiveEnvironment(languageId: 'python' | 'r'): ILanguageRuntimeMetadata | undefined {
		const activeSession = this.runtimeSessionService.getConsoleSessionForLanguage(languageId);
		return activeSession?.runtimeMetadata;
	}

	async switchToEnvironment(environment: IPythonEnvironment): Promise<void> {
		if (!environment.runtimeId) {
			throw new Error('Cannot switch to environment: no runtime ID available');
		}

		try {
			// Check if runtime is registered
			const runtime = this.languageRuntimeService.getRegisteredRuntime(environment.runtimeId);
			if (!runtime) {
				this.logService.error(`[EnvironmentService] Runtime not found: ${environment.runtimeId}`);
				throw new Error(`Runtime ${environment.runtimeId} is not registered`);
			}
			// Check if there's already a console session for this runtime
			const existingSession = this.runtimeSessionService.getConsoleSessionForRuntime(environment.runtimeId);
			if (existingSession) {
				this.runtimeSessionService.foregroundSession = existingSession;
				return;
			}

			// Start a new console session for this environment
			const sessionId = await this.runtimeSessionService.startNewRuntimeSession(
				environment.runtimeId,
				`Python (${environment.name})`,
				LanguageRuntimeSessionMode.Console,
				undefined, // notebookUri
				'Environment switch from environment manager',
				RuntimeStartMode.Starting,
				true // activate - makes this the foreground session
			);

			// Verify the session was created and is active
			const newSession = this.runtimeSessionService.getSession(sessionId);
			if (!newSession) {
				this.logService.error(`[EnvironmentService] Session ${sessionId} not found after creation`);
				throw new Error(`Session ${sessionId} was not created properly`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			this.logService.error(`[EnvironmentService] Failed to switch to Python environment ${environment.name}: ${errorMessage}`);
			if (errorStack) {
				this.logService.error(`[EnvironmentService] Error stack:`, errorStack);
			}
			throw new Error(`Failed to switch to environment ${environment.name}: ${errorMessage}`);
		}
	}
	
	async getRPackages(runtimeId?: string, forceRefresh = false): Promise<IRPackage[]> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('r')?.runtimeId;
		if (!targetRuntimeId) {
			return [];
		}
		
		const hasCache = this._rPackagesCache.has(targetRuntimeId);
		
		if (!hasCache || forceRefresh) {
			await this.refreshRPackages(targetRuntimeId);
		}
		
		return this._rPackagesCache.get(targetRuntimeId) || [];
	}
	
	async refreshRPackages(runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('r')?.runtimeId;
		if (!targetRuntimeId) {
			return;
		}
		
		try {
			const session = this.runtimeSessionService.getConsoleSessionForRuntime(targetRuntimeId);
			if (!session) {
				const allSessions = this.runtimeSessionService.activeSessions.map(s => ({
					id: s.sessionId,
					runtimeId: s.runtimeMetadata.runtimeId,
					mode: s.metadata.sessionMode,
					busy: s.dynState?.busy || false
				}));
				this.logService.warn(`No CONSOLE session found for runtime ${targetRuntimeId}. All sessions: ${JSON.stringify(allSessions)}`);
				return;
			}
			
			const existingClients = await session.listClients(RuntimeClientType.Environment);
			const client = existingClients.length > 0 ?
				existingClients[0] :
				await session.createClient(RuntimeClientType.Environment, {});
			
			if (!client) {
				this.logService.warn(`No environment client available for runtime ${targetRuntimeId}`);
				return;
			}
			
			const environmentClient = this.getOrCreateEnvironmentClient(client, targetRuntimeId, session.runtimeMetadata.languageId);
			
			// Wait for client and session to be ready if this is a new client
			if (existingClients.length === 0) {
				await this.waitForClientReady(client, 10000);
				await this.waitForSessionReady(session, 15000);
			}
			
			const packages = await environmentClient.listPackages('r');
			
			const rPackages: IRPackage[] = packages.map((pkg: PackageInfo) => ({
				name: pkg.name,
				version: pkg.version,
				description: pkg.description,
				isLoaded: pkg.is_loaded || false,
				location: pkg.location || '',
				priority: pkg.priority ? String(pkg.priority) : undefined
			}));
			
			this._rPackagesCache.set(targetRuntimeId, rPackages);
			this._onDidChangePackages.fire(targetRuntimeId);
		} catch (error) {
			let errorMessage: string;
			if (error instanceof Error) {
				errorMessage = error.message;
			} else if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
			} else {
				errorMessage = String(error);
			}
			
			// Don't show error notifications for "kernel not started" - this is expected during startup
			if (errorMessage.includes('kernel not started') || errorMessage.includes('Cannot list clients')) {
				this.logService.debug(`R kernel not ready yet for runtime ${targetRuntimeId}: ${errorMessage}`);
				return; // Silently fail - kernel will be ready later
			}
			
			this.logService.error(`Failed to refresh R packages: ${errorMessage}`);
			this.notificationService.error(`Failed to refresh R packages: ${errorMessage}`);
		}
	}
	
	async getPythonPackages(runtimeId?: string, forceRefresh = false): Promise<IPythonPackage[]> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('python')?.runtimeId;
		if (!targetRuntimeId) {
			return [];
		}
		
		const hasCache = this._pythonPackagesCache.has(targetRuntimeId);
		
		if (!hasCache || forceRefresh) {
			await this.refreshPythonPackages(targetRuntimeId);
		}
		
		return this._pythonPackagesCache.get(targetRuntimeId) || [];
	}
	
	async refreshPythonPackages(runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('python')?.runtimeId;
		if (!targetRuntimeId) {
			return;
		}
		
		try {
			const session = this.runtimeSessionService.getConsoleSessionForRuntime(targetRuntimeId);
			if (!session) {
				const allSessions = this.runtimeSessionService.activeSessions.map(s => ({
					id: s.sessionId,
					runtimeId: s.runtimeMetadata.runtimeId,
					mode: s.metadata.sessionMode,
					busy: s.dynState?.busy || false
				}));
				this.logService.warn(`No CONSOLE session found for runtime ${targetRuntimeId}. All sessions: ${JSON.stringify(allSessions)}`);
				return;
			}
			
			// Get or create the environment client for this session
			const existingClients = await session.listClients(RuntimeClientType.Environment);
			const client = existingClients.length > 0 ?
				existingClients[0] :
				await session.createClient(RuntimeClientType.Environment, {});
			
			if (!client) {
				this.logService.warn(`No environment client available for runtime ${targetRuntimeId}`);
				return;
			}
			
			const environmentClient = this.getOrCreateEnvironmentClient(client, targetRuntimeId, session.runtimeMetadata.languageId);
			
			// Wait for client and session to be ready if this is a new client
			if (existingClients.length === 0) {
				await this.waitForClientReady(client, 10000);
				await this.waitForSessionReady(session, 15000);
			}
			const packages = await environmentClient.listPackages('python');
			const pythonPackages: IPythonPackage[] = packages.map((pkg: PackageInfo) => ({
				name: pkg.name,
				version: pkg.version,
				description: pkg.description,
				location: pkg.location,
				editable: pkg.editable || false
			}));
			
			this._pythonPackagesCache.set(targetRuntimeId, pythonPackages);
			this._onDidChangePackages.fire(targetRuntimeId);
		} catch (error) {
			let errorMessage: string;
			if (error instanceof Error) {
				errorMessage = error.message;
			} else if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
			} else {
				errorMessage = String(error);
			}
			
			this.logService.error(`Failed to refresh Python packages: ${errorMessage}`);
			this.notificationService.error(`Failed to refresh Python packages: ${errorMessage}`);
		}
	}
	
	async installPythonPackage(packageName: string, runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('python')?.runtimeId;
		if (!targetRuntimeId) {
			throw new Error('No Python runtime available');
		}
		
		const session = this.runtimeSessionService.getConsoleSessionForRuntime(targetRuntimeId);
		if (!session) {
			const allSessions = this.runtimeSessionService.activeSessions.map(s => ({
				id: s.sessionId,
				runtimeId: s.runtimeMetadata.runtimeId,
				mode: s.metadata.sessionMode,
				busy: s.dynState?.busy || false
			}));
			throw new Error(`No CONSOLE session found for runtime ${targetRuntimeId}. All sessions: ${JSON.stringify(allSessions)}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = this.getOrCreateEnvironmentClient(client, targetRuntimeId, session.runtimeMetadata.languageId);
		
		// Get environment type from runtime metadata
		const environmentType = this.getEnvironmentTypeForRuntime(targetRuntimeId);
		
		const result = await environmentClient.installPackage(packageName, 'python', environmentType);
		if (!result.success) {
			throw new Error(result.error || 'Failed to install package');
		}
		
		await this.refreshPythonPackages(targetRuntimeId);
	}
	
	async uninstallPythonPackage(packageName: string, runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('python')?.runtimeId;
		if (!targetRuntimeId) {
			throw new Error('No Python runtime available');
		}
		
		const session = this.runtimeSessionService.getConsoleSessionForRuntime(targetRuntimeId);
		if (!session) {
			const allSessions = this.runtimeSessionService.activeSessions.map(s => ({
				id: s.sessionId,
				runtimeId: s.runtimeMetadata.runtimeId,
				mode: s.metadata.sessionMode,
				busy: s.dynState?.busy || false
			}));
			throw new Error(`No CONSOLE session found for runtime ${targetRuntimeId}. All sessions: ${JSON.stringify(allSessions)}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = this.getOrCreateEnvironmentClient(client, targetRuntimeId, session.runtimeMetadata.languageId);
		
		// Get environment type from runtime metadata
		const environmentType = this.getEnvironmentTypeForRuntime(targetRuntimeId);
		
		const result = await environmentClient.uninstallPackage(packageName, 'python', environmentType);
		if (!result.success) {
			throw new Error(result.error || 'Failed to uninstall package');
		}
		
		await this.refreshPythonPackages(targetRuntimeId);
	}
	
	async installRPackage(packageName: string, runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('r')?.runtimeId;
		if (!targetRuntimeId) {
			throw new Error('No R runtime available');
		}
		
		const session = this.runtimeSessionService.getConsoleSessionForRuntime(targetRuntimeId);
		if (!session) {
			const allSessions = this.runtimeSessionService.activeSessions.map(s => ({
				id: s.sessionId,
				runtimeId: s.runtimeMetadata.runtimeId,
				mode: s.metadata.sessionMode,
				busy: s.dynState?.busy || false
			}));
			throw new Error(`No CONSOLE session found for runtime ${targetRuntimeId}. All sessions: ${JSON.stringify(allSessions)}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = this.getOrCreateEnvironmentClient(client, targetRuntimeId, session.runtimeMetadata.languageId);
		
		// R environments don't have the same type complexity as Python, but pass undefined for consistency
		const result = await environmentClient.installPackage(packageName, 'r', undefined);
		if (!result.success) {
			throw new Error(result.error || 'Failed to install package');
		}
		
		await this.refreshRPackages(targetRuntimeId);
	}
	
	async removeRPackage(packageName: string, runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('r')?.runtimeId;
		if (!targetRuntimeId) {
			throw new Error('No R runtime available');
		}
		
		const session = this.runtimeSessionService.getConsoleSessionForRuntime(targetRuntimeId);
		if (!session) {
			const allSessions = this.runtimeSessionService.activeSessions.map(s => ({
				id: s.sessionId,
				runtimeId: s.runtimeMetadata.runtimeId,
				mode: s.metadata.sessionMode,
				busy: s.dynState?.busy || false
			}));
			throw new Error(`No CONSOLE session found for runtime ${targetRuntimeId}. All sessions: ${JSON.stringify(allSessions)}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = this.getOrCreateEnvironmentClient(client, targetRuntimeId, session.runtimeMetadata.languageId);
		
		// R environments don't have the same type complexity as Python, but pass undefined for consistency
		const result = await environmentClient.uninstallPackage(packageName, 'r', undefined);
		if (!result.success) {
			throw new Error(result.error || 'Failed to remove package');
		}
		
		await this.refreshRPackages(targetRuntimeId);
	}
}
