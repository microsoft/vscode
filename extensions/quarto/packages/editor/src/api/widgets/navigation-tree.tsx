/*
 * navigation-tree.tsx
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import React, { CSSProperties } from 'react';

import { WidgetProps } from './react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';

import './navigation-tree.css';

// Individual nodes and children of the Select Tree
export interface NavigationTreeNode {
  key: string;
  image?: string;
  name: string;
  type: string;
  children: NavigationTreeNode[];
  expanded?: boolean;
}

interface NavigationTreeProps extends WidgetProps {
  height: number;
  nodes: NavigationTreeNode[];
  selectedNode: NavigationTreeNode;
  onSelectedNodeChanged: (node: NavigationTreeNode) => void;
}

interface NavigationTreeItemProps extends ListChildComponentProps {
  data: {
    nodes: NavigationTreeNode[];
    selectedNode: NavigationTreeNode;
    onSelectedNodeChanged: (node: NavigationTreeNode) => void;
    showSelection: boolean;
    preventFocus: boolean;
  };
}

// Indent level for each level
const kNavigationTreeIndent = 8;

// Select Tree is a single selection tree that is useful in
// hierarchical navigation type contexts. It does not support
// multiple selection and is generally not a well behaved tree
// like you would use to navigate a hierarchical file system.
export const NavigationTree: React.FC<NavigationTreeProps> = props => {
  const style: CSSProperties = {
    height: props.height + 'px',
    ...props.style,
  };

  // The currently selected node should always be expanded
  const selectedNode = props.selectedNode;

  // Ensure that all the parents of the selected node are expanded
  const nodes = props.nodes;
  const currentNodePath = pathToNode(selectedNode, nodes);
  currentNodePath.forEach(node => (node.expanded = true));
  const selNode = nodes.find(n => n.key === selectedNode.key);
  if (selNode) {
    selNode.expanded = true;
  }
  const vizNodes = visibleNodes(props.nodes, props.selectedNode);

  // Ensure the item is scrolled into view
  const fixedList = React.useRef<FixedSizeList>(null);
  React.useEffect(() => {
    if (props.selectedNode) {
      vizNodes.find((value, index) => {
        if (value.key === selectedNode.key) {
          fixedList.current?.scrollToItem(index);
          return true;
        } else {
          return false;
        }
      });
    }
  });

  // Process keys to enable keyboard based navigation
  const processKey = (e: React.KeyboardEvent) => {
    const selected = props.selectedNode;
    switch (e.key) {
      case 'ArrowDown':
        if (selected) {
          const next = stepNode(selectedNode, props.nodes, 1);
          props.onSelectedNodeChanged(next);
        }
        break;

      case 'ArrowUp':
        if (selected) {
          const previous = stepNode(selectedNode, props.nodes, -1);
          props.onSelectedNodeChanged(previous);
        }
        break;

      case 'PageDown':
        if (selected) {
          const next = stepNode(selectedNode, props.nodes, 4);
          props.onSelectedNodeChanged(next);
        }
        break;

      case 'PageUp':
        if (selected) {
          const previous = stepNode(selectedNode, props.nodes, -4);
          props.onSelectedNodeChanged(previous);
        }
        break;
    }
  };

  return (
    <div style={style} tabIndex={0} onKeyDown={processKey}>
      <FixedSizeList
        className="pm-navigation-tree"
        height={props.height}
        width="100%"
        itemCount={vizNodes.length}
        itemSize={28}
        itemData={{
          nodes: vizNodes,
          selectedNode: props.selectedNode,
          onSelectedNodeChanged: props.onSelectedNodeChanged,
          showSelection: true,
          preventFocus: true,
        }}
        ref={fixedList}
      >
        {NavigationTreeItem}
      </FixedSizeList>
    </div>
  );
};

// Renders each item
const NavigationTreeItem = (props: NavigationTreeItemProps) => {
  const data = props.data;
  const node: NavigationTreeNode = props.data.nodes[props.index];
  const path = pathToNode(node, data.nodes);
  const depth = path.length - 1;

  // Select the tree node
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    data.onSelectedNodeChanged(node);
  };

  // Whether this node is selected
  const selected = data.selectedNode.key === node.key;

  const indentLevel = depth;
  const indentStyle = {
    paddingLeft: indentLevel * kNavigationTreeIndent + 'px',
  };

  const selectedClassName = `${
    selected ? 'pm-selected-navigation-tree-item' : 'pm-navigation-tree-item'
  } pm-navigation-tree-node`;
  return (
    <div key={node.key} onClick={onClick} style={props.style}>
      <div className={selectedClassName} style={indentLevel > 0 ? indentStyle : undefined}>
        {node.image ? (
          <div className="pm-navigation-tree-node-image-div">
            <img src={node.image} alt={node.name} className="pm-navigation-tree-node-image" draggable="false"/>
          </div>
        ) : null}
        <div className="pm-navigation-tree-node-label-div pm-text-color">{node.name}</div>
      </div>
    </div>
  );
};

// Indicates whether a given key is the identified node or one of its
// children
export function containsChild(key: string, node: NavigationTreeNode): boolean {
  if (node.key === key) {
    return true;
  }

  for (const childNode of node.children) {
    const hasChild = containsChild(key, childNode);
    if (hasChild) {
      return true;
    }
  }
  return false;
}

// enumerate the nodes that lead to a selected node
function pathToNode(node: NavigationTreeNode, nodes: NavigationTreeNode[]): NavigationTreeNode[] {
  const path: NavigationTreeNode[] = [];
  if (node) {
    for (const root of nodes) {
      if (root.key === node.key) {
        path.push(node);
        return path;
      }

      const childPath = pathToNode(node, root.children);
      if (childPath.length > 0) {
        path.push(root, ...childPath);
        return path;
      }
    }
  }
  return path;
}

// Creates an ordered flattened list of visible nodes in the
// tree. Useful for incrementing through visible nodes :)
function visibleNodes(nodes: NavigationTreeNode[], selectedNode: NavigationTreeNode) {
  const nodeList: NavigationTreeNode[][] = nodes.map(node => {
    if (node.expanded || node.key === selectedNode.key) {
      return [node].concat(visibleNodes(node.children, selectedNode));
    } else {
      return [node];
    }
  });
  return ([] as NavigationTreeNode[]).concat(...nodeList);
}

// Get the previous node for the current node
function stepNode(node: NavigationTreeNode, allNodes: NavigationTreeNode[], increment: number): NavigationTreeNode {
  const nodes = visibleNodes(allNodes, node);
  const currentIndex = nodes.map(n => n.key).indexOf(node.key);
  const step = currentIndex + increment;
  if (step >= 0 && step < nodes.length - 1) {
    return nodes[step];
  } else if (step < 0) {
    return nodes[0];
  } else {
    return nodes[nodes.length - 1];
  }
}
