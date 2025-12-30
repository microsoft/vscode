/**
 * AgentSelector - UI component for selecting and mentioning agents
 *
 * Displays available agents and allows quick insertion of @mentions
 */

import React, { useState, useCallback } from 'react';
import type { AgentPersona } from './types';

import './AgentSelector.css';

export interface AgentSelectorProps {
  agents: AgentPersona[];
  onSelect: (agentId: string) => void;
  className?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  onSelect,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAgentClick = useCallback(
    (agentId: string) => {
      onSelect(agentId);
      setIsExpanded(false);
    },
    [onSelect]
  );

  return (
    <div className={`logos-agent-selector ${className || ''}`}>
      <button
        className="agent-selector-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        title="Select an agent"
      >
        <span className="agent-icon">@</span>
        <span className="agent-label">Agents</span>
      </button>

      {isExpanded && (
        <div className="agent-selector-dropdown">
          <div className="agent-selector-header">
            <span>Available Agents</span>
            <button
              className="close-dropdown"
              onClick={() => setIsExpanded(false)}
            >
              ✕
            </button>
          </div>
          <div className="agent-list">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => handleAgentClick(agent.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface AgentCardProps {
  agent: AgentPersona;
  onClick: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent, onClick }) => {
  return (
    <button className="agent-card" onClick={onClick}>
      <AgentAvatar agent={agent} size="md" />
      <div className="agent-info">
        <span className="agent-name">{agent.name}</span>
        <span className="agent-description">{agent.description}</span>
      </div>
      <div className="agent-tier">
        <TierBadge tier={agent.defaultTier} />
      </div>
    </button>
  );
};

interface AgentAvatarProps {
  agent: AgentPersona;
  size?: 'sm' | 'md' | 'lg';
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  agent,
  size = 'md',
}) => {
  return (
    <div
      className={`agent-avatar agent-avatar--${size}`}
      style={{ backgroundColor: agent.color }}
    >
      {agent.icon}
    </div>
  );
};

interface TierBadgeProps {
  tier: number;
}

export const TierBadge: React.FC<TierBadgeProps> = ({ tier }) => {
  const tierLabels = ['', 'Lite', 'Standard', 'Pro'];
  const tierColors = ['', '#4ade80', '#60a5fa', '#a78bfa'];

  return (
    <span
      className="tier-badge"
      style={{ backgroundColor: tierColors[tier] || '#94a3b8' }}
    >
      T{tier}: {tierLabels[tier] || 'Unknown'}
    </span>
  );
};

export default AgentSelector;


