/**
 * MessageList - Renders conversation messages with agent responses
 */

import React from 'react';
import { AgentAvatar, TierBadge } from './AgentSelector';
import { CodeBlock } from './CodeBlock';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { Message, Thread, AgentPersona } from './types';
import { useAgentRegistry } from '../agents/useAgentRegistry';

import './MessageList.css';

export interface MessageListProps {
  thread: Thread | null;
  onBranch: (messageIndex: number) => void;
  isLoading: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({
  thread,
  onBranch,
  isLoading,
}) => {
  const { agents } = useAgentRegistry();

  if (!thread) {
    return (
      <div className="message-list-empty">
        <p>Start a new conversation or select an existing thread.</p>
        <p className="hint">
          Use <code>@agent</code> to mention a specific agent, or just type to
          chat with the Conductor.
        </p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {thread.messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          messageIndex={index}
          agent={agents.find((a) => a.id === message.agentId)}
          onBranch={() => onBranch(index)}
        />
      ))}
      {isLoading && <LoadingIndicator />}
    </div>
  );
};

interface MessageItemProps {
  message: Message;
  messageIndex: number;
  agent?: AgentPersona;
  onBranch: () => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  messageIndex,
  agent,
  onBranch,
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={`message-item message-item--${message.role} ${
        message.isError ? 'message-item--error' : ''
      }`}
    >
      {/* Message header */}
      <div className="message-header">
        {isUser ? (
          <div className="message-sender">
            <span className="user-avatar">👤</span>
            <span className="sender-name">You</span>
          </div>
        ) : agent ? (
          <div className="message-sender">
            <AgentAvatar agent={agent} size="sm" />
            <span className="sender-name">{agent.name}</span>
            {message.tierUsed && <TierBadge tier={message.tierUsed} />}
          </div>
        ) : isSystem ? (
          <div className="message-sender">
            <span className="system-avatar">ℹ️</span>
            <span className="sender-name">System</span>
          </div>
        ) : null}

        <span className="message-time">{formatTime(message.timestamp)}</span>
      </div>

      {/* Message content */}
      <div className="message-content">
        <MarkdownRenderer content={message.content} />

        {/* Code blocks */}
        {message.codeBlocks?.map((block) => (
          <CodeBlock
            key={block.id}
            code={block.code}
            language={block.language}
            filename={block.filename}
            onApply={() => applyCodeChange(block)}
          />
        ))}
      </div>

      {/* Message actions */}
      <div className="message-actions">
        <button
          onClick={onBranch}
          className="action-button"
          title="Branch conversation from here"
        >
          🌿 Branch
        </button>
        <button
          onClick={() => copyMessage(message)}
          className="action-button"
          title="Copy message"
        >
          📋 Copy
        </button>
        {!isUser && (
          <button
            onClick={() => {}}
            className="action-button"
            title="Follow up on this response"
          >
            ↩️ Follow Up
          </button>
        )}
      </div>
    </div>
  );
};

const LoadingIndicator: React.FC = () => {
  return (
    <div className="message-loading">
      <div className="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span className="loading-text">Agent is thinking...</span>
    </div>
  );
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function copyMessage(message: Message): void {
  navigator.clipboard.writeText(message.content);
}

function applyCodeChange(block: { code: string; filename?: string }): void {
  // This would integrate with VSCode's file editing API
  console.log('Applying code change:', block);
}

export default MessageList;

