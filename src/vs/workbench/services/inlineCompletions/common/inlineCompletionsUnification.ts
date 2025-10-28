/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchAssignmentService } from '../../assignment/common/assignmentService.js';

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

const ExtensionUnificationSetting = 'copilot.extensionUnification.enabled';

export class InlineCompletionsUnificationImpl extends Disposable implements IInlineCompletionsUnificationService {
	readonly _serviceBrand: undefined;

	private _state = new InlineCompletionsUnificationState(false, false, false, []);
	public get state(): IInlineCompletionsUnificationState { return this._state; }

	private isRunningUnificationExperiment;

	private readonly _onDidStateChange = this._register(new Emitter<void>());
	public readonly onDidStateChange = this._onDidStateChange.event;

	private readonly _onDidChangeExtensionUnification = this._register(new Emitter<void>());

	constructor(
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this.isRunningUnificationExperiment = isRunningUnificationExperiment.bindTo(this._contextKeyService);

		this._assignmentService.addTelemetryAssignmentFilter({
			exclude: (assignment) => !this._state.extensionUnification && assignment.startsWith(EXTENSION_UNIFICATION_PREFIX),
			onDidChange: this._onDidChangeExtensionUnification.event
		});

		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ExtensionUnificationSetting)) {
				this._update();
			}
		});
		this._register(this._assignmentService.onDidRefetchAssignments(() => this._update()));
		this._update();
	}

	private async _update(): Promise<void> {
		// TODO@benibenj@sandy081 extensionUnificationEnabled should depend on extension enablement state
		const extensionUnificationEnabled = this._configurationService.getValue<boolean>(ExtensionUnificationSetting);
		const [codeUnificationFF, modelUnificationFF] = await Promise.all([
			this._assignmentService.getTreatment<boolean>(CODE_UNIFICATION_FF),
			this._assignmentService.getTreatment<boolean>(MODEL_UNIFICATION_FF),
		]);

		// Intentionally read the current experiments after fetching the treatments
		const currentExperiments = await this._assignmentService.getCurrentExperiments();
		const newState = new InlineCompletionsUnificationState(
			codeUnificationFF === true,
			modelUnificationFF === true,
			extensionUnificationEnabled,
			currentExperiments?.filter(exp => exp.startsWith(CODE_UNIFICATION_PREFIX) || (extensionUnificationEnabled && exp.startsWith(EXTENSION_UNIFICATION_PREFIX))) ?? []
		);
		if (this._state.equals(newState)) {
			return;
		}

		const previousState = this._state;
		this._state = newState;
		this.isRunningUnificationExperiment.set(this._state.codeUnification || this._state.modelUnification || this._state.extensionUnification);
		this._onDidStateChange.fire();

		if (previousState.extensionUnification !== this._state.extensionUnification) {
			this._onDidChangeExtensionUnification.fire();
		}
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
