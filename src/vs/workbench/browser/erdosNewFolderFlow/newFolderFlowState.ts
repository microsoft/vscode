/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageRuntimeMetadata, LanguageStartupBehavior, RuntimeStartupPhase } from '../../services/languageRuntime/common/languageRuntimeService.js';
import { EnvironmentSetupType, NewFolderFlowStep, PythonEnvironmentProvider } from './interfaces/newFolderFlowEnums.js';
import { PythonEnvironmentProviderInfo } from './utilities/pythonEnvironmentStepUtils.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { FlowFormattedTextItem } from './components/flowFormattedText.js';
import { LanguageIds, FolderTemplate } from '../../services/erdosNewFolder/common/erdosNewFolder.js';
import { CondaPythonVersionInfo, EMPTY_CONDA_PYTHON_VERSION_INFO } from './utilities/condaUtils.js';
import { UvPythonVersionInfo, EMPTY_UV_PYTHON_VERSION_INFO } from './utilities/uvUtils.js';
import { URI } from '../../../base/common/uri.js';
import { ErdosReactServices } from '../../../base/browser/erdosReactServices.js';

export interface NewFolderFlowStateConfig {
	readonly parentFolder: URI;
	readonly initialStep: NewFolderFlowStep;
	readonly steps?: NewFolderFlowStep[];
}

export interface NewFolderFlowState {
	selectedRuntime: ILanguageRuntimeMetadata | undefined;
	folderTemplate: FolderTemplate | undefined;
	folderName: string;
	parentFolder: URI;
	initGitRepo: boolean;
	openInNewWindow: boolean;
	createPyprojectToml: boolean | undefined;
	pythonEnvSetupType: EnvironmentSetupType | undefined;
	pythonEnvProviderId: string | undefined;
	condaPythonVersion: string | undefined;
	uvPythonVersion: string | undefined;
	readonly pythonEnvProviderName: string | undefined;
	readonly installIpykernel: boolean | undefined;
	useRenv: boolean | undefined;
}

export interface INewFolderFlowStateManager {
	readonly getState: () => NewFolderFlowState;
	readonly goToNextStep: (step: NewFolderFlowStep) => void;
	readonly goToPreviousStep: () => void;
	readonly onUpdateInterpreterState: Event<void>;
	readonly onUpdateFolderPath: Event<void>;
}

export class NewFolderFlowStateManager
	extends Disposable
	implements INewFolderFlowStateManager {
	private _services: ErdosReactServices;

	private _selectedRuntime: ILanguageRuntimeMetadata | undefined;
	private _availableFolderTemplates: FolderTemplate[];
	private _folderTemplate: FolderTemplate | undefined;
	private _folderName: string;
	private _folderNameFeedback: FlowFormattedTextItem | undefined;
	private _parentFolder: URI;
	private _initGitRepo: boolean;
	private _openInNewWindow: boolean;

	private _pythonEnvSetupType: EnvironmentSetupType | undefined;
	private _pythonEnvProviderId: string | undefined;
	private _installIpykernel: boolean | undefined;
	private _createPyprojectToml: boolean | undefined;
	private _minimumPythonVersion: string | undefined;
	private _condaPythonVersion: string | undefined;
	private _condaPythonVersionInfo: CondaPythonVersionInfo | undefined;
	private _isCondaInstalled: boolean | undefined;
	private _uvPythonVersion: string | undefined;
	private _uvPythonVersionInfo: UvPythonVersionInfo | undefined;
	private _isUvInstalled: boolean | undefined;

	private _useRenv: boolean | undefined;
	private _minimumRVersion: string | undefined;

	private _steps: NewFolderFlowStep[];
	private _currentStep: NewFolderFlowStep;

	private _runtimeStartupComplete: boolean;
	private _pythonEnvProviders: PythonEnvironmentProviderInfo[] | undefined;
	private _interpreters: ILanguageRuntimeMetadata[] | undefined;
	private _preferredInterpreter: ILanguageRuntimeMetadata | undefined;

	private _onUpdateInterpreterStateEmitter = this._register(new Emitter<void>());
	private _onUpdateFolderPathEmitter = this._register(new Emitter<void>());

	constructor(config: NewFolderFlowStateConfig) {
		super();

		this._services = ErdosReactServices.services;
		this._selectedRuntime = undefined;
		this._availableFolderTemplates = this._getAvailableFolderTemplates();
		this._folderTemplate = undefined;
		this._folderName = '';
		this._folderNameFeedback = undefined;
		this._parentFolder = config.parentFolder ?? '';
		this._initGitRepo = false;
		this._openInNewWindow = true;
		this._pythonEnvSetupType = EnvironmentSetupType.NewEnvironment;
		this._pythonEnvProviderId = undefined;
		this._installIpykernel = undefined;
		this._useRenv = undefined;
		this._steps = config.steps ?? [config.initialStep];
		this._currentStep = config.initialStep;
		this._createPyprojectToml = undefined;
		this._pythonEnvProviders = undefined;
		this._interpreters = undefined;
		this._preferredInterpreter = undefined;
		this._runtimeStartupComplete = false;
		this._minimumPythonVersion = undefined;
		this._condaPythonVersionInfo = undefined;
		this._uvPythonVersionInfo = undefined;
		this._minimumRVersion = undefined;

		if (this._services.languageRuntimeService.startupPhase === RuntimeStartupPhase.Complete) {
			this._initDefaultsFromExtensions()
				.then(() => {
					this._runtimeStartupComplete = true;
					this._updateInterpreterRelatedState();
				});
		} else {
			this._register(
				this._services.languageRuntimeService.onDidChangeRuntimeStartupPhase(
					async (phase) => {
						if (phase === RuntimeStartupPhase.Discovering) {
							await this._initDefaultsFromExtensions();
						} else if (phase === RuntimeStartupPhase.Complete) {
							await this._initDefaultsFromExtensions();
							this._runtimeStartupComplete = true;
							await this._updateInterpreterRelatedState();
						}
					}
				)
			);
		}
	}

	get selectedRuntime(): ILanguageRuntimeMetadata | undefined {
		if (this._selectedRuntime) {
			return this._selectedRuntime;
		}

		this._resetSelectedRuntime();
		return this._selectedRuntime;
	}

	set selectedRuntime(value: ILanguageRuntimeMetadata | undefined) {
		this._selectedRuntime = value;
		this._updateInterpreterRelatedState();
	}

	get availableFolderTemplates(): FolderTemplate[] {
		return this._availableFolderTemplates;
	}

	get folderTemplate(): FolderTemplate | undefined {
		return this._folderTemplate;
	}

	set folderTemplate(folderTemplate: FolderTemplate | undefined) {
		if (this._folderTemplate !== folderTemplate) {
			this._resetFolderConfig();
		}
		if (folderTemplate === FolderTemplate.PythonProject) {
			this.createPyprojectToml = true;
		}
		this._folderTemplate = folderTemplate;
		this._updateInterpreterRelatedState();
	}

	get folderName(): string {
		return this._folderName;
	}

	set folderName(value: string) {
		this._folderName = value;
		this._onUpdateFolderPathEmitter.fire();
	}

	get folderNameFeedback(): FlowFormattedTextItem | undefined {
		return this._folderNameFeedback;
	}

	set folderNameFeedback(value: FlowFormattedTextItem | undefined) {
		this._folderNameFeedback = value;
		this._onUpdateFolderPathEmitter.fire();
	}

	get parentFolder(): URI {
		return this._parentFolder;
	}

	set parentFolder(value: URI) {
		this._parentFolder = value;
		this._onUpdateFolderPathEmitter.fire();
	}

	get initGitRepo(): boolean {
		return this._initGitRepo;
	}

	set initGitRepo(value: boolean) {
		this._initGitRepo = value;
	}

	get createPyprojectToml(): boolean | undefined {
		return this._createPyprojectToml;
	}

	set createPyprojectToml(value: boolean | undefined) {
		this._createPyprojectToml = value;
	}

	get openInNewWindow(): boolean {
		return this._openInNewWindow;
	}

	set openInNewWindow(value: boolean) {
		this._openInNewWindow = value;
	}

	get pythonEnvSetupType(): EnvironmentSetupType | undefined {
		return this._pythonEnvSetupType;
	}

	set pythonEnvSetupType(value: EnvironmentSetupType | undefined) {
		this._pythonEnvSetupType = value;
		this._updateInterpreterRelatedState();
	}

	get pythonEnvProvider(): string | undefined {
		return this._pythonEnvProviderId;
	}

	set pythonEnvProvider(value: string | undefined) {
		this._pythonEnvProviderId = value;
		this._updateInterpreterRelatedState();
	}

	get installIpykernel(): boolean | undefined {
		return this._installIpykernel;
	}

	get useRenv(): boolean | undefined {
		return this._useRenv;
	}

	set useRenv(value: boolean | undefined) {
		this._useRenv = value;
	}

	get condaPythonVersion(): string | undefined {
		return this._condaPythonVersion;
	}

	set condaPythonVersion(value: string | undefined) {
		this._condaPythonVersion = value;
	}

	get uvPythonVersion(): string | undefined {
		return this._uvPythonVersion;
	}

	set uvPythonVersion(value: string | undefined) {
		this._uvPythonVersion = value;
	}

	get minimumPythonVersion(): string | undefined {
		return this._minimumPythonVersion;
	}

	get minimumRVersion(): string | undefined {
		return this._minimumRVersion;
	}

	get pythonEnvProviders(): PythonEnvironmentProviderInfo[] | undefined {
		return this._pythonEnvProviders;
	}

	get condaPythonVersionInfo(): CondaPythonVersionInfo | undefined {
		return this._condaPythonVersionInfo;
	}

	get uvPythonVersionInfo(): UvPythonVersionInfo | undefined {
		return this._uvPythonVersionInfo;
	}

	get isCondaInstalled(): boolean | undefined {
		return this._isCondaInstalled;
	}

	get isUvInstalled(): boolean | undefined {
		return this._isUvInstalled;
	}

	get usesCondaEnv(): boolean {
		return this._usesCondaEnv();
	}

	get usesUvEnv(): boolean {
		return this._usesUvEnv();
	}

	get interpreters(): ILanguageRuntimeMetadata[] | undefined {
		return this._interpreters;
	}

	get preferredInterpreter(): ILanguageRuntimeMetadata | undefined {
		return this._preferredInterpreter;
	}

	get currentStep(): NewFolderFlowStep {
		return this._currentStep;
	}

	get services(): ErdosReactServices {
		return this._services;
	}

	goToNextStep(step: NewFolderFlowStep): NewFolderFlowStep {
		const stepAlreadyExists =
			this._steps.findIndex((s) => s === step) !== -1;
		if (stepAlreadyExists) {
			this._services.logService.error(
				'[New Folder Flow] Step already exists'
			);
			return this._currentStep;
		}
		this._steps.push(step);
		this._currentStep = step;
		return this._currentStep;
	}

	goToPreviousStep(): NewFolderFlowStep {
		const currentStepIsFirstStep =
			this._steps.findIndex((step) => step === this._currentStep) === 0;
		if (currentStepIsFirstStep) {
			this._services.logService.error(
				'[New Folder Flow] No previous step to go to'
			);
			return this._currentStep;
		}
		this._steps.pop();
		this._currentStep = this._steps[this._steps.length - 1];
		return this._currentStep;
	}

	getState(): NewFolderFlowState {
		this._cleanupConfigureState();
		return {
			selectedRuntime: this._selectedRuntime,
			folderTemplate: this._folderTemplate,
			folderName: this._folderName,
			parentFolder: this._parentFolder,
			initGitRepo: this._initGitRepo,
			openInNewWindow: this._openInNewWindow,
			pythonEnvSetupType: this._pythonEnvSetupType,
			pythonEnvProviderId: this._pythonEnvProviderId,
			pythonEnvProviderName: this._getEnvProviderName(),
			installIpykernel: this._installIpykernel,
			createPyprojectToml: this._createPyprojectToml,
			condaPythonVersion: this._condaPythonVersion,
			uvPythonVersion: this._uvPythonVersion,
			useRenv: this._useRenv,
		} satisfies NewFolderFlowState;
	}

	readonly onUpdateInterpreterState = this._onUpdateInterpreterStateEmitter.event;

	readonly onUpdateFolderPath = this._onUpdateFolderPathEmitter.event;

	private async _initDefaultsFromExtensions() {
		if (!this.pythonEnvProviders?.length) {
			await this._setPythonEnvProviders();
		}

		const minVersionsToSet = [];
		if (!this._minimumPythonVersion) {
			minVersionsToSet.push(LanguageIds.Python);
		}
		if (!this._minimumRVersion) {
			minVersionsToSet.push(LanguageIds.R);
		}
		await this._setMinimumInterpreterVersions(minVersionsToSet);

		if (!this._condaPythonVersionInfo) {
			await this._setCondaPythonVersionInfo();
		}

		if (!this._uvPythonVersionInfo) {
			await this._setUvPythonVersionInfo();
		}
	}

	private async _updateInterpreterRelatedState(): Promise<void> {
		if (!this._runtimeStartupComplete) {
			return;
		}

		this._interpreters = await this._getFilteredInterpreters();

		if (!this._selectedRuntime || !this._interpreters?.includes(this._selectedRuntime)) {
			this._resetSelectedRuntime();
		}

		if (this._getLangId() === LanguageIds.Python) {
			this._installIpykernel = await this._getInstallIpykernel();
		}

		this._onUpdateInterpreterStateEmitter.fire();
	}

	private _resetSelectedRuntime(): void {
		if (!this._interpreters?.length) {
			return;
		}

		const langId = this._getLangId();
		if (!langId) {
			return;
		}
		const preferredRuntime = this._services.runtimeStartupService.getPreferredRuntime(langId);
		if (preferredRuntime) {
			if (this._interpreters.includes(preferredRuntime)) {
				this._selectedRuntime = preferredRuntime;
				this._preferredInterpreter = preferredRuntime;
				return;
			}
		}

		if (this._interpreters.length) {
			this._selectedRuntime = this._interpreters[0];
			return;
		}
	}

	private _getAvailableFolderTemplates(): FolderTemplate[] {
		const generalStartupBehavior = this.services.configurationService.getValue('interpreters.startupBehavior');
		const pythonStartupBehavior = this.services.configurationService.getValue('interpreters.startupBehavior', { overrideIdentifier: LanguageIds.Python });
		const rStartupBehavior = this.services.configurationService.getValue('interpreters.startupBehavior', { overrideIdentifier: LanguageIds.R });

		return Object.values(FolderTemplate).filter((template) => {
			if (template === FolderTemplate.EmptyProject) {
				return true;
			}

			if (generalStartupBehavior === LanguageStartupBehavior.Disabled) {
				return false;
			}

			if (template === FolderTemplate.PythonProject || template === FolderTemplate.JupyterNotebook) {
				return pythonStartupBehavior !== LanguageStartupBehavior.Disabled;
			}

			if (template === FolderTemplate.RProject) {
				return rStartupBehavior !== LanguageStartupBehavior.Disabled;
			}

			return true;
		});
	}

	private _getLangId(): LanguageIds | undefined {
		return this._folderTemplate === FolderTemplate.PythonProject ||
			this._folderTemplate === FolderTemplate.JupyterNotebook
			? LanguageIds.Python
			: this.folderTemplate === FolderTemplate.RProject
				? LanguageIds.R
				: undefined;
	}

	private _getEnvProviderName(): string | undefined {
		if (!this._pythonEnvProviderId || !this._pythonEnvProviders) {
			return undefined;
		}
		return this._pythonEnvProviders.find(
			(provider) => provider.id === this._pythonEnvProviderId
		)?.name;
	}

	private async _getInstallIpykernel(): Promise<boolean> {
		if (this._getLangId() !== LanguageIds.Python) {
			return false;
		}

		if (this._selectedRuntime) {
			const interpreterPath =
				this._selectedRuntime.extraRuntimeData?.pythonPath ??
				this._selectedRuntime.runtimePath;
			return !(await this.services.commandService.executeCommand(
				'python.isIpykernelBundled',
				interpreterPath
			));
		}
		return false;
	}

	private async _setPythonEnvProviders() {
		if (!this._pythonEnvProviders?.length) {
			this._pythonEnvProviders =
				(await this._services.commandService.executeCommand(
					'python.getCreateEnvironmentProviders'
				)) ?? [];
		}

		if (!this._pythonEnvProviderId) {
			this._pythonEnvProviderId = this._pythonEnvProviders[0]?.id;
		}

		this._onUpdateInterpreterStateEmitter.fire();
	}

	private async _setCondaPythonVersionInfo() {
		this._condaPythonVersionInfo = EMPTY_CONDA_PYTHON_VERSION_INFO;

		if (!this._pythonEnvProviders?.length) {
			this._services.logService.error('[New Folder Flow] No Python environment providers found.');
			return;
		}

		const providersIncludeConda = this._pythonEnvProviders.find(
			(provider) => provider.name === PythonEnvironmentProvider.Conda
		);
		if (!providersIncludeConda) {
			this._services.logService.info('[New Folder Flow] Conda is not available as an environment provider.');
			return;
		}

		this._isCondaInstalled = await this._services.commandService.executeCommand(
			'python.isCondaInstalled'
		);
		if (!this._isCondaInstalled) {
			this._services.logService.warn(
				'[New Folder Flow] Conda is available as an environment provider, but it is not installed.'
			);
			return;
		}

		const pythonVersionInfo: CondaPythonVersionInfo | undefined =
			await this._services.commandService.executeCommand('python.getCondaPythonVersions');
		if (!pythonVersionInfo) {
			this._services.logService.warn('[New Folder Flow] No Conda Python versions found.');
			return;
		}

		this._condaPythonVersionInfo = pythonVersionInfo;
		this._condaPythonVersion = this._condaPythonVersionInfo.preferred;
	}

	private async _setUvPythonVersionInfo() {
		this._uvPythonVersionInfo = EMPTY_UV_PYTHON_VERSION_INFO;

		if (!this._pythonEnvProviders?.length) {
			this._services.logService.error('[New Folder Flow] No Python environment providers found.');
			return;
		}

		const providersIncludeUv = this._pythonEnvProviders.find(
			(provider) => provider.name === PythonEnvironmentProvider.Uv
		);
		if (!providersIncludeUv) {
			this._services.logService.info('[New Folder Flow] uv is not available as an environment provider.');
			return;
		}

		this._isUvInstalled = await this._services.commandService.executeCommand(
			'python.isUvInstalled'
		);
		if (!this._isUvInstalled) {
			this._services.logService.warn(
				'[New Folder Flow] uv is available as an environment provider, but it is not installed.'
			);
			return;
		}

		const pythonVersionInfo: UvPythonVersionInfo | undefined =
			await this._services.commandService.executeCommand('python.getUvPythonVersions');
		if (!pythonVersionInfo) {
			this._services.logService.warn('[New Folder Flow] No uv Python versions found.');
			return;
		}

		this._uvPythonVersionInfo = pythonVersionInfo;
		this._uvPythonVersion = this._uvPythonVersionInfo.versions[0];
	}

	private _usesCondaEnv(): boolean {
		return (
			this._getLangId() === LanguageIds.Python &&
			this._pythonEnvSetupType === EnvironmentSetupType.NewEnvironment &&
			this._getEnvProviderName() === PythonEnvironmentProvider.Conda
		);
	}

	private _usesUvEnv(): boolean {
		return (
			this._getLangId() === LanguageIds.Python &&
			this._pythonEnvSetupType === EnvironmentSetupType.NewEnvironment &&
			this._getEnvProviderName() === PythonEnvironmentProvider.Uv
		);
	}

	private async _setMinimumInterpreterVersions(langIds?: LanguageIds[]): Promise<void> {
		const langsForMinimumVersions = langIds ?? [LanguageIds.Python, LanguageIds.R];
		if (langsForMinimumVersions.includes(LanguageIds.Python)) {
			this._minimumPythonVersion = await this._services.commandService.executeCommand(
				'python.getMinimumPythonVersion'
			);
		}
		if (langsForMinimumVersions.includes(LanguageIds.R)) {
			this._minimumRVersion = await this._services.commandService.executeCommand(
				'r.getMinimumRVersion'
			);
		}
	}

	private async _getFilteredInterpreters(): Promise<ILanguageRuntimeMetadata[] | undefined> {
		if (this._usesCondaEnv() || this._usesUvEnv()) {
			this._services.logService.trace(`[New Folder Flow] Conda or uv environments do not have registered runtimes`);
			return undefined;
		}

		if (!this._runtimeStartupComplete) {
			this._services.logService.warn('[New Folder Flow] Requested filtered interpreters before runtime startup is complete. Please come by later!');
			return undefined;
		}

		const langId = this._getLangId();
		let runtimesForLang = this._services.languageRuntimeService.registeredRuntimes
			.filter(runtime => runtime.languageId === langId);

		if (langId === LanguageIds.Python
			&& this._pythonEnvSetupType === EnvironmentSetupType.NewEnvironment
		) {
			const globalRuntimes = [];
			for (const runtime of runtimesForLang) {
				const interpreterPath = runtime.extraRuntimeData.pythonPath as string ?? runtime.runtimePath;
				const isGlobal = await this.services.commandService.executeCommand(
					'python.isGlobalPython',
					interpreterPath
				) satisfies boolean | undefined;
				if (isGlobal === undefined) {
					this._services.logService.error(
						`[New Folder Flow] Unable to determine if Python interpreter '${interpreterPath}' is global`
					);
					continue;
				}
				if (isGlobal) {
					globalRuntimes.push(runtime);
				} else {
					this._services.logService.trace(`[New Folder Flow] Skipping non-global Python interpreter '${interpreterPath}'`);
				}
			}
			if (runtimesForLang.length !== globalRuntimes.length) {
				runtimesForLang = globalRuntimes;
			}
		}

		return runtimesForLang
			.sort((left, right) =>
				left.runtimeSource.localeCompare(right.runtimeSource)
			);
	}

	private _resetFolderConfig() {
		this._initGitRepo = false;
		this._createPyprojectToml = undefined;
		this._useRenv = undefined;
		this.folderNameFeedback = undefined;
	}

	private _cleanupConfigureState() {
		const langId = this._getLangId();

		const cleanPython = () => {
			this._pythonEnvSetupType = undefined;
			this._pythonEnvProviderId = undefined;
			this._installIpykernel = undefined;
			this._minimumPythonVersion = undefined;
			this._condaPythonVersion = undefined;
			this._condaPythonVersionInfo = undefined;
			this._isCondaInstalled = undefined;
			this._uvPythonVersion = undefined;
			this._uvPythonVersionInfo = undefined;
			this._isUvInstalled = undefined;
			this._createPyprojectToml = undefined;
		};

		const cleanR = () => {
			this._useRenv = undefined;
			this._minimumRVersion = undefined;
		};

		if (!langId) {
			cleanPython();
			cleanR();
		} else if (langId === LanguageIds.Python) {
			cleanR();
			this._useRenv = undefined;
			const existingEnv = this._pythonEnvSetupType === EnvironmentSetupType.ExistingEnvironment;
			if (existingEnv) {
				this._pythonEnvProviderId = undefined;
			}
			if (this._usesCondaEnv() || this._usesUvEnv()) {
				this._selectedRuntime = undefined;
			} else {
				this._condaPythonVersion = undefined;
				this._uvPythonVersion = undefined;
			}
		} else if (langId === LanguageIds.R) {
			cleanPython();
		} else {
			this._services.logService.error(`[New Folder Flow] Unrecognized language ID: ${langId}`);
		}
	}
}
