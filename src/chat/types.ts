/**
 * Type definitions for Logos multi-agent chat system
 */

/**
 * A single message in a conversation
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentId?: string;
  tierUsed?: number;
  mentions?: AgentMention[];
  codeBlocks?: CodeBlock[];
  isError?: boolean;
}

/**
 * An @agent mention in user input
 */
export interface AgentMention {
  agentId: string;
  agentName: string;
  startIndex: number;
  endIndex: number;
}

/**
 * A code block extracted from agent response
 */
export interface CodeBlock {
  id: string;
  code: string;
  language: string;
  filename?: string;
  startLine?: number;
  endLine?: number;
}

/**
 * A conversation thread
 */
export interface Thread {
  id: string;
  name?: string;
  parentId?: string;
  branchPoint?: number;
  messages: Message[];
  agents: string[];
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
}

/**
 * Context shared across a conversation
 */
export interface ConversationContext {
  openFiles: FileContext[];
  selection?: SelectionContext;
  symbols: SymbolContext[];
  previousResponses: Message[];
  projectModel?: ProjectModel;
  workspaceId: string;
}

/**
 * File context for an open file
 */
export interface FileContext {
  path: string;
  language: string;
  content?: string;
  lineCount: number;
  isActive: boolean;
}

/**
 * Selected code context
 */
export interface SelectionContext {
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  content: string;
}

/**
 * Symbol context (functions, classes, etc.)
 */
export interface SymbolContext {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'variable' | 'type';
  file: string;
  line: number;
  references: number;
}

/**
 * Project model from Workspace CA
 */
export interface ProjectModel {
  name: string;
  description?: string;
  frameworks: string[];
  languages: string[];
  entryPoints: string[];
  conventions: Convention[];
}

/**
 * A learned project convention
 */
export interface Convention {
  id: string;
  type: 'naming' | 'structure' | 'style' | 'pattern';
  description: string;
  examples: string[];
}

/**
 * Agent persona definition
 */
export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultTier: number;
  maxTier: number;
  moePreferences: Record<string, number>;
  toolPermissions: string[];
}

/**
 * Response from invoking an agent
 */
export interface AgentResponse {
  content: string;
  tierUsed: number;
  codeBlocks: CodeBlock[];
  handoffTo?: string;
  suggestions?: string[];
  latencyMs: number;
}

/**
 * Branch point for creating a tangent thread
 */
export interface BranchPoint {
  threadId: string;
  messageIndex: number;
  reason?: string;
}

/**
 * Thread merge request
 */
export interface MergeRequest {
  sourceThreadId: string;
  targetThreadId: string;
  selectedMessages: number[];
}


