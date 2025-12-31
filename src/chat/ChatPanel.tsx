/**
 * ChatPanel - Multi-agent conversation interface for Logos IDE
 *
 * Provides Cursor-style @agent mentions, thread branching, and context-aware
 * conversations with ARIA agents.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useThreadManager } from '../threading/useThreadManager';
import { useAgentRegistry } from '../agents/useAgentRegistry';
import { useEditorContext } from '../context/useEditorContext';
import { useModeRegistry } from './modes/useModeRegistry';
import { AuditLogger } from '../governance/AuditLogger';
import { ThreadSidebar } from './ThreadSidebar';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ContextIndicator } from './ContextIndicator';
import { AgentSelector } from './AgentSelector';
import { ModeSelector } from './ModeSelector';
import { TangentTree } from './TangentTree';
import type { Message, AgentMention, Thread } from './types';
import type { AriaModeId } from './modes/types';

import './ChatPanel.css';

export interface ChatPanelProps {
  className?: string;
  onClose?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ className, onClose }) => {
  const {
    threads,
    activeThread,
    setActiveThread,
    addMessage,
    branchThread,
    mergeThread,
  } = useThreadManager();

  const { agents, invokeAgent, isLoading } = useAgentRegistry();
  const { context, refreshContext } = useEditorContext();
  const {
    currentMode,
    switchMode,
    isToolAllowed,
    getSystemPromptAddition,
    detectModeFromQuery,
  } = useModeRegistry();
  const [showTangentTree, setShowTangentTree] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [activeThread?.messages.length]);

  /**
   * Handle sending a message with optional agent mentions
   */
  const handleSend = useCallback(
    async (content: string, mentionedAgents: AgentMention[]) => {
      if (!activeThread) return;

      // Add user message
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        mentions: mentionedAgents,
      };
      addMessage(userMessage);

      // Log to audit
      await AuditLogger.getInstance().log('agent.invoke', {
        thread_id: activeThread.id,
        query_hash: await hashContent(content),
        agent_ids: mentionedAgents.map((m) => m.agentId),
        context_hash: await hashContent(JSON.stringify(context)),
      });

      // Determine which agents to invoke
      const targetAgents =
        mentionedAgents.length > 0
          ? mentionedAgents.map((m) => m.agentId)
          : ['logos.conductor']; // Default to Conductor

      // Invoke each mentioned agent
      for (const agentId of targetAgents) {
        try {
          const startTime = performance.now();
          const response = await invokeAgent(agentId, content, {
            context,
            thread: activeThread,
            previousMessages: activeThread.messages.slice(-10),
          });

          const latencyMs = performance.now() - startTime;

          // Add agent response
          const agentMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response.content,
            timestamp: new Date().toISOString(),
            agentId,
            tierUsed: response.tierUsed,
            codeBlocks: response.codeBlocks,
          };
          addMessage(agentMessage);

          // Log agent response
          await AuditLogger.getInstance().log('agent.response', {
            thread_id: activeThread.id,
            agent_id: agentId,
            response_hash: await hashContent(response.content),
            tier_used: response.tierUsed,
            latency_ms: latencyMs,
          });
        } catch (error) {
          console.error(`Error invoking agent ${agentId}:`, error);
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            content: `Error: Failed to get response from ${agentId}`,
            timestamp: new Date().toISOString(),
            isError: true,
          });
        }
      }
    },
    [activeThread, addMessage, invokeAgent, context]
  );

  /**
   * Handle branching the conversation from a specific message
   */
  const handleBranch = useCallback(
    (messageIndex: number) => {
      const newThread = branchThread(messageIndex);
      setActiveThread(newThread);

      AuditLogger.getInstance().log('thread.branch', {
        parent_thread_id: activeThread?.id,
        new_thread_id: newThread.id,
        branch_point: messageIndex,
      });
    },
    [activeThread, branchThread, setActiveThread]
  );

  /**
   * Handle selecting an agent from the selector
   */
  const handleAgentSelect = useCallback(
    (agentId: string) => {
      // Insert @mention into the input
      const input = document.querySelector<HTMLTextAreaElement>(
        '.logos-message-input textarea'
      );
      if (input) {
        const agent = agents.find((a) => a.id === agentId);
        if (agent) {
          const mention = `@${agent.name} `;
          const cursorPos = input.selectionStart;
          const textBefore = input.value.substring(0, cursorPos);
          const textAfter = input.value.substring(cursorPos);
          input.value = textBefore + mention + textAfter;
          input.focus();
          input.selectionStart = input.selectionEnd =
            cursorPos + mention.length;
        }
      }
    },
    [agents]
  );

  return (
    <div className={`logos-chat-panel ${className || ''}`}>
      {/* Thread sidebar */}
      <ThreadSidebar
        threads={threads}
        activeThread={activeThread}
        onSelect={setActiveThread}
        onNewThread={() => {
          // Create new thread
        }}
      />

      {/* Main chat area */}
      <div className="chat-main">
        <div className="chat-header">
          {/* Mode Selector - Cursor-style mode switching */}
          <div className="chat-header-left">
            <ModeSelector
              onModeChange={(modeId: AriaModeId) => {
                AuditLogger.getInstance().log('mode.switch', {
                  thread_id: activeThread?.id,
                  new_mode: modeId,
                  previous_mode: currentMode.id,
                });
              }}
            />
          </div>
          <h3 className="chat-title">
            {activeThread?.name || 'New Conversation'}
          </h3>
          <div className="chat-actions">
            <button
              onClick={() => setShowTangentTree(!showTangentTree)}
              className="tangent-tree-toggle"
              title="Toggle Tangent Tree"
            >
              🌳
            </button>
            {onClose && (
              <button onClick={onClose} className="close-button">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Message list */}
        <div className="message-list-container" ref={messageListRef}>
          <MessageList
            thread={activeThread}
            onBranch={handleBranch}
            isLoading={isLoading}
          />
        </div>

        {/* Context indicator */}
        <ContextIndicator context={context} onRefresh={refreshContext} />

        {/* Agent selector */}
        <AgentSelector agents={agents} onSelect={handleAgentSelect} />

        {/* Message input */}
        <MessageInput
          onSend={handleSend}
          agents={agents}
          disabled={isLoading}
          placeholder="Ask a question or @mention an agent..."
        />
      </div>

      {/* Tangent tree panel */}
      {showTangentTree && (
        <div className="tangent-tree-panel">
          <TangentTree
            threads={threads}
            activeThreadId={activeThread?.id}
            onSelectThread={setActiveThread}
            onMerge={mergeThread}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Hash content for audit logging
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default ChatPanel;


