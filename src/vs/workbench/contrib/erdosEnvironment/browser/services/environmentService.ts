/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ILanguageRuntimeService, ILanguageRuntimeMetadata } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { IRuntimeSessionService, RuntimeClientType } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { EnvironmentClientInstance } from '../../../../services/languageRuntime/common/languageRuntimeEnvironmentClient.js';
import { 
	IErdosEnvironmentService, 
	IPythonEnvironment, 
	IRPackage, 
	IPythonPackage 
} from '../../common/environmentTypes.js';

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
	
	constructor(
		@ILanguageRuntimeService private readonly languageRuntimeService: ILanguageRuntimeService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		
		this.logService.debug('[ErdosEnvironmentService] Constructor - initializing service');
		
		this._register(this.languageRuntimeService.onDidRegisterRuntime(() => {
			this.environmentsChangedFireCount++;
			const stack = new Error().stack;
			this.logService.debug(`[ErdosEnvironmentService] Runtime registered - firing environments changed #${this.environmentsChangedFireCount}. Stack: ${stack?.split('\n')[3]?.trim()}`);
			this._onDidChangeEnvironments.fire();
		}));
		
		this._register(this.runtimeSessionService.onDidChangeForegroundSession((session) => {
			if (session) {
				this.activeEnvironmentChangedFireCount++;
				const stack = new Error().stack;
				this.logService.debug(`[ErdosEnvironmentService] Foreground session changed to: ${session.runtimeMetadata.languageId} - firing active environment changed #${this.activeEnvironmentChangedFireCount}. Stack: ${stack?.split('\n')[3]?.trim()}`);
				this._onDidChangeActiveEnvironment.fire(session.runtimeMetadata.languageId);
			}
		}));
		
		this.logService.debug('[ErdosEnvironmentService] Starting initialization');
		this.initializeEnvironments();
	}
	
	private async initializeEnvironments(): Promise<void> {
		this.logService.debug('[ErdosEnvironmentService] initializeEnvironments - calling refreshPythonEnvironments');
		await this.refreshPythonEnvironments();
	}
	
	async getPythonEnvironments(): Promise<IPythonEnvironment[]> {
		this.logService.debug(`[ErdosEnvironmentService] getPythonEnvironments - cache has ${this._pythonEnvironmentsCache.length} environments`);
		if (this._pythonEnvironmentsCache.length === 0) {
			this.logService.debug('[ErdosEnvironmentService] Cache empty, refreshing Python environments WITHOUT firing event');
			await this.refreshPythonEnvironmentsInternal(false); // Don't fire event to avoid infinite loop
		}
		this.logService.debug(`[ErdosEnvironmentService] Returning ${this._pythonEnvironmentsCache.length} Python environments`);
		return this._pythonEnvironmentsCache;
	}
	
	async refreshPythonEnvironments(): Promise<void> {
		this.logService.debug('[ErdosEnvironmentService] refreshPythonEnvironments - calling internal with event firing');
		await this.refreshPythonEnvironmentsInternal(true); // Fire event for external refresh calls
	}
	
	private async refreshPythonEnvironmentsInternal(fireEvent: boolean): Promise<void> {
		this.logService.debug(`[ErdosEnvironmentService] refreshPythonEnvironmentsInternal - starting (fireEvent: ${fireEvent})`);
		
		const pythonRuntimes = this.languageRuntimeService.registeredRuntimes
			.filter(runtime => runtime.languageId === 'python');
		
		this.logService.debug(`[ErdosEnvironmentService] Found ${pythonRuntimes.length} Python runtimes`);
		
		const environments: IPythonEnvironment[] = [];
		const activeSession = this.runtimeSessionService.getConsoleSessionForLanguage('python');
		
		this.logService.debug(`[ErdosEnvironmentService] Active Python session: ${activeSession ? activeSession.runtimeMetadata.runtimeId : 'none'}`);
		
		for (const runtime of pythonRuntimes) {
			const environment: IPythonEnvironment = {
				name: runtime.runtimeName,
				path: runtime.runtimePath,
				type: this.detectEnvironmentType(runtime.runtimePath, runtime.runtimeSource),
				version: runtime.languageVersion,
				isActive: activeSession?.runtimeMetadata.runtimeId === runtime.runtimeId,
				runtimeId: runtime.runtimeId
			};
			environments.push(environment);
			this.logService.debug(`[ErdosEnvironmentService] Added environment: ${environment.name} (${environment.type})`);
		}
		
		this._pythonEnvironmentsCache = environments;
		this.logService.debug(`[ErdosEnvironmentService] Updated cache with ${environments.length} environments`);
		
		if (fireEvent) {
			this.environmentsChangedFireCount++;
			const stack = new Error().stack;
			this.logService.debug(`[ErdosEnvironmentService] Firing environments changed event #${this.environmentsChangedFireCount}. Stack: ${stack?.split('\n')[3]?.trim()}`);
			this._onDidChangeEnvironments.fire();
		} else {
			this.logService.debug(`[ErdosEnvironmentService] NOT firing event (fireEvent=false)`);
		}
	}
	
	private detectEnvironmentType(runtimePath: string, runtimeSource: string): 'conda' | 'venv' | 'system' | 'pyenv' | 'pipenv' {
		if (runtimePath.includes('conda') || runtimeSource.includes('conda')) {
			return 'conda';
		}
		if (runtimePath.includes('venv') || runtimePath.includes('.venv')) {
			return 'venv';
		}
		if (runtimePath.includes('pyenv')) {
			return 'pyenv';
		}
		if (runtimePath.includes('pipenv')) {
			return 'pipenv';
		}
		return 'system';
	}
	
	getActiveEnvironment(languageId: 'python' | 'r'): ILanguageRuntimeMetadata | undefined {
		const activeSession = this.runtimeSessionService.getConsoleSessionForLanguage(languageId);
		return activeSession?.runtimeMetadata;
	}
	
	async getRPackages(runtimeId?: string): Promise<IRPackage[]> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('r')?.runtimeId;
		if (!targetRuntimeId) {
			return [];
		}
		
		if (!this._rPackagesCache.has(targetRuntimeId)) {
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
			const session = this.runtimeSessionService.getSession(targetRuntimeId);
			if (!session) {
				this.logService.warn(`No active session found for runtime ${targetRuntimeId}`);
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
			
			const environmentClient = new EnvironmentClientInstance(client, session.runtimeMetadata.languageId);
			
			// List R packages using the comm
			const packages = await environmentClient.listPackages('r');
			
			// Convert to our interface format
			const rPackages: IRPackage[] = packages.map(pkg => ({
				name: pkg.name,
				version: pkg.version,
				description: pkg.description,
				isLoaded: pkg.is_loaded || false,
				priority: pkg.priority
			}));
			
			this._rPackagesCache.set(targetRuntimeId, rPackages);
			this._onDidChangePackages.fire(targetRuntimeId);
		} catch (error) {
			this.logService.error(`Failed to refresh R packages: ${error}`);
			this.notificationService.error(`Failed to refresh R packages: ${error}`);
		}
	}
	
	async getPythonPackages(runtimeId?: string): Promise<IPythonPackage[]> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('python')?.runtimeId;
		if (!targetRuntimeId) {
			return [];
		}
		
		if (!this._pythonPackagesCache.has(targetRuntimeId)) {
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
			const session = this.runtimeSessionService.getSession(targetRuntimeId);
			if (!session) {
				this.logService.warn(`No active session found for runtime ${targetRuntimeId}`);
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
			
			const environmentClient = new EnvironmentClientInstance(client, session.runtimeMetadata.languageId);
			
			// List Python packages using the comm
			const packages = await environmentClient.listPackages('python');
			
			// Convert to our interface format
			const pythonPackages: IPythonPackage[] = packages.map(pkg => ({
				name: pkg.name,
				version: pkg.version,
				description: pkg.description,
				location: pkg.location,
				editable: pkg.editable || false
			}));
			
			this._pythonPackagesCache.set(targetRuntimeId, pythonPackages);
			this._onDidChangePackages.fire(targetRuntimeId);
		} catch (error) {
			this.logService.error(`Failed to refresh Python packages: ${error}`);
			this.notificationService.error(`Failed to refresh Python packages: ${error}`);
		}
	}
	
	async installPythonPackage(packageName: string, runtimeId?: string): Promise<void> {
		const targetRuntimeId = runtimeId || this.getActiveEnvironment('python')?.runtimeId;
		if (!targetRuntimeId) {
			throw new Error('No Python runtime available');
		}
		
		const session = this.runtimeSessionService.getSession(targetRuntimeId);
		if (!session) {
			throw new Error(`No active session found for runtime ${targetRuntimeId}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = new EnvironmentClientInstance(client, session.runtimeMetadata.languageId);
		
		const result = await environmentClient.installPackage(packageName, 'python');
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
		
		const session = this.runtimeSessionService.getSession(targetRuntimeId);
		if (!session) {
			throw new Error(`No active session found for runtime ${targetRuntimeId}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = new EnvironmentClientInstance(client, session.runtimeMetadata.languageId);
		
		const result = await environmentClient.uninstallPackage(packageName, 'python');
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
		
		const session = this.runtimeSessionService.getSession(targetRuntimeId);
		if (!session) {
			throw new Error(`No active session found for runtime ${targetRuntimeId}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = new EnvironmentClientInstance(client, session.runtimeMetadata.languageId);
		
		const result = await environmentClient.installPackage(packageName, 'r');
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
		
		const session = this.runtimeSessionService.getSession(targetRuntimeId);
		if (!session) {
			throw new Error(`No active session found for runtime ${targetRuntimeId}`);
		}
		
		const existingClients = await session.listClients(RuntimeClientType.Environment);
		const client = existingClients.length > 0 ?
			existingClients[0] :
			await session.createClient(RuntimeClientType.Environment, {});
		
		if (!client) {
			throw new Error(`No environment client available for runtime ${targetRuntimeId}`);
		}
		
		const environmentClient = new EnvironmentClientInstance(client, session.runtimeMetadata.languageId);
		
		const result = await environmentClient.uninstallPackage(packageName, 'r');
		if (!result.success) {
			throw new Error(result.error || 'Failed to remove package');
		}
		
		await this.refreshRPackages(targetRuntimeId);
	}
}
