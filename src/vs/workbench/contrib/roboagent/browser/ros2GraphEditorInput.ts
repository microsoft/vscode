/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

const ros2GraphEditorIcon = registerIcon('roboagent-ros2-graph-editor-label-icon', Codicon.typeHierarchySub, localize('roboagent.graphEditorLabelIcon', "Icon of the ROS2 node graph editor label."));

/**
 * Singleton input for the ROS2 communication graph editor (REQ-5). The editor
 * renders live from {@link IRos2WorkspaceService}, so the input carries no
 * state of its own.
 */
export class Ros2GraphEditorInput extends EditorInput {

	static readonly ID = 'roboagent.ros2GraphInput';

	private static _instance: Ros2GraphEditorInput | undefined;
	static get instance(): Ros2GraphEditorInput {
		if (!Ros2GraphEditorInput._instance || Ros2GraphEditorInput._instance.isDisposed()) {
			Ros2GraphEditorInput._instance = new Ros2GraphEditorInput();
		}
		return Ros2GraphEditorInput._instance;
	}

	override get typeId(): string {
		return Ros2GraphEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	readonly resource = URI.from({ scheme: 'roboagent-graph', path: 'ros2' });

	override getName(): string {
		return localize('roboagent.graphEditorName', "ROS2 Node Graph");
	}

	override getIcon(): ThemeIcon {
		return ros2GraphEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(other) || other instanceof Ros2GraphEditorInput;
	}
}
