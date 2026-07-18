/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { env } from '../../../../base/common/process.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';

interface RoboAgentProjectConfig {
	controlLevel?: 'high' | 'low';
	domain?: string;
	target?: string;
	env?: string;
}

/**
 * The RoboAgent ROS2 status-bar indicator (WS2). Shows the ROS2 distro (from `$ROS_DISTRO`) and
 * a live indexing/indexed segment driven by {@link IRos2WorkspaceService}. When the open folder
 * carries a `.roboagent/project.json` (REQ-4), the indicator reflects the recorded project type
 * (e.g. `$(circuit-board) STM32` for a low-level target). A future `Connected` segment for the
 * rclpy live bridge is stubbed in the tooltip.
 */
export class Ros2StatusBar extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'roboagent.ros2StatusBar';
	private static readonly ENTRY_ID = 'roboagent.ros2Status';

	private readonly accessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private project: RoboAgentProjectConfig | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IRos2WorkspaceService private readonly ros2WorkspaceService: IRos2WorkspaceService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		this.accessor.value = this.statusbarService.addEntry(this.entry(), Ros2StatusBar.ENTRY_ID, StatusbarAlignment.LEFT, 100);

		this._register(this.ros2WorkspaceService.onDidChangeGraph(() => this.render()));
		this._register(this.ros2WorkspaceService.onDidChangeIndexing(() => this.render()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.refreshProject()));
		this.refreshProject();
	}

	private render(): void {
		this.accessor.value?.update(this.entry());
	}

	private async refreshProject(): Promise<void> {
		this.project = await this.readProjectConfig();
		this.render();
	}

	private async readProjectConfig(): Promise<RoboAgentProjectConfig | undefined> {
		const folder = this.contextService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		const uri = joinPath(folder.uri, '.roboagent', 'project.json');
		try {
			const content = await this.fileService.readFile(uri);
			return JSON.parse(content.value.toString()) as RoboAgentProjectConfig;
		} catch {
			return undefined;   // no project.json — fall back to generic ROS2 display
		}
	}

	private entry(): IStatusbarEntry {
		const indexing = this.ros2WorkspaceService.isIndexing;
		const graph = this.ros2WorkspaceService.getGraph();
		const distro = env['ROS_DISTRO'];

		// Low-level (embedded) projects show their MCU target instead of a ROS distro.
		let text: string;
		let name: string;
		if (this.project?.controlLevel === 'low' && this.project.target) {
			text = `$(circuit-board) ${this.project.target.toUpperCase()}`;
			name = localize('roboagent.status.target', "RoboAgent Target");
		} else {
			const label = distro ? `ROS2: ${distro}` : 'ROS2';
			text = `$(circuit-board) ${label}`;
			name = localize('roboagent.status.ros2', "ROS2 Distro");
		}

		let stateSegment: string;
		if (indexing) {
			stateSegment = '$(sync~spin) ' + localize('roboagent.status.indexing', "Indexing…");
		} else if (graph.packages.length > 0) {
			stateSegment = '$(check) ' + localize('roboagent.status.indexed', "{0} pkgs", graph.packages.length);
		} else {
			stateSegment = '$(circle-slash) ' + localize('roboagent.status.notIndexed', "Not indexed");
		}

		const connected = localize('roboagent.status.disconnected', "Live bridge: off");   // future rclpy bridge

		return {
			name,
			text: `${text}  ${stateSegment}`,
			ariaLabel: `${text}, ${stateSegment}`,
			tooltip: `${text} · ${stateSegment} · ${connected}\n${localize('roboagent.status.tooltip', "Open the ROS2 Package Explorer / re-index the workspace")}`,
			command: 'roboagent.indexRos2Workspace',
		};
	}
}
