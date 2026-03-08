/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ViewPane, IViewPaneOptions } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { ISpecPipelineService, ISpecFeature, SpecPhase, SpecPhaseStatus } from '../common/specPipeline.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

const $ = dom.$;

export const SPEC_PIPELINE_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.specPipelineContainer';
export const SPEC_PIPELINE_VIEW_ID = 'workbench.view.agentSessions.specPipeline';

/**
 * View pane container for the spec pipeline panel.
 */
export class SpecPipelineViewPaneContainer extends ViewPaneContainer {
}

/**
 * View pane that displays the spec pipeline for all features.
 * Shows the three-phase pipeline state and provides approval controls.
 */
export class SpecPipelineViewPane extends ViewPane {
	private container: HTMLElement | undefined;
	private featureListElement: HTMLElement | undefined;
	private readonly viewDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@ISpecPipelineService private readonly specPipelineService: ISpecPipelineService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = dom.append(container, $('.spec-pipeline-view'));

		// Header with "Generate from description" button
		const header = dom.append(this.container, $('.spec-pipeline-header'));
		const generateButton = dom.append(header, $('button.spec-pipeline-generate-button'));
		generateButton.textContent = localize('specPipeline.generate', "Generate from Description");
		generateButton.title = localize('specPipeline.generateTooltip', "Start a new spec pipeline from a natural language description");

		this.viewDisposables.add(dom.addDisposableListener(generateButton, dom.EventType.CLICK, () => {
			this.handleGenerateClick();
		}));

		// Feature list
		this.featureListElement = dom.append(this.container, $('.spec-pipeline-feature-list'));

		// Load initial data
		this.refresh();

		// Listen for state changes
		this.viewDisposables.add(this.specPipelineService.onDidChangeState(() => {
			this.refresh();
		}));
	}

	/**
	 * Refresh the feature list from the spec pipeline service.
	 */
	private async refresh(): Promise<void> {
		if (!this.featureListElement) {
			return;
		}

		const features = await this.specPipelineService.listFeatures();

		dom.clearNode(this.featureListElement);

		if (features.length === 0) {
			const emptyMessage = dom.append(this.featureListElement, $('.spec-pipeline-empty'));
			emptyMessage.textContent = localize('specPipeline.noSpecs', "No specs yet. Click 'Generate from Description' to start.");
			return;
		}

		for (const feature of features) {
			this.renderFeatureEntry(feature);
		}
	}

	/**
	 * Render a single feature entry with its pipeline phases.
	 */
	private renderFeatureEntry(feature: ISpecFeature): void {
		if (!this.featureListElement) {
			return;
		}

		const entry = dom.append(this.featureListElement, $('.spec-pipeline-feature'));

		// Feature name
		const nameElement = dom.append(entry, $('.spec-pipeline-feature-name'));
		nameElement.textContent = feature.name;

		// Pipeline phases
		const phasesElement = dom.append(entry, $('.spec-pipeline-phases'));

		this.renderPhase(phasesElement, feature, 'requirements', feature.state.requirements.status);
		this.renderPhaseArrow(phasesElement);
		this.renderPhase(phasesElement, feature, 'design', feature.state.design.status);
		this.renderPhaseArrow(phasesElement);
		this.renderPhase(phasesElement, feature, 'tasks', feature.state.tasks.status);
		this.renderPhaseArrow(phasesElement);
		this.renderPhase(phasesElement, feature, 'properties', feature.state.properties.status);
	}

	/**
	 * Render a single pipeline phase indicator.
	 */
	private renderPhase(
		container: HTMLElement,
		feature: ISpecFeature,
		phase: SpecPhase,
		status: SpecPhaseStatus,
	): void {
		const phaseElement = dom.append(container, $(`.spec-pipeline-phase.spec-phase-${status}`));

		const icon = this.getPhaseIcon(status);
		const iconElement = dom.append(phaseElement, $('.spec-pipeline-phase-icon'));
		iconElement.textContent = icon;

		const label = dom.append(phaseElement, $('.spec-pipeline-phase-label'));
		label.textContent = this.getPhaseLabel(phase);

		// Click to open the spec file
		this.viewDisposables.add(dom.addDisposableListener(phaseElement, dom.EventType.CLICK, () => {
			this.specPipelineService.openSpecFile(feature.name, phase);
		}));

		// Approval button for draft phases
		if (status === 'draft') {
			const approveButton = dom.append(phaseElement, $('button.spec-pipeline-approve-button'));
			approveButton.textContent = localize('specPipeline.approve', "Approve");
			approveButton.title = localize('specPipeline.approveTooltip', "Approve this phase and advance to the next");

			this.viewDisposables.add(dom.addDisposableListener(approveButton, dom.EventType.CLICK, (e) => {
				dom.EventHelper.stop(e);
				this.specPipelineService.approvePhase(feature.name, phase);
			}));
		}
	}

	/**
	 * Render an arrow between phases.
	 */
	private renderPhaseArrow(container: HTMLElement): void {
		const arrow = dom.append(container, $('.spec-pipeline-phase-arrow'));
		arrow.textContent = '\u2192';
	}

	/**
	 * Get the icon for a phase status.
	 */
	private getPhaseIcon(status: SpecPhaseStatus): string {
		switch (status) {
			case 'approved': return '\u2705';
			case 'draft': return '\u23F3';
			case 'out_of_sync': return '\u26A0\uFE0F';
			case 'missing': return '\u2B1C';
		}
	}

	/**
	 * Get the display label for a phase.
	 */
	private getPhaseLabel(phase: SpecPhase): string {
		switch (phase) {
			case 'requirements': return localize('specPipeline.requirements', "Requirements");
			case 'design': return localize('specPipeline.design', "Design");
			case 'tasks': return localize('specPipeline.tasks', "Tasks");
			case 'properties': return localize('specPipeline.properties', "Properties");
		}
	}

	/**
	 * Handle the "Generate from description" button click.
	 */
	private handleGenerateClick(): void {
		// In a full implementation, this would show an input dialog
		// and invoke specPipelineService.startPipeline()
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
