/**
 * Tests for ChatPanel component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from '../../chat/ChatPanel';
import { EditorContextProvider } from '../../context/EditorContextProvider';

// Mock dependencies
jest.mock('../../agents/useAgentRegistry', () => ({
  useAgentRegistry: () => ({
    agents: [
      {
        id: 'logos.conductor',
        name: 'Conductor',
        description: 'Master orchestrator',
        color: '#6366f1',
        icon: '🎼',
      },
      {
        id: 'logos.swe',
        name: 'Software Engineer',
        description: 'Code specialist',
        color: '#10b981',
        icon: '💻',
      },
    ],
    getAgentById: (id: string) => ({
      id,
      name: id.split('.')[1],
      description: 'Test agent',
    }),
  }),
}));

jest.mock('../../threading/useThreadManager', () => ({
  useThreadManager: () => ({
    threads: [],
    currentThread: {
      id: 'thread-1',
      messages: [],
      agents: [],
      parentId: null,
      childrenIds: [],
    },
    createThread: jest.fn(),
    sendMessage: jest.fn(),
    switchThread: jest.fn(),
    branchThread: jest.fn(),
  }),
}));

describe('ChatPanel', () => {
  const renderChatPanel = () => {
    return render(
      <EditorContextProvider workspaceId="test-workspace">
        <ChatPanel workspaceId="test-workspace" />
      </EditorContextProvider>
    );
  };

  it('renders the chat panel', () => {
    renderChatPanel();
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
  });

  it('shows send button', () => {
    renderChatPanel();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    renderChatPanel();
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has text', async () => {
    renderChatPanel();
    const input = screen.getByPlaceholderText(/message/i);
    await userEvent.type(input, 'Hello world');

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).not.toBeDisabled();
  });

  it('shows new thread button', () => {
    renderChatPanel();
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
  });

  it('clears input after sending message', async () => {
    renderChatPanel();
    const input = screen.getByPlaceholderText(/message/i) as HTMLInputElement;
    await userEvent.type(input, 'Test message');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await userEvent.click(sendButton);

    expect(input.value).toBe('');
  });
});

describe('MessageInput', () => {
  it('shows autocomplete on @ symbol', async () => {
    renderChatPanel();
    const input = screen.getByPlaceholderText(/message/i);
    await userEvent.type(input, '@');

    // Should show agent autocomplete
    await waitFor(() => {
      expect(screen.queryByText(/Conductor/)).toBeInTheDocument();
    });
  });

  it('filters autocomplete based on input', async () => {
    renderChatPanel();
    const input = screen.getByPlaceholderText(/message/i);
    await userEvent.type(input, '@swe');

    await waitFor(() => {
      expect(screen.getByText(/Software Engineer/)).toBeInTheDocument();
      expect(screen.queryByText(/Conductor/)).not.toBeInTheDocument();
    });
  });
});

describe('ThreadSidebar', () => {
  it('shows create thread button when no threads exist', () => {
    renderChatPanel();
    // New thread button should be visible
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
  });
});

