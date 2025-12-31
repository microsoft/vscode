/**
 * ToolPermissionService - Manages tool permissions per mode
 *
 * This service integrates with the ModeRegistry to enforce
 * tool access based on the current Aria mode.
 */

import { EventEmitter } from 'events';
import { ModeRegistry } from '../modes/ModeRegistry';
import { AriaToolRegistry, ToolDefinition } from './AriaToolRegistry';
import type { AriaModeId, AriaModeConfig } from '../modes/types';

/**
 * Permission decision result
 */
export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
  alternativeTools?: string[];
}

/**
 * Tool permission override
 */
export interface ToolPermissionOverride {
  toolId: string;
  modeId: AriaModeId;
  allowed: boolean;
  reason?: string;
}

/**
 * ToolPermissionService manages tool access control
 */
export class ToolPermissionService extends EventEmitter {
  private static instance: ToolPermissionService;
  private modeRegistry: ModeRegistry;
  private toolRegistry: AriaToolRegistry;
  private overrides: Map<string, ToolPermissionOverride> = new Map();

  private constructor() {
    super();
    this.modeRegistry = ModeRegistry.getInstance();
    this.toolRegistry = AriaToolRegistry.getInstance();

    // Listen for mode changes to emit permission change events
    this.modeRegistry.on('modeChange', () => {
      this.emit('permissionsChanged');
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ToolPermissionService {
    if (!ToolPermissionService.instance) {
      ToolPermissionService.instance = new ToolPermissionService();
    }
    return ToolPermissionService.instance;
  }

  /**
   * Check if a tool is allowed in the current mode
   */
  checkPermission(toolId: string): PermissionDecision {
    const tool = this.toolRegistry.getTool(toolId);
    if (!tool) {
      return {
        allowed: false,
        reason: `Tool not found: ${toolId}`,
        requiresConfirmation: false,
      };
    }

    const mode = this.modeRegistry.getCurrentMode();
    const modeState = this.modeRegistry.getState();

    // Check for explicit overrides
    const overrideKey = `${toolId}:${modeState.currentMode}`;
    const override = this.overrides.get(overrideKey);
    if (override) {
      return {
        allowed: override.allowed,
        reason: override.reason || `Explicitly ${override.allowed ? 'allowed' : 'denied'} by override`,
        requiresConfirmation: false,
      };
    }

    // Check mode-based permissions
    const modeAllowed = this.checkModePermission(tool, mode);
    if (!modeAllowed.allowed) {
      return modeAllowed;
    }

    // Check if confirmation is required
    const requiresConfirmation = this.checkConfirmationRequired(tool, mode);

    return {
      allowed: true,
      reason: 'Tool is allowed in current mode',
      requiresConfirmation,
      alternativeTools: this.getSuggestedAlternatives(toolId, mode),
    };
  }

  /**
   * Check if a tool is allowed based on mode configuration
   */
  private checkModePermission(
    tool: ToolDefinition,
    mode: AriaModeConfig
  ): PermissionDecision {
    switch (mode.toolPermission) {
      case 'full':
        return {
          allowed: true,
          reason: 'Full tool access in this mode',
          requiresConfirmation: false,
        };

      case 'none':
        return {
          allowed: false,
          reason: `No tool access in ${mode.displayName} mode`,
          requiresConfirmation: false,
        };

      case 'read-only':
        if (!tool.isReadOnly) {
          return {
            allowed: false,
            reason: `Only read-only tools allowed in ${mode.displayName} mode`,
            requiresConfirmation: false,
            alternativeTools: this.getReadOnlyAlternatives(tool.id),
          };
        }
        return {
          allowed: true,
          reason: 'Read-only tool allowed',
          requiresConfirmation: false,
        };

      case 'custom':
        // Check denied list first
        if (mode.deniedTools?.includes(tool.id)) {
          return {
            allowed: false,
            reason: `Tool explicitly denied in ${mode.displayName} mode`,
            requiresConfirmation: false,
          };
        }

        // Check allowed list
        if (mode.allowedTools) {
          if (!mode.allowedTools.includes(tool.id)) {
            return {
              allowed: false,
              reason: `Tool not in allowed list for ${mode.displayName} mode`,
              requiresConfirmation: false,
            };
          }
        }

        return {
          allowed: true,
          reason: 'Tool allowed by custom permission',
          requiresConfirmation: false,
        };

      default:
        return {
          allowed: false,
          reason: 'Unknown permission level',
          requiresConfirmation: false,
        };
    }
  }

  /**
   * Check if confirmation is required for a tool
   */
  private checkConfirmationRequired(
    tool: ToolDefinition,
    mode: AriaModeConfig
  ): boolean {
    // Mode-level confirmation requirement
    if (mode.requiresConfirmation) {
      return true;
    }

    // Tool-level confirmation requirement
    if (tool.requiresConfirmation) {
      return true;
    }

    // Non-read-only tools in certain modes
    if (!tool.isReadOnly && (mode.id === 'debug' || mode.id === 'code-review')) {
      return true;
    }

    return false;
  }

  /**
   * Get suggested alternative tools
   */
  private getSuggestedAlternatives(
    toolId: string,
    mode: AriaModeConfig
  ): string[] | undefined {
    // Map tools to their read-only alternatives
    const alternatives: Record<string, string[]> = {
      write_file: ['read_file'],
      create_file: ['list_dir'],
      delete_file: ['list_dir', 'read_file'],
      run_terminal: ['get_terminal_output'],
      git_commit: ['git_status', 'git_diff'],
      git_push: ['git_status'],
      git_stage: ['git_diff'],
      debug_start: ['get_breakpoints'],
      debug_set_breakpoint: ['get_breakpoints'],
    };

    return alternatives[toolId];
  }

  /**
   * Get read-only alternatives for a tool
   */
  private getReadOnlyAlternatives(toolId: string): string[] {
    const allTools = this.toolRegistry.getAllTools();
    const readOnlyTools = allTools
      .filter((t) => t.isReadOnly && t.category === this.toolRegistry.getTool(toolId)?.category)
      .map((t) => t.id);
    return readOnlyTools.slice(0, 3);
  }

  /**
   * Add a permission override
   */
  addOverride(override: ToolPermissionOverride): void {
    const key = `${override.toolId}:${override.modeId}`;
    this.overrides.set(key, override);
    this.emit('overrideAdded', override);
  }

  /**
   * Remove a permission override
   */
  removeOverride(toolId: string, modeId: AriaModeId): void {
    const key = `${toolId}:${modeId}`;
    this.overrides.delete(key);
    this.emit('overrideRemoved', { toolId, modeId });
  }

  /**
   * Get all allowed tools for the current mode
   */
  getAllowedTools(): ToolDefinition[] {
    const allTools = this.toolRegistry.getAllTools();
    return allTools.filter((tool) => this.checkPermission(tool.id).allowed);
  }

  /**
   * Get all denied tools for the current mode
   */
  getDeniedTools(): ToolDefinition[] {
    const allTools = this.toolRegistry.getAllTools();
    return allTools.filter((tool) => !this.checkPermission(tool.id).allowed);
  }

  /**
   * Get permission summary for current mode
   */
  getPermissionSummary(): {
    mode: AriaModeId;
    allowed: number;
    denied: number;
    requiresConfirmation: number;
    byCategory: Record<string, { allowed: number; denied: number }>;
  } {
    const mode = this.modeRegistry.getState().currentMode;
    const allTools = this.toolRegistry.getAllTools();

    let allowed = 0;
    let denied = 0;
    let requiresConfirmation = 0;
    const byCategory: Record<string, { allowed: number; denied: number }> = {};

    for (const tool of allTools) {
      const decision = this.checkPermission(tool.id);

      if (!byCategory[tool.category]) {
        byCategory[tool.category] = { allowed: 0, denied: 0 };
      }

      if (decision.allowed) {
        allowed++;
        byCategory[tool.category].allowed++;
        if (decision.requiresConfirmation) {
          requiresConfirmation++;
        }
      } else {
        denied++;
        byCategory[tool.category].denied++;
      }
    }

    return {
      mode,
      allowed,
      denied,
      requiresConfirmation,
      byCategory,
    };
  }
}

export default ToolPermissionService;


