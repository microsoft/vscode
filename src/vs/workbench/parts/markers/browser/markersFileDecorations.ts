/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { IMarkerService, IMarker } from 'vs/platform/markers/common/markers';
import { IResourceDecorationsService, IDecorationsProvider, IResourceDecoration } from 'vs/workbench/services/decorations/browser/decorations';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { Registry } from 'vs/platform/registry/common/platform';
import Severity from 'vs/base/common/severity';
import { editorErrorForeground, editorWarningForeground } from 'vs/editor/common/view/editorColorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

class MarkersDecorationsProvider implements IDecorationsProvider {

	readonly label: string = localize('label', "Problems");
	readonly onDidChange: Event<URI[]>;

	constructor(
		private readonly _markerService: IMarkerService
	) {
		this.onDidChange = _markerService.onMarkerChanged;
	}

	provideDecorations(resource: URI): IResourceDecoration {

		const markers = this._markerService.read({ resource })
			.sort((a, b) => Severity.compare(a.severity, b.severity));

		return !isFalsyOrEmpty(markers)
			? MarkersDecorationsProvider._toFileDecorationData(markers[0])
			: undefined;
	}

	private static _toFileDecorationData(marker: IMarker): IResourceDecoration {
		const { severity } = marker;
		const color = severity === Severity.Error ? editorErrorForeground : editorWarningForeground;
		return { severity, color };
	}
}

class MarkersFileDecorations implements IWorkbenchContribution {

	private readonly _disposables: IDisposable[];
	private _provider: IDisposable;

	constructor(
		@IMarkerService private _markerService: IMarkerService,
		@IResourceDecorationsService private _decorationsService: IResourceDecorationsService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		//
		this._disposables = [
			this._configurationService.onDidUpdateConfiguration(this._updateEnablement, this),
		];

		this._updateEnablement();
	}

	dispose(): void {
		dispose(this._provider);
		dispose(this._disposables);
	}

	getId(): string {
		return 'markers.MarkersFileDecorations';
	}

	private _updateEnablement(): void {
		let value = this._configurationService.getConfiguration<{ showOnFiles: boolean }>('problems');
		if (value) {
			const provider = new MarkersDecorationsProvider(this._markerService);
			this._provider = this._decorationsService.registerDecortionsProvider(provider);
		} else if (this._provider) {
			this._provider.dispose();
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(MarkersFileDecorations);
