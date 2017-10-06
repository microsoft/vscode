/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { IMarkerService, IMarker } from 'vs/platform/markers/common/markers';
import { IFileDecorationsService, DecorationType, IFileDecorationData } from 'vs/workbench/services/fileDecorations/browser/fileDecorations';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { Registry } from 'vs/platform/registry/common/platform';
import Severity from 'vs/base/common/severity';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorErrorForeground, editorWarningForeground } from 'vs/editor/common/view/editorColorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

class MarkersFileDecorations implements IWorkbenchContribution {

	private readonly _disposables: IDisposable[];
	private readonly _type: DecorationType;
	private _markerListener: IDisposable;

	constructor(
		@IMarkerService private _markerService: IMarkerService,
		@IFileDecorationsService private _decorationsService: IFileDecorationsService,
		@IThemeService private _themeService: IThemeService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		//
		this._disposables = [
			this._configurationService.onDidUpdateConfiguration(this._updateEnablement, this),
			this._type = this._decorationsService.registerDecorationType(localize('errorAndWarnings', "Errors & Warnings"))
		];

		this._updateEnablement();
	}

	dispose(): void {
		dispose(this._markerListener);
		dispose(this._disposables);
	}

	getId(): string {
		return 'markers.MarkersFileDecorations';
	}

	private _updateEnablement(): void {
		let value = this._configurationService.getConfiguration<{ showOnFiles: boolean }>('problems');
		if (value) {
			this._markerListener = this._markerService.onMarkerChanged(this._onDidChangeMarker, this);
			this._onDidChangeMarker(this._markerService.read().map(marker => marker.resource));
		} else if (this._markerListener) {
			this._markerListener.dispose();
		}
	}

	private _onDidChangeMarker(resources: URI[]): void {
		for (const resource of resources) {
			const markers = this._markerService.read({ resource })
				.sort((a, b) => Severity.compare(a.severity, b.severity));

			if (!isFalsyOrEmpty(markers)) {
				const data = this._toFileDecorationData(markers[0]);
				this._decorationsService.setFileDecoration(this._type, resource, data);
			} else {
				this._decorationsService.unsetFileDecoration(this._type, resource);
			}
		}
	}

	private _toFileDecorationData(marker: IMarker): IFileDecorationData {
		const { message, severity } = marker;
		const color = this._themeService.getTheme().getColor(severity === Severity.Error ? editorErrorForeground : editorWarningForeground);
		return { message, severity, color };
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(MarkersFileDecorations);
