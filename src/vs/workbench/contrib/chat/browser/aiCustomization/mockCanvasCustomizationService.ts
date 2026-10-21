/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// PROTOTYPE: In-memory canvas data for iterating on the Canvases page UI.
// replace this service registration with an Agent Host-backed implementation
// of ICanvasCustomizationService before shipping.

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { CanvasCustomizationSourceGroup, CanvasCustomizationStatus, ICanvasCustomizationRow, ICanvasCustomizationService } from '../../common/canvasCustomizations.js';

export interface IMockCanvasDeclaration {
	readonly id: string;
	readonly displayName: string;
	readonly description: string;
}

export interface IMockCanvasExtension {
	readonly id: string;
	readonly name: string;
	readonly source: CanvasCustomizationSourceGroup;
	readonly pluginName?: string;
	readonly status: CanvasCustomizationStatus;
	readonly canvases: readonly IMockCanvasDeclaration[];
}

export const MOCK_CANVAS_EXTENSIONS: readonly IMockCanvasExtension[] = [
	{
		id: 'project:pr-tools', name: 'pr-tools', source: CanvasCustomizationSourceGroup.Workspace, status: CanvasCustomizationStatus.Running, canvases: [
			{ id: 'pr-board', displayName: 'PR Review Board', description: 'Review open pull requests side by side with their checks.' },
			{ id: 'release-notes', displayName: 'Release Notes Draft', description: 'Draft release notes from pull requests merged since the last tag.' },
			{ id: 'flaky-tests', displayName: 'Flaky Test Radar', description: 'Track tests that failed intermittently across recent CI runs.' },
		]
	},
	{
		id: 'project:design-tokens', name: 'design-tokens', source: CanvasCustomizationSourceGroup.Workspace, status: CanvasCustomizationStatus.Running, canvases: [
			{ id: 'token-inspector', displayName: 'Design Token Inspector and Theme Contrast Checker for High Contrast Themes', description: 'Inspect design tokens used by the files in this chat and check their contrast ratios against every installed theme, including high contrast variants.' },
		]
	},
	{
		id: 'user:token-tracker', name: 'token-tracker', source: CanvasCustomizationSourceGroup.User, status: CanvasCustomizationStatus.Running, canvases: [
			{ id: 'token-usage', displayName: 'Token Usage', description: 'Track model token usage across the turns in this chat.' },
		]
	},
	{
		id: 'user:scratchpad', name: 'scratchpad', source: CanvasCustomizationSourceGroup.User, status: CanvasCustomizationStatus.Running, canvases: [
			{ id: 'scratchpad', displayName: 'Scratchpad', description: 'A shared notes surface that you and Copilot can both edit.' },
			{ id: 'diagram', displayName: 'Diagram Sketch', description: 'Sketch architecture diagrams that Copilot can read and update.' },
		]
	},
	{ id: 'user:old-notes', name: 'old-notes', source: CanvasCustomizationSourceGroup.User, status: CanvasCustomizationStatus.Disabled, canvases: [{ id: 'notes', displayName: 'Notes', description: 'Legacy notes canvas.' }] },
	{ id: 'user:lsp-explorer', name: 'lsp-explorer', source: CanvasCustomizationSourceGroup.User, status: CanvasCustomizationStatus.Running, canvases: [{ id: 'symbols', displayName: 'Symbol Explorer', description: 'Browse language server symbols referenced in this chat.' }] },
	{
		id: 'plugin:github-artifacts:artifact-explorer', name: 'artifact-explorer', source: CanvasCustomizationSourceGroup.Plugin, pluginName: 'github-artifacts', status: CanvasCustomizationStatus.Running, canvases: [
			{ id: 'pr-artifact-explorer', displayName: 'Artifact Explorer', description: 'Browse GitHub pull requests and preview workflow artifacts, including static sites.' },
		]
	},
	{ id: 'plugin:azure-tools:resource-map', name: 'resource-map', source: CanvasCustomizationSourceGroup.Plugin, pluginName: 'azure-tools', status: CanvasCustomizationStatus.Disabled, canvases: [{ id: 'resource-map', displayName: 'Resource Map', description: 'Visualize Azure resources.' }] },
];

export interface IMockCanvasRoots {
	readonly userHome: URI;
	readonly workspaceRoot?: URI;
}

function getExtensionFolder(extension: IMockCanvasExtension, roots: IMockCanvasRoots): URI | undefined {
	switch (extension.source) {
		case CanvasCustomizationSourceGroup.Workspace:
			return roots.workspaceRoot ? joinPath(roots.workspaceRoot, '.github', 'extensions', extension.name) : undefined;
		case CanvasCustomizationSourceGroup.User:
			return joinPath(roots.userHome, '.copilot', 'extensions', extension.name);
		case CanvasCustomizationSourceGroup.Plugin:
			return joinPath(roots.userHome, '.copilot', 'installed-plugins', extension.pluginName ?? extension.name, 'extensions', extension.name);
	}
}

/**
 * Projects extensions into page rows: one row per canvas while the extension
 * runs, or a single extension-level row when its canvases cannot be listed.
 */
export function toCanvasCustomizationRows(extensions: readonly IMockCanvasExtension[], roots: IMockCanvasRoots): ICanvasCustomizationRow[] {
	return extensions.flatMap((extension): ICanvasCustomizationRow[] => {
		const folder = getExtensionFolder(extension, roots);
		const base = {
			extensionId: extension.id,
			extensionName: extension.name,
			sourceGroup: extension.source,
			pluginName: extension.pluginName,
			pluginUri: extension.pluginName ? joinPath(roots.userHome, '.copilot', 'installed-plugins', extension.pluginName) : undefined,
			status: extension.status,
			enabled: extension.status !== CanvasCustomizationStatus.Disabled,
			sourceUri: folder ? joinPath(folder, 'extension.mjs') : undefined,
		};
		if (extension.status !== CanvasCustomizationStatus.Running || extension.canvases.length === 0) {
			return [{ ...base, id: extension.id, displayName: extension.name }];
		}
		return extension.canvases.map(canvas => ({
			...base,
			id: `${extension.id}/${canvas.id}`,
			canvasId: canvas.id,
			displayName: canvas.displayName,
			description: canvas.description,
		}));
	});
}

export class MockCanvasCustomizationService extends Disposable implements ICanvasCustomizationService {
	declare readonly _serviceBrand: undefined;

	private readonly extensions = observableValue<readonly IMockCanvasExtension[]>(this, MOCK_CANVAS_EXTENSIONS);

	readonly rows: IObservable<readonly ICanvasCustomizationRow[]>;
	readonly extensionsDisabled: IObservable<boolean> = observableValue(this, false);

	constructor(
		@IPathService pathService: IPathService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		const userHome = pathService.userHome({ preferLocal: true });
		this.rows = derived(this, reader => toCanvasCustomizationRows(this.extensions.read(reader), {
			userHome,
			workspaceRoot: workspaceContextService.getWorkspace().folders[0]?.uri,
		}));
	}

	async setEnabled(row: ICanvasCustomizationRow, enabled: boolean): Promise<void> {
		this.updateStatus(row.extensionId, enabled ? CanvasCustomizationStatus.Running : CanvasCustomizationStatus.Disabled);
	}

	async openCanvas(row: ICanvasCustomizationRow): Promise<void> {
		this.notificationService.info(localize('canvasPrototypeOpen', "Prototype: would open the canvas '{0}' beside the active chat.", row.displayName));
	}

	private updateStatus(extensionId: string, status: CanvasCustomizationStatus): void {
		this.extensions.set(this.extensions.get().map(extension => extension.id === extensionId ? { ...extension, status } : extension), undefined);
	}
}
