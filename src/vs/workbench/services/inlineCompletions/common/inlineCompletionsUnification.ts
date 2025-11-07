/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchAssignmentService } from '../../assignment/common/assignmentService.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../extensions/common/extensions.js';

export const IInlineCompletionsUnificationService = createDecorator<IInlineCompletionsUnificationService>('inlineCompletionsUnificationService');

export interface IInlineCompletionsUnificationState {
	codeUnification: boolean;
	modelUnification: boolean;
	extensionUnification: boolean;
	expAssignments: string[];
}

export interface IInlineCompletionsUnificationService {
	readonly _serviceBrand: undefined;

	readonly state: IInlineCompletionsUnificationState;
	readonly onDidStateChange: Event<void>;
}

const CODE_UNIFICATION_PREFIX = 'cmp-cht-';
const EXTENSION_UNIFICATION_PREFIX = 'cmp-ext-';
const CODE_UNIFICATION_FF = 'inlineCompletionsUnificationCode';
const MODEL_UNIFICATION_FF = 'inlineCompletionsUnificationModel';

export const isRunningUnificationExperiment = new RawContextKey<boolean>('isRunningUnificationExperiment', false);

const ExtensionUnificationSetting = 'chat.extensionUnification.enabled';

export class InlineCompletionsUnificationImpl extends Disposable implements IInlineCompletionsUnificationService {
	readonly _serviceBrand: undefined;

	private _state = new InlineCompletionsUnificationState(false, false, false, []);
	public get state(): IInlineCompletionsUnificationState { return this._state; }

	private isRunningUnificationExperiment;

	private readonly _onDidStateChange = this._register(new Emitter<void>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	private readonly _onDidChangeExtensionUnificationState = this._register(new Emitter<void>());
	private readonly _onDidChangeExtensionUnificationSetting = this._register(new Emitter<void>());

	private readonly _completionsExtensionId: string | undefined;
	private readonly _chatExtensionId: string | undefined;

	constructor(
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IProductService productService: IProductService
	) {
		super();
		this._completionsExtensionId = productService.defaultChatAgent?.extensionId.toLowerCase();
		this._chatExtensionId = productService.defaultChatAgent?.chatExtensionId.toLowerCase();
		const relevantExtensions = [this._completionsExtensionId, this._chatExtensionId].filter((id): id is string => !!id);

		this.isRunningUnificationExperiment = isRunningUnificationExperiment.bindTo(this._contextKeyService);

		this._assignmentService.addTelemetryAssignmentFilter({
			exclude: (assignment) => assignment.startsWith(EXTENSION_UNIFICATION_PREFIX) && this._state.extensionUnification !== this._configurationService.getValue<boolean>(ExtensionUnificationSetting),
			onDidChange: Event.any(this._onDidChangeExtensionUnificationState.event, this._onDidChangeExtensionUnificationSetting.event)
		});

		this._register(this._extensionEnablementService.onEnablementChanged((extensions) => {
			if (extensions.some(ext => relevantExtensions.includes(ext.identifier.id.toLowerCase()))) {
				this._update();
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ExtensionUnificationSetting)) {
				this._update();
				this._onDidChangeExtensionUnificationSetting.fire();
			}
		}));
		this._register(this._extensionService.onDidChangeExtensions(({ added }) => {
			if (added.some(ext => relevantExtensions.includes(ext.identifier.value.toLowerCase()))) {
				this._update();
			}
		}));
		this._register(this._assignmentService.onDidRefetchAssignments(() => this._update()));
		this._update();
	}

	private async _update(): Promise<void> {
		const [codeUnificationFF, modelUnificationFF, extensionUnificationEnabled] = await Promise.all([
			this._assignmentService.getTreatment<boolean>(CODE_UNIFICATION_FF),
			this._assignmentService.getTreatment<boolean>(MODEL_UNIFICATION_FF),
			this._isExtensionUnificationActive()
		]);

		const extensionStatesMatchUnificationSetting = this._configurationService.getValue<boolean>(ExtensionUnificationSetting) === extensionUnificationEnabled;

		// Intentionally read the current experiments after fetching the treatments
		const currentExperiments = await this._assignmentService.getCurrentExperiments();
		const newState = new InlineCompletionsUnificationState(
			codeUnificationFF === true,
			modelUnificationFF === true,
			extensionUnificationEnabled,
			currentExperiments?.filter(exp => exp.startsWith(CODE_UNIFICATION_PREFIX) || (extensionStatesMatchUnificationSetting && exp.startsWith(EXTENSION_UNIFICATION_PREFIX))) ?? []
		);
		if (this._state.equals(newState)) {
			return;
		}

		const previousState = this._state;
		this._state = newState;
		this.isRunningUnificationExperiment.set(this._state.codeUnification || this._state.modelUnification || this._state.extensionUnification);
		this._onDidStateChange.fire();

		if (previousState.extensionUnification !== this._state.extensionUnification) {
			this._onDidChangeExtensionUnificationState.fire();
		}
	}

	private async _isExtensionUnificationActive(): Promise<boolean> {
		if (!this._configurationService.getValue<boolean>(ExtensionUnificationSetting)) {
			return false;
		}

		if (!this._completionsExtensionId || !this._chatExtensionId) {
			return false;
		}

		const [completionsExtension, chatExtension, installedExtensions] = await Promise.all([
			this._extensionService.getExtension(this._completionsExtensionId),
			this._extensionService.getExtension(this._chatExtensionId),
			this._extensionManagementService.getInstalled(ExtensionType.User)
		]);

		if (!chatExtension || completionsExtension) {
			return false;
		}

		// Extension might be installed on remote and local
		const completionExtensionInstalled = installedExtensions.filter(ext => ext.identifier.id.toLowerCase() === this._completionsExtensionId);
		if (completionExtensionInstalled.length === 0) {
			return false;
		}

		const completionsExtensionDisabledByUnification = completionExtensionInstalled.some(ext => this._extensionEnablementService.getEnablementState(ext) === EnablementState.DisabledByUnification);

		return !!chatExtension && completionsExtensionDisabledByUnification;
	}
}

class InlineCompletionsUnificationState implements IInlineCompletionsUnificationState {
	constructor(
		public readonly codeUnification: boolean,
		public readonly modelUnification: boolean,
		public readonly extensionUnification: boolean,
		public readonly expAssignments: string[]
	) {
	}

	equals(other: IInlineCompletionsUnificationState): boolean {
		return this.codeUnification === other.codeUnification
			&& this.modelUnification === other.modelUnification
			&& this.extensionUnification === other.extensionUnification
			&& equals(this.expAssignments, other.expAssignments);
	}
}

registerSingleton(IInlineCompletionsUnificationService, InlineCompletionsUnificationImpl, InstantiationType.Delayed);
