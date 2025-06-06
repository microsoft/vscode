/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IMarkerService, IMarker, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IDecorationsService, IDecorationsProvider, IDecorationData } from '../../../services/decorations/common/decorations.js';
import { IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { listErrorForeground, listWarningForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

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
		this._disposables = [
			this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('problems.visibility')) {
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
		const problem = this._configurationService.getValue('problems.visibility');
		if (problem === undefined) {
			return;
		}
		const value = this._configurationService.getValue<{ decorations: { enabled: boolean } }>('problems');
		const shouldEnable = (problem && value.decorations.enabled);

		if (shouldEnable === this._enabled) {
			if (!problem || !value.decorations.enabled) {
				this._provider?.dispose();
				this._provider = undefined;
			}
			return;
		}

		this._enabled = shouldEnable as boolean;
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
	'type': 'object',
	'properties': {
		'problems.decorations.enabled': {
			'markdownDescription': localize('markers.showOnFile', "Show Errors & Warnings on files and folder. Overwritten by {0} when it is off.", '`#problems.visibility#`'),
			'type': 'boolean',
			'default': true
		}
	}
});

// register file decorations
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MarkersFileDecorations, LifecyclePhase.Restored);
