/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IMarkerService, IMarker, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IDecorationsService, IDecorationsProvider, IDecorationData } from 'vs/workbench/services/decorations/common/decorations';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { listErrorForeground, listWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class MarkersDecorationsProvider implements IDecorationsProvider {

	readonly label: string = localize('label', "Problems");
	readonly onDidChange: Event<readonly URI[]>;

	constructor(
		private readonly _markerService: IMarkerService
	) {
		this.onDidChange = _markerService.onMarkerChanged;
	}

	provideDecorations(resource: URI): IDecorationData | undefined {
		const markers = this._markerService.read({
			resource,
			severities: MarkerSeverity.Error | MarkerSeverity.Warning
		});
		let first: IMarker | undefined;
		for (const marker of markers) {
			if (!first || marker.severity > first.severity) {
				first = marker;
			}
		}

		if (!first) {
			return undefined;
		}

		return {
			weight: 100 * first.severity,
			bubble: true,
			tooltip: markers.length === 1 ? localize('tooltip.1', "1 problem in this file") : localize('tooltip.N', "{0} problems in this file", markers.length),
			letter: markers.length < 10 ? markers.length.toString() : '9+',
			color: first.severity === MarkerSeverity.Error ? listErrorForeground : listWarningForeground,
		};
	}
}

class MarkersFileDecorations implements IWorkbenchContribution {

	private readonly _disposables: IDisposable[];
	private _provider?: IDisposable;
	private _enabled?: boolean;

	constructor(
		@IMarkerService private readonly _markerService: IMarkerService,
		@IDecorationsService private readonly _decorationsService: IDecorationsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		//
		this._disposables = [
			this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('problems') || e.affectsConfiguration('workbench.editor.showProblems')) {
					this._updateEnablement();
				}
			}),
		];
		this._updateEnablement();
	}

	dispose(): void {
		dispose(this._provider);
		dispose(this._disposables);
	}

	private _updateEnablement(): void {
		const problem = this._configurationService.getValue('workbench.editor.showProblems');
		if (problem === undefined) {
			return;
		}
		const value = this._configurationService.getValue<{ decorations: { enabled: string } }>('problems');
		const autoProblems = problem && value.decorations.enabled !== 'off';
		const shouldEnable = (autoProblems || value.decorations.enabled === 'on');

		if (shouldEnable === this._enabled) {
			if (!autoProblems && value.decorations.enabled === 'off') {
				this._provider?.dispose();
				this._provider = undefined;
			}
			return;
		}
		this._enabled = shouldEnable;
		if (this._enabled) {
			const provider = new MarkersDecorationsProvider(this._markerService);
			this._provider = this._decorationsService.registerDecorationsProvider(provider);
		} else if (this._provider) {
			this._provider.dispose();
		}
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	'id': 'problems',
	'order': 101,
	'properties': {
		'problems.decorations.enabled': {
			'description': localize('markers.showOnFile', "Show Errors & Warnings in VS Code files and folders."),
			'type': 'string',
			'enum': ['auto', 'on', 'off'],
			'markdownEnumDescriptions': [
				localize('markers.showOnFile.auto.description', "Show Errors & Warnings in the editor depending on the {0} setting.", '`editor.showProblems`'),
				localize('markers.showOnFile.on.description', "Always show Errors & Warnings in the editor."),
				localize('markers.showOnFile.off.description', "Never show Errors & Warnings in the editor."),
			],
			'default': 'auto',
		}
	}
});

// register file decorations
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MarkersFileDecorations, LifecyclePhase.Restored);
