/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import {
	interfacesForPackage, launchFilesForPackage, nodesForPackage, Ros2Package, Ros2WorkspaceGraph
} from '../common/ros2WorkspaceModel.js';

const $ = dom.$;

/** Node under a package that groups a category of children. */
export type Ros2GroupKind = 'nodes' | 'dependencies' | 'interfaces' | 'launch';

export interface Ros2PackageTreeElement {
	readonly type: 'package';
	readonly id: string;
	readonly pkg: Ros2Package;
}

export interface Ros2GroupTreeElement {
	readonly type: 'group';
	readonly id: string;
	readonly kind: Ros2GroupKind;
	readonly pkg: Ros2Package;
}

export interface Ros2LeafTreeElement {
	readonly type: 'leaf';
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly icon: ThemeIcon;
}

export type Ros2TreeElement = Ros2PackageTreeElement | Ros2GroupTreeElement | Ros2LeafTreeElement;

const GROUP_LABELS: Record<Ros2GroupKind, string> = {
	nodes: localize('roboagent.group.nodes', "Nodes"),
	dependencies: localize('roboagent.group.dependencies', "Dependencies"),
	interfaces: localize('roboagent.group.interfaces', "Interfaces"),
	launch: localize('roboagent.group.launch', "Launch Files"),
};

const GROUP_ICONS: Record<Ros2GroupKind, ThemeIcon> = {
	nodes: Codicon.symbolMethod,
	dependencies: Codicon.references,
	interfaces: Codicon.symbolInterface,
	launch: Codicon.rocket,
};

export class Ros2PackageExplorerDataSource implements IAsyncDataSource<Ros2WorkspaceGraph, Ros2TreeElement> {

	constructor(private readonly graphAccessor: () => Ros2WorkspaceGraph) { }

	hasChildren(element: Ros2WorkspaceGraph | Ros2TreeElement): boolean {
		if (isGraph(element)) {
			return element.packages.length > 0;
		}
		if (element.type === 'package') {
			return true;
		}
		if (element.type === 'group') {
			return this.childrenForGroup(element).length > 0;
		}
		return false;
	}

	getChildren(element: Ros2WorkspaceGraph | Ros2TreeElement): Ros2TreeElement[] {
		if (isGraph(element)) {
			return element.packages.map((pkg): Ros2PackageTreeElement => ({
				type: 'package',
				id: `pkg:${pkg.name}`,
				pkg
			}));
		}
		if (element.type === 'package') {
			return (['nodes', 'dependencies', 'interfaces', 'launch'] as Ros2GroupKind[])
				.map((kind): Ros2GroupTreeElement => ({ type: 'group', id: `group:${element.pkg.name}:${kind}`, kind, pkg: element.pkg }))
				.filter(group => this.childrenForGroup(group).length > 0);
		}
		if (element.type === 'group') {
			return this.childrenForGroup(element);
		}
		return [];
	}

	private childrenForGroup(group: Ros2GroupTreeElement): Ros2LeafTreeElement[] {
		const graph = this.graphAccessor();
		const pkgName = group.pkg.name;
		switch (group.kind) {
			case 'nodes':
				return nodesForPackage(graph, pkgName).map((n): Ros2LeafTreeElement => ({
					type: 'leaf',
					id: `node:${pkgName}:${n.name}`,
					label: n.name,
					description: n.language === 'cpp' ? 'C++' : n.language === 'python' ? 'Python' : undefined,
					icon: n.language === 'python' ? Codicon.symbolNamespace : Codicon.symbolMethod
				}));
			case 'dependencies': {
				const deps = Array.from(new Set([...group.pkg.dependencies.build, ...group.pkg.dependencies.exec])).sort();
				return deps.map((d): Ros2LeafTreeElement => ({ type: 'leaf', id: `dep:${pkgName}:${d}`, label: d, icon: Codicon.package }));
			}
			case 'interfaces':
				return interfacesForPackage(graph, pkgName).map((i): Ros2LeafTreeElement => ({
					type: 'leaf',
					id: `iface:${pkgName}:${i.kind}:${i.name}`,
					label: i.name,
					description: i.kind,
					icon: Codicon.symbolInterface
				}));
			case 'launch':
				return launchFilesForPackage(graph, pkgName).map((l): Ros2LeafTreeElement => ({
					type: 'leaf',
					id: `launch:${pkgName}:${l.path.toString()}`,
					label: l.path.path.split('/').pop() ?? l.path.toString(),
					description: l.format,
					icon: Codicon.rocket
				}));
		}
	}
}

function isGraph(element: Ros2WorkspaceGraph | Ros2TreeElement): element is Ros2WorkspaceGraph {
	return (element as Ros2TreeElement).type === undefined;
}

export class Ros2PackageExplorerDelegate implements IListVirtualDelegate<Ros2TreeElement> {
	getHeight(): number {
		return 22;
	}
	getTemplateId(): string {
		return Ros2PackageExplorerRenderer.ID;
	}
}

interface IRos2TemplateData {
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly description: HTMLElement;
}

export class Ros2PackageExplorerRenderer implements ITreeRenderer<Ros2TreeElement, FuzzyScore, IRos2TemplateData> {

	static readonly ID = 'roboagent.ros2PackageElement';

	get templateId(): string {
		return Ros2PackageExplorerRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IRos2TemplateData {
		const row = dom.append(container, $('.roboagent-ros2-row'));
		const icon = dom.append(row, $('.roboagent-ros2-icon'));
		const label = dom.append(row, $('span.roboagent-ros2-label'));
		const description = dom.append(row, $('span.roboagent-ros2-description'));
		return { icon, label, description };
	}

	renderElement(node: ITreeNode<Ros2TreeElement, FuzzyScore>, _index: number, data: IRos2TemplateData): void {
		const element = node.element;
		const { icon, label, description } = describeElement(element);
		data.icon.className = `roboagent-ros2-icon ${ThemeIcon.asClassName(icon)}`;
		data.label.textContent = label;
		data.description.textContent = description ?? '';
	}

	disposeTemplate(): void {
		// no per-template disposables
	}
}

export class Ros2PackageExplorerAccessibilityProvider implements IListAccessibilityProvider<Ros2TreeElement> {
	getWidgetAriaLabel(): string {
		return localize('roboagent.ros2Explorer', "ROS2 Packages");
	}
	getAriaLabel(element: Ros2TreeElement): string {
		const { label, description } = describeElement(element);
		return description ? `${label}, ${description}` : label;
	}
}

function describeElement(element: Ros2TreeElement): { label: string; description?: string; icon: ThemeIcon } {
	switch (element.type) {
		case 'package':
			return {
				label: element.pkg.name,
				description: element.pkg.isInterfacePackage ? localize('roboagent.interfacePkg', "interfaces") : element.pkg.buildType,
				icon: Codicon.package
			};
		case 'group':
			return { label: GROUP_LABELS[element.kind], icon: GROUP_ICONS[element.kind] };
		case 'leaf':
			return { label: element.label, description: element.description, icon: element.icon };
	}
}

export function treeIdentityProvider() {
	return { getId: (element: Ros2TreeElement) => element.id };
}
