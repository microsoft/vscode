/**
 * ThreadSidebar - Conversation thread navigation
 *
 * Displays list of conversation threads with quick actions
 * for creating, deleting, and switching threads.
 */

import React, { useState, useCallback } from 'react';
import type { Thread } from './types';

import './ThreadSidebar.css';

export interface ThreadSidebarProps {
  threads: Thread[];
  activeThread: Thread | null;
  onSelect: (thread: Thread) => void;
  onNewThread: () => void;
  onDeleteThread?: (threadId: string) => void;
  onRenameThread?: (threadId: string, newName: string) => void;
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  threads,
  activeThread,
  onSelect,
  onNewThread,
  onDeleteThread,
  onRenameThread,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Filter threads by search
  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      thread.name?.toLowerCase().includes(query) ||
      thread.messages.some((m) => m.content.toLowerCase().includes(query))
    );
  });

  // Group threads by date
  const groupedThreads = groupByDate(filteredThreads);

  const handleRename = useCallback(
    (threadId: string) => {
      if (editName.trim() && onRenameThread) {
        onRenameThread(threadId, editName.trim());
      }
      setEditingId(null);
      setEditName('');
    },
    [editName, onRenameThread]
  );

  return (
    <div className="logos-thread-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <h3>Conversations</h3>
        <button
          className="new-thread-button"
          onClick={onNewThread}
          title="New conversation"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="clear-search"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* Thread list */}
      <div className="thread-list">
        {Object.entries(groupedThreads).map(([date, dateThreads]) => (
          <div key={date} className="thread-group">
            <div className="thread-group-header">{date}</div>
            {dateThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThread?.id}
                isEditing={thread.id === editingId}
                editName={editName}
                onSelect={() => onSelect(thread)}
                onDelete={onDeleteThread ? () => onDeleteThread(thread.id) : undefined}
                onStartRename={() => {
                  setEditingId(thread.id);
                  setEditName(thread.name || '');
                }}
                onEditNameChange={setEditName}
                onRename={() => handleRename(thread.id)}
                onCancelRename={() => {
                  setEditingId(null);
                  setEditName('');
                }}
              />
            ))}
          </div>
        ))}

        {filteredThreads.length === 0 && (
          <div className="empty-threads">
            {searchQuery ? (
              <p>No conversations match "{searchQuery}"</p>
            ) : (
              <>
                <p>No conversations yet</p>
                <button onClick={onNewThread}>Start a new conversation</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  onSelect: () => void;
  onDelete?: () => void;
  onStartRename: () => void;
  onEditNameChange: (name: string) => void;
  onRename: () => void;
  onCancelRename: () => void;
}

const ThreadItem: React.FC<ThreadItemProps> = ({
  thread,
  isActive,
  isEditing,
  editName,
  onSelect,
  onDelete,
  onStartRename,
  onEditNameChange,
  onRename,
  onCancelRename,
}) => {
  const [showActions, setShowActions] = useState(false);

  const lastMessage = thread.messages[thread.messages.length - 1];
  const preview = lastMessage?.content.slice(0, 50) || 'No messages';

  return (
    <div
      className={`thread-item ${isActive ? 'active' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button className="thread-content" onClick={onSelect}>
        <div className="thread-header">
          {isEditing ? (
            <input
              type="text"
              className="thread-name-input"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename();
                if (e.key === 'Escape') onCancelRename();
              }}
              onBlur={onRename}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="thread-name">
              {thread.name || `Thread ${thread.id.slice(0, 8)}`}
            </span>
          )}
          {thread.parentId && (
            <span className="branch-indicator" title="Branched conversation">
              🌿
            </span>
          )}
        </div>
        <div className="thread-preview">{preview}</div>
        <div className="thread-meta">
          <span className="message-count">{thread.messages.length} messages</span>
          <span className="thread-time">{formatTime(thread.updatedAt)}</span>
        </div>
        {thread.agents.length > 0 && (
          <div className="thread-agents">
            {thread.agents.slice(0, 3).map((agentId) => (
              <span key={agentId} className="agent-chip">
                {agentId.split('.').pop()}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Actions */}
      {showActions && !isEditing && (
        <div className="thread-actions">
          <button
            className="thread-action"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            title="Rename"
          >
            ✏️
          </button>
          {onDelete && (
            <button
              className="thread-action delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Group threads by date
 */
function groupByDate(threads: Thread[]): Record<string, Thread[]> {
  const groups: Record<string, Thread[]> = {};
  const now = new Date();

  for (const thread of threads) {
    const date = new Date(thread.updatedAt);
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    let label: string;
    if (diffDays === 0) {
      label = 'Today';
    } else if (diffDays === 1) {
      label = 'Yesterday';
    } else if (diffDays < 7) {
      label = 'This Week';
    } else if (diffDays < 30) {
      label = 'This Month';
    } else {
      label = 'Older';
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(thread);
  }

  // Sort threads within each group
  for (const threads of Object.values(groups)) {
    threads.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  return groups;
}

/**
 * Format time for display
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default ThreadSidebar;

