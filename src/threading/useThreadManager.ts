/**
 * useThreadManager - React hook for thread management
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ThreadManager } from './ThreadManager';
import type { Thread, Message, MergeRequest } from '../chat/types';

export interface UseThreadManagerResult {
  threads: Thread[];
  activeThread: Thread | null;
  setActiveThread: (thread: Thread) => void;
  addMessage: (message: Message) => void;
  branchThread: (messageIndex: number) => Thread;
  mergeThread: (request: MergeRequest) => void;
  createThread: (name?: string) => Thread;
  deleteThread: (threadId: string) => void;
}

export function useThreadManager(workspaceId?: string): UseThreadManagerResult {
  const wsId = workspaceId || 'default';
  const manager = useMemo(() => ThreadManager.getInstance(wsId), [wsId]);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThreadState] = useState<Thread | null>(null);

  // Load threads on mount
  useEffect(() => {
    manager.load().then(() => {
      setThreads(manager.getAll());
      setActiveThreadState(manager.getActive());
    });
  }, [manager]);

  // Refresh local state from manager
  const refreshState = useCallback(() => {
    setThreads(manager.getAll());
    setActiveThreadState(manager.getActive());
  }, [manager]);

  const setActiveThread = useCallback(
    (thread: Thread) => {
      manager.setActive(thread.id);
      setActiveThreadState(thread);
    },
    [manager]
  );

  const addMessage = useCallback(
    (message: Message) => {
      manager.addMessage(message);
      refreshState();
      manager.persist();
    },
    [manager, refreshState]
  );

  const branchThread = useCallback(
    (messageIndex: number): Thread => {
      const newThread = manager.branch(messageIndex);
      refreshState();
      manager.persist();
      return newThread;
    },
    [manager, refreshState]
  );

  const mergeThread = useCallback(
    (request: MergeRequest) => {
      manager.merge(request);
      refreshState();
      manager.persist();
    },
    [manager, refreshState]
  );

  const createThread = useCallback(
    (name?: string): Thread => {
      const thread = manager.create(name);
      refreshState();
      manager.persist();
      return thread;
    },
    [manager, refreshState]
  );

  const deleteThread = useCallback(
    (threadId: string) => {
      manager.delete(threadId);
      refreshState();
      manager.persist();
    },
    [manager, refreshState]
  );

  return {
    threads,
    activeThread,
    setActiveThread,
    addMessage,
    branchThread,
    mergeThread,
    createThread,
    deleteThread,
  };
}

export default useThreadManager;

