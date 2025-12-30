/**
 * TangentTree - Visualizes conversation branching structure
 *
 * Displays threads as a tree with visual connections showing
 * parent-child relationships and branch points.
 */

import React, { useMemo } from 'react';
import type { Thread, MergeRequest } from './types';

import './TangentTree.css';

export interface TangentTreeProps {
  threads: Thread[];
  activeThreadId?: string;
  onSelectThread: (thread: Thread) => void;
  onMerge: (request: MergeRequest) => void;
}

interface TreeNode {
  thread: Thread;
  children: TreeNode[];
  depth: number;
}

export const TangentTree: React.FC<TangentTreeProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onMerge,
}) => {
  // Build tree structure from flat thread list
  const tree = useMemo(() => buildTree(threads), [threads]);

  if (threads.length === 0) {
    return (
      <div className="tangent-tree-empty">
        <p>No conversation threads yet.</p>
      </div>
    );
  }

  return (
    <div className="tangent-tree">
      <div className="tangent-tree-header">
        <h4>Conversation Branches</h4>
        <span className="thread-count">{threads.length} threads</span>
      </div>
      <div className="tangent-tree-content">
        {tree.map((node) => (
          <TreeNodeComponent
            key={node.thread.id}
            node={node}
            activeThreadId={activeThreadId}
            onSelect={onSelectThread}
            onMerge={onMerge}
          />
        ))}
      </div>
    </div>
  );
};

interface TreeNodeComponentProps {
  node: TreeNode;
  activeThreadId?: string;
  onSelect: (thread: Thread) => void;
  onMerge: (request: MergeRequest) => void;
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
  node,
  activeThreadId,
  onSelect,
  onMerge,
}) => {
  const { thread, children, depth } = node;
  const isActive = thread.id === activeThreadId;

  return (
    <div
      className="tree-node"
      style={{ marginLeft: `${depth * 20}px` }}
    >
      {/* Connection line for child nodes */}
      {depth > 0 && (
        <div className="tree-connection">
          <div className="tree-line-vertical"></div>
          <div className="tree-line-horizontal"></div>
        </div>
      )}

      {/* Node content */}
      <button
        className={`tree-node-content ${isActive ? 'tree-node-content--active' : ''}`}
        onClick={() => onSelect(thread)}
      >
        <div className="node-icon">
          {children.length > 0 ? '📁' : '💬'}
        </div>
        <div className="node-info">
          <span className="node-name">
            {thread.name || `Thread ${thread.id.slice(0, 8)}`}
          </span>
          <span className="node-meta">
            {thread.messages.length} messages
            {thread.branchPoint !== undefined && (
              <span className="branch-indicator">
                @ message {thread.branchPoint + 1}
              </span>
            )}
          </span>
        </div>
        {thread.parentId && (
          <button
            className="merge-button"
            onClick={(e) => {
              e.stopPropagation();
              onMerge({
                sourceThreadId: thread.id,
                targetThreadId: thread.parentId!,
                selectedMessages: [],
              });
            }}
            title="Merge back to parent"
          >
            🔀
          </button>
        )}
      </button>

      {/* Render children */}
      {children.map((child) => (
        <TreeNodeComponent
          key={child.thread.id}
          node={child}
          activeThreadId={activeThreadId}
          onSelect={onSelect}
          onMerge={onMerge}
        />
      ))}
    </div>
  );
};

/**
 * Build a tree structure from flat thread list
 */
function buildTree(threads: Thread[]): TreeNode[] {
  const threadMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];

  // Create nodes for all threads
  for (const thread of threads) {
    threadMap.set(thread.id, {
      thread,
      children: [],
      depth: 0,
    });
  }

  // Build parent-child relationships
  for (const thread of threads) {
    const node = threadMap.get(thread.id)!;

    if (thread.parentId) {
      const parent = threadMap.get(thread.parentId);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  }

  // Sort children by creation time
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        new Date(a.thread.createdAt).getTime() -
        new Date(b.thread.createdAt).getTime()
    );
    for (const node of nodes) {
      sortChildren(node.children);
    }
  };

  sortChildren(rootNodes);

  return rootNodes;
}

export default TangentTree;


