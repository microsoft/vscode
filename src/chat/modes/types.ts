/**
 * Aria Mode Type System
 *
 * Defines the various modes Aria can operate in, similar to Cursor's
 * Agent/Plan/Debug/Ask modes. Each mode changes how Aria processes
 * requests and which tools are available.
 */

/**
 * Core mode identifiers
 */
export type AriaModeId =
  | 'agent'
  | 'plan'
  | 'debug'
  | 'ask'
  | 'research'
  | 'code-review';

/**
 * Tool permission level for a mode
 */
export type ToolPermissionLevel =
  | 'full'      // All tools available
  | 'read-only' // Only read operations
  | 'none'      // No tool access
  | 'custom';   // Custom subset defined in allowedTools

/**
 * Mode configuration defining behavior and capabilities
 */
export interface AriaModeConfig {
  /** Unique identifier for the mode */
  id: AriaModeId;

  /** Display name shown in the UI */
  displayName: string;

  /** Short description of the mode */
  description: string;

  /** Icon for the mode (emoji or Codicon) */
  icon: string;

  /** Keyboard shortcut (optional) */
  shortcut?: string;

  /** Color theme for the mode indicator */
  color: string;

  /** Tool permission level */
  toolPermission: ToolPermissionLevel;

  /** Specific tools allowed (when toolPermission is 'custom') */
  allowedTools?: string[];

  /** Specific tools denied (applied after allowedTools) */
  deniedTools?: string[];

  /** Whether the mode can make file changes */
  canModifyFiles: boolean;

  /** Whether the mode can execute terminal commands */
  canExecuteTerminal: boolean;

  /** Whether the mode can make git operations */
  canModifyGit: boolean;

  /** Whether the mode requires confirmation for actions */
  requiresConfirmation: boolean;

  /** System prompt modifier for this mode */
  systemPromptAddition: string;

  /** Default agent to use in this mode */
  defaultAgentId?: string;

  /** Whether plans should be auto-created in this mode */
  createsPlan: boolean;

  /** Maximum tokens for responses in this mode */
  maxResponseTokens?: number;
}

/**
 * Runtime state for the current mode
 */
export interface AriaModeState {
  /** Currently active mode */
  currentMode: AriaModeId;

  /** Previous mode (for mode switching history) */
  previousMode?: AriaModeId;

  /** Timestamp when mode was activated */
  activatedAt: number;

  /** Active plan ID if in plan mode */
  activePlanId?: string;

  /** Whether mode was auto-switched */
  wasAutoSwitched: boolean;

  /** Context that triggered the mode (if auto-switched) */
  switchContext?: string;
}

/**
 * Event emitted when mode changes
 */
export interface ModeChangeEvent {
  previousMode: AriaModeId;
  newMode: AriaModeId;
  timestamp: number;
  reason: 'user' | 'auto' | 'system';
}

/**
 * Plan item status
 */
export type PlanItemStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'blocked';

/**
 * A single item in a plan
 */
export interface PlanItem {
  /** Unique identifier */
  id: string;

  /** The task description */
  content: string;

  /** Current status */
  status: PlanItemStatus;

  /** Optional parent item for sub-tasks */
  parentId?: string;

  /** Order within the plan or parent */
  order: number;

  /** Files this item relates to */
  relatedFiles?: string[];

  /** Estimated complexity (1-5) */
  complexity?: number;

  /** Notes or context */
  notes?: string;

  /** Timestamp when created */
  createdAt: number;

  /** Timestamp when last modified */
  updatedAt: number;

  /** Timestamp when completed */
  completedAt?: number;
}

/**
 * A complete plan document
 */
export interface Plan {
  /** Unique identifier */
  id: string;

  /** Plan name/title */
  name: string;

  /** Overview description */
  overview: string;

  /** All items in the plan */
  items: PlanItem[];

  /** Associated chat session ID */
  sessionId?: string;

  /** File path if persisted */
  filePath?: string;

  /** Timestamp when created */
  createdAt: number;

  /** Timestamp when last modified */
  updatedAt: number;

  /** Whether the plan is complete */
  isComplete: boolean;

  /** Tags for categorization */
  tags?: string[];

  /** The mode that created this plan */
  createdByMode: AriaModeId;
}

/**
 * Plan file format (YAML frontmatter compatible)
 */
export interface PlanFileFormat {
  name: string;
  overview: string;
  todos: Array<{
    id: string;
    content: string;
    status: PlanItemStatus;
  }>;
}


