/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';
import { Ros2GraphEditorInput } from './ros2GraphEditorInput.js';

const ROBOAGENT_CATEGORY = localize2('roboagent.category', "RoboAgent");

/**
 * Context key describing the Package-Explorer element under the cursor. Set in an overlay by the
 * view's `onContextMenu` handler (WS7); the tree context-menu Action2s below gate their `when` on
 * it. Values: `'package'` | `'node'`.
 */
export const ROBOAGENT_ITEM_TYPE = new RawContextKey<string>('roboagentItemType', '');

/** Payload the view forwards for a node context menu (matches the extension's NodeDebugPayload). */
export interface Ros2NodeMenuArg { readonly package: string; readonly node: string; readonly language?: string }
/** Payload the view forwards for a package context menu. */
export interface Ros2PackageMenuArg { readonly package: string; readonly packageXmlUri: string }

// --- Index action (existing) ----------------------------------------------

export class IndexRos2WorkspaceAction extends Action2 {
	static readonly ID = 'roboagent.indexRos2Workspace';

	constructor() {
		super({
			id: IndexRos2WorkspaceAction.ID,
			title: localize2('roboagent.indexRos2Workspace', "Index ROS2 Workspace"),
			category: ROBOAGENT_CATEGORY,
			f1: true,
			icon: Codicon.refresh,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', 'roboagent.ros2PackageExplorer')
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IRos2WorkspaceService).indexWorkspace();
	}
}

// --- Graph view action (REQ-5) --------------------------------------------

export class ShowRos2GraphAction extends Action2 {
	static readonly ID = 'roboagent.showRos2Graph';

	constructor() {
		super({
			id: ShowRos2GraphAction.ID,
			title: localize2('roboagent.showRos2Graph', "Show ROS2 Node Graph"),
			category: ROBOAGENT_CATEGORY,
			f1: true,
			icon: Codicon.typeHierarchySub,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.equals('view', 'roboagent.ros2PackageExplorer')
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IEditorService).openEditor(Ros2GraphEditorInput.instance, { pinned: true });
	}
}

// --- Package-Explorer context-menu actions (WS7) --------------------------
//
// Data-driven: each descriptor forwards the tree's payload to a roboagent-ros2 EXTENSION
// command via ICommandService, keeping the build/run/debug logic in the extension while the
// custom tree's context menu lives in the fork.

interface ITreeForwardActionDescriptor {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	/** Which {@link ROBOAGENT_ITEM_TYPE} value the menu entry applies to. */
	readonly itemType: 'package' | 'node';
	readonly order: number;
	/** Extension command id the payload is forwarded to. */
	readonly forwardTo: string;
}

function registerTreeForwardAction(desc: ITreeForwardActionDescriptor): void {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: desc.id,
				title: desc.title,
				category: ROBOAGENT_CATEGORY,
				icon: desc.icon,
				menu: [{ id: MenuId.ViewItemContext, group: 'navigation', order: desc.order, when: ContextKeyExpr.equals(ROBOAGENT_ITEM_TYPE.key, desc.itemType) }]
			});
		}
		override async run(accessor: ServicesAccessor, arg?: Ros2NodeMenuArg | Ros2PackageMenuArg): Promise<void> {
			if (arg?.package) {
				await accessor.get(ICommandService).executeCommand(desc.forwardTo, arg);
			}
		}
	});
}

class RevealPackageXmlAction extends Action2 {
	static readonly ID = 'roboagent.tree.revealPackageXml';
	constructor() {
		super({
			id: RevealPackageXmlAction.ID,
			title: localize2('roboagent.tree.revealPackageXml', "Reveal package.xml"),
			category: ROBOAGENT_CATEGORY,
			icon: Codicon.goToFile,
			menu: [{ id: MenuId.ViewItemContext, group: 'navigation', order: 2, when: ContextKeyExpr.equals(ROBOAGENT_ITEM_TYPE.key, 'package') }]
		});
	}
	override async run(accessor: ServicesAccessor, arg?: Ros2PackageMenuArg): Promise<void> {
		if (arg?.packageXmlUri) {
			await accessor.get(IEditorService).openEditor({ resource: URI.parse(arg.packageXmlUri) });
		}
	}
}

export function registerRoboAgentActions(): void {
	registerAction2(IndexRos2WorkspaceAction);
	registerAction2(ShowRos2GraphAction);
	registerAction2(RevealPackageXmlAction);
	registerTreeForwardAction({ id: 'roboagent.tree.buildPackage', title: localize2('roboagent.tree.buildPackage', "Build Package"), icon: Codicon.package, itemType: 'package', order: 1, forwardTo: 'roboagent.colconBuildPackage' });
	registerTreeForwardAction({ id: 'roboagent.tree.runNode', title: localize2('roboagent.tree.runNode', "Run Node"), icon: Codicon.play, itemType: 'node', order: 1, forwardTo: 'roboagent.runNode' });
	registerTreeForwardAction({ id: 'roboagent.tree.debugNode', title: localize2('roboagent.tree.debugNode', "Debug Node"), icon: Codicon.debugAlt, itemType: 'node', order: 2, forwardTo: 'roboagent.debugNode' });
}

// Localized string referenced by the empty-state welcome view content.
export const INDEX_WELCOME_BUTTON = localize('roboagent.indexWelcomeButton', "Index ROS2 Workspace");
