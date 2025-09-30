/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { NotebookAutoAcceptDiffZoneWidget } from '../../../contrib/notebook/browser/contrib/diff/notebookDiffHighlight.js';

export const INotebookZoneManager = createDecorator<INotebookZoneManager>('notebookZoneManager');

export interface INotebookZoneInfo {
	cellIndex: number;
	lineNumber: number;
	zoneWidget: NotebookAutoAcceptDiffZoneWidget;
	sectionId: string;
	deletedLines: string[];
	shouldBeVisible: boolean;
	isCurrentlyVisible: boolean;
}

export interface INotebookZoneManager {
	readonly _serviceBrand: undefined;
	
	/**
	 * Register a notebook editor for zone management
	 */
	registerNotebookEditor(uri: URI, notebookEditor: any): void;
	
	/**
	 * Remove a notebook editor when it's disposed
	 */
	removeNotebookEditor(editor: any): void;
	
	/**
	 * Update the zone map for a notebook. Called by FileChangeTracker.notebookApplyAutoAcceptDeletedZones
	 */
	updateZoneMap(uri: URI, zoneMap: Map<string, NotebookAutoAcceptDiffZoneWidget>): void;
	
	/**
	 * Clear all zones for a notebook
	 */
	clearZones(uri: URI): void;
}
