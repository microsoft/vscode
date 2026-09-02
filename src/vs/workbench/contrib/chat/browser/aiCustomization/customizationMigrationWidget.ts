/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { CUSTOMIZATION_MIGRATION_CATEGORIES, CustomizationMigrationCategoryId } from './customizationMigrationCategories.js';
import { IMigratedCustomization } from './customizationMigration.js';
import { CustomizationMigrationRunCoordinator, FileCustomizationMigrationFlow, IFileCustomizationMigrationFlowDelegate } from './fileCustomizationMigrationFlow.js';
import { ICustomizationMigrationCategorySummary } from './aiCustomizationWelcomePage.js';

const $ = DOM.$;

export interface ICustomizationMigrationFlow {
	readonly id: CustomizationMigrationCategoryId;
	readonly backLabel: string;
	readonly summary: IObservable<ICustomizationMigrationCategorySummary | undefined>;

	activate(container: HTMLElement): void;
	deactivate(): void;
	refresh(): Promise<void>;
	refreshFromPromptChange(): void;
	focus(): void;
	layout(): void;
	isEnabled(): boolean;
}

export interface ICustomizationMigrationNavigationDelegate {
	openFileCustomization(customization: MigratableConfiguration): Promise<void>;
	revealMigratedFiles(customizations: readonly IMigratedCustomization[]): Promise<void>;
}

export class CustomizationMigrationWidget extends Disposable {

	readonly element: HTMLElement;
	readonly summaries: IObservable<readonly ICustomizationMigrationCategorySummary[]>;

	private readonly flows: readonly ICustomizationMigrationFlow[];
	private activeFlow: ICustomizationMigrationFlow | undefined;

	constructor(
		navigationDelegate: ICustomizationMigrationNavigationDelegate,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@IPromptsService promptsService: IPromptsService,
	) {
		super();

		this.element = $('.prompt-migration-content-container.ai-customization-list-widget');
		const flowDelegate: IFileCustomizationMigrationFlowDelegate = navigationDelegate;
		const runCoordinator = this._register(new CustomizationMigrationRunCoordinator());
		this.flows = CUSTOMIZATION_MIGRATION_CATEGORIES.map(category => this._register(
			instantiationService.createInstance(FileCustomizationMigrationFlow, category, flowDelegate, runCoordinator)
		));
		this.summaries = derived(this, reader => this.flows
			.map(flow => flow.summary.read(reader))
			.filter((summary): summary is ICustomizationMigrationCategorySummary => summary !== undefined));

		this._register(autorun(reader => {
			harnessService.activeSessionResource.read(reader);
			void this.refresh();
		}));

		this._register(Event.any(
			promptsService.onDidChangeSlashCommands,
			promptsService.onDidChangeCustomAgents,
			promptsService.onDidChangeInstructions,
			promptsService.onDidChangeAgentInstructions,
		)(() => {
			for (const flow of this.flows) {
				flow.refreshFromPromptChange();
			}
		}));

		this._register(configurationService.onDidChangeConfiguration(event => {
			if (CUSTOMIZATION_MIGRATION_CATEGORIES.some(category => event.affectsConfiguration(category.enablementSetting))) {
				void this.refresh();
			}
		}));
	}

	get activeBackLabel(): string | undefined {
		return this.activeFlow?.backLabel;
	}

	showCategory(categoryId: CustomizationMigrationCategoryId): boolean {
		const flow = this.flows.find(candidate => candidate.id === categoryId);
		if (!flow?.isEnabled()) {
			return false;
		}

		if (this.activeFlow !== flow) {
			this.activeFlow?.deactivate();
			this.activeFlow = flow;
			flow.activate(this.element);
		} else {
			flow.activate(this.element);
		}
		return true;
	}

	async refresh(): Promise<void> {
		await Promise.all(this.flows.map(flow => flow.refresh()));
	}

	setVisible(visible: boolean): void {
		this.element.style.display = visible ? '' : 'none';
	}

	focus(): void {
		this.activeFlow?.focus();
	}

	layout(): void {
		this.activeFlow?.layout();
	}
}
