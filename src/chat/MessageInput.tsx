/**
 * MessageInput - Chat input with @mention autocomplete
 *
 * Provides rich text input with agent mention detection,
 * keyboard shortcuts, and context awareness.
 */

import React, { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import type { AgentPersona, AgentMention } from './types';

import './MessageInput.css';

export interface MessageInputProps {
  onSend: (content: string, mentions: AgentMention[]) => void;
  agents: AgentPersona[];
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  agents,
  disabled = false,
  placeholder = 'Type a message...',
}) => {
  const [value, setValue] = useState('');
  const [mentions, setMentions] = useState<AgentMention[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter agents based on autocomplete query
  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(autocompleteQuery.toLowerCase())
  );

  // Handle input changes
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;
      setValue(newValue);
      setCursorPosition(cursorPos);

      // Check for @ trigger
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        setShowAutocomplete(true);
        setAutocompleteQuery(atMatch[1]);
        setAutocompleteIndex(0);
      } else {
        setShowAutocomplete(false);
        setAutocompleteQuery('');
      }

      // Update mentions (remove any that are no longer in text)
      const updatedMentions = mentions.filter((m) =>
        newValue.includes(`@${m.agentName}`)
      );
      setMentions(updatedMentions);
    },
    [mentions]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showAutocomplete) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAutocompleteIndex((i) => Math.min(i + 1, filteredAgents.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAutocompleteIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (filteredAgents[autocompleteIndex]) {
            insertMention(filteredAgents[autocompleteIndex]);
          }
        } else if (e.key === 'Escape') {
          setShowAutocomplete(false);
        }
      } else {
        // Send on Cmd/Ctrl+Enter
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [showAutocomplete, filteredAgents, autocompleteIndex]
  );

  // Insert a mention into the text
  const insertMention = useCallback(
    (agent: AgentPersona) => {
      const textBeforeCursor = value.slice(0, cursorPosition);
      const textAfterCursor = value.slice(cursorPosition);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        const startIndex = cursorPosition - atMatch[0].length;
        const newText =
          textBeforeCursor.slice(0, startIndex) +
          `@${agent.name} ` +
          textAfterCursor;

        setValue(newText);

        // Add to mentions
        const mention: AgentMention = {
          agentId: agent.id,
          agentName: agent.name,
          startIndex,
          endIndex: startIndex + agent.name.length + 1,
        };
        setMentions((prev) => [...prev, mention]);
      }

      setShowAutocomplete(false);
      setAutocompleteQuery('');

      // Focus back on textarea
      textareaRef.current?.focus();
    },
    [value, cursorPosition]
  );

  // Handle send
  const handleSend = useCallback(() => {
    if (value.trim() && !disabled) {
      onSend(value.trim(), mentions);
      setValue('');
      setMentions([]);
    }
  }, [value, mentions, disabled, onSend]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [value]);

  return (
    <div className="logos-message-input">
      <div className="input-container">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />

        {/* Autocomplete dropdown */}
        {showAutocomplete && filteredAgents.length > 0 && (
          <div className="autocomplete-dropdown">
            {filteredAgents.map((agent, index) => (
              <button
                key={agent.id}
                className={`autocomplete-item ${
                  index === autocompleteIndex ? 'selected' : ''
                }`}
                onClick={() => insertMention(agent)}
              >
                <span
                  className="agent-avatar"
                  style={{ backgroundColor: agent.color }}
                >
                  {agent.icon}
                </span>
                <span className="agent-name">{agent.name}</span>
                <span className="agent-desc">{agent.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="input-actions">
        <span className="input-hint">
          <kbd>@</kbd> mention agent • <kbd>⌘</kbd>+<kbd>↵</kbd> send
        </span>
        <button
          className="send-button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default MessageInput;


