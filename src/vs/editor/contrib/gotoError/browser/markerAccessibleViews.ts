/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleViewType, AccessibleViewProviderId, AccessibleContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarker, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { basename } from '../../../../base/common/resources.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { MarkerController } from './gotoError.js';

export class MarkerAccessibleView implements IAccessibleViewImplementation {

	public readonly type = AccessibleViewType.View;
	public readonly priority = 95;
	public readonly name = 'marker';
	public readonly when = ContextKeyExpr.equals('markersNavigationVisible', true);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}
		const markerController = codeEditor.getContribution<MarkerController>(MarkerController.ID);
		if (!markerController) {
			return;
		}
		const selected = markerController.getSelectedMarker();
		if (!selected) {
			return;
		}
		return new MarkerAccessibleViewProvider(codeEditor, markerController);
	}
}

export class MarkerAccessibilityHelp implements IAccessibleViewImplementation {

	public readonly priority = 100;
	public readonly name = 'marker';
	public readonly type = AccessibleViewType.Help;
	public readonly when = ContextKeyExpr.equals('markersNavigationVisible', true);

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}
		const markerController = codeEditor.getContribution<MarkerController>(MarkerController.ID);
		if (!markerController) {
			return;
		}
		const selected = markerController.getSelectedMarker();
		if (!selected) {
			return;
		}
		return new MarkerAccessibilityHelpProvider(codeEditor, markerController);
	}
}

abstract class BaseMarkerAccessibleViewProvider extends Disposable implements IAccessibleViewContentProvider {

	public readonly id = AccessibleViewProviderId.Marker;
	public readonly verbositySettingKey = AccessibilityVerbositySettingId.Marker;
	public readonly options: IAccessibleViewOptions = { type: AccessibleViewType.View };

	constructor(
		protected readonly _editor: ICodeEditor,
		protected readonly _markerController: MarkerController
	) {
		super();
	}

	abstract provideContent(): string;

	public onClose(): void {
		this._markerController.focus();
	}

	protected _getMarkerContent(marker: IMarker): string {
		const lines: string[] = [];

		// Add severity
		let severityLabel = '';
		switch (marker.severity) {
			case MarkerSeverity.Error:
				severityLabel = localize('Error', "Error");
				break;
			case MarkerSeverity.Warning:
				severityLabel = localize('Warning', "Warning");
				break;
			case MarkerSeverity.Info:
				severityLabel = localize('Info', "Info");
				break;
			case MarkerSeverity.Hint:
				severityLabel = localize('Hint', "Hint");
				break;
		}

		lines.push(`${severityLabel}: ${marker.message}`);

		// Add source and code if available
		if (marker.source || marker.code) {
			const details: string[] = [];
			if (marker.source) {
				details.push(marker.source);
			}
			if (marker.code) {
				if (typeof marker.code === 'string') {
					details.push(`(${marker.code})`);
				} else {
					details.push(`(${marker.code.value})`);
				}
			}
			lines.push(details.join(' '));
		}

		// Add location
		lines.push(localize('location', "Location: {0} [{1}, {2}]",
			basename(marker.resource),
			marker.startLineNumber,
			marker.startColumn
		));

		// Add related information if available
		if (marker.relatedInformation && marker.relatedInformation.length > 0) {
			lines.push('');
			lines.push(localize('relatedInformation', "Related Information:"));
			for (const related of marker.relatedInformation) {
				lines.push(`  ${basename(related.resource)} [${related.startLineNumber}, ${related.startColumn}]: ${related.message}`);
			}
		}

		return lines.join('\n');
	}
}

export class MarkerAccessibilityHelpProvider extends BaseMarkerAccessibleViewProvider {

	public override readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	override provideContent(): string {
		return [
			localize('markerAccessibilityHelp', "The marker navigation widget shows problems in your code."),
			localize('showNextMarker', "- Use F8 to go to the next problem."),
			localize('showPreviousMarker', "- Use Shift+F8 to go to the previous problem."),
			localize('closeMarkerWidget', "- Use Escape to close the widget."),
		].join('\n');
	}
}

export class MarkerAccessibleViewProvider extends BaseMarkerAccessibleViewProvider {

	public override readonly options: IAccessibleViewOptions = { type: AccessibleViewType.View };

	override provideContent(): string {
		const selected = this._markerController.getSelectedMarker();
		if (!selected) {
			return localize('noMarker', "No problem selected");
		}
		const marker = selected.marker;
		const markerIndex = selected.index;
		const markerTotal = selected.total;

		const content: string[] = [];
		if (markerTotal > 1) {
			content.push(localize('markerPosition', "Problem {0} of {1}", markerIndex, markerTotal));
			content.push('');
		}
		content.push(this._getMarkerContent(marker));

		return content.join('\n');
	}
}

// Register accessible views for marker navigation widget
AccessibleViewRegistry.register(new MarkerAccessibleView());
AccessibleViewRegistry.register(new MarkerAccessibilityHelp());
