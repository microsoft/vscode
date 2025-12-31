/**
 * AriaToolRegistry - Central registry for all tools available to Aria agents
 *
 * This bridges VS Code services to tool implementations that agents can invoke.
 * Tools are organized by category and respect mode-based permissions.
 * Integrates with AriaTelemetry for usage tracking.
 */

import { EventEmitter } from 'events';
import type { AriaModeId } from '../modes/types';
import { ModeRegistry } from '../modes/ModeRegistry';
import { ariaTelemetry } from '../telemetry';

/**
 * Tool input parameter definition
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: any;
  enum?: string[];
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  /** Unique tool identifier */
  id: string;

  /** Display name */
  displayName: string;

  /** Description shown to the model */
  modelDescription: string;

  /** Description shown to the user */
  userDescription?: string;

  /** Tool category for organization */
  category: ToolCategory;

  /** Input parameters */
  parameters: ToolParameter[];

  /** Whether the tool can modify state */
  isReadOnly: boolean;

  /** Whether the tool requires confirmation */
  requiresConfirmation: boolean;

  /** Icon for display */
  icon?: string;

  /** Tags for filtering */
  tags?: string[];
}

/**
 * Tool categories
 */
export type ToolCategory =
  | 'file'
  | 'terminal'
  | 'git'
  | 'debug'
  | 'search'
  | 'diagnostics'
  | 'editor'
  | 'workspace'
  | 'web'
  | 'system';

/**
 * Tool invocation context
 */
export interface ToolInvocationContext {
  /** Current mode */
  mode: AriaModeId;

  /** Session ID */
  sessionId: string;

  /** Workspace path */
  workspacePath: string;

  /** Current file */
  currentFile?: string;

  /** Selection context */
  selection?: {
    file: string;
    startLine: number;
    endLine: number;
    content: string;
  };
}

/**
 * Tool invocation result
 */
export interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean;

  /** Result content */
  content: string | object;

  /** Error message if failed */
  error?: string;

  /** Artifacts produced (files, etc.) */
  artifacts?: ToolArtifact[];

  /** Execution time in ms */
  executionTimeMs: number;

  /** Whether user confirmation was required */
  wasConfirmed?: boolean;
}

/**
 * Artifact produced by a tool
 */
export interface ToolArtifact {
  type: 'file' | 'diff' | 'terminal_output' | 'diagnostic';
  path?: string;
  content?: string;
  metadata?: Record<string, any>;
}

/**
 * Tool implementation interface
 */
export interface ToolImplementation {
  /** Execute the tool */
  execute(
    params: Record<string, any>,
    context: ToolInvocationContext
  ): Promise<ToolResult>;

  /** Optional: Prepare tool invocation (for confirmation) */
  prepare?(
    params: Record<string, any>,
    context: ToolInvocationContext
  ): Promise<{
    shouldProceed: boolean;
    message?: string;
    modifiedParams?: Record<string, any>;
  }>;

  /** Optional: Validate parameters */
  validate?(params: Record<string, any>): { valid: boolean; error?: string };
}

/**
 * AriaToolRegistry manages all tools available to agents
 */
export class AriaToolRegistry extends EventEmitter {
  private static instance: AriaToolRegistry;
  private tools: Map<string, ToolDefinition> = new Map();
  private implementations: Map<string, ToolImplementation> = new Map();
  private modeRegistry: ModeRegistry;

  private constructor() {
    super();
    this.modeRegistry = ModeRegistry.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AriaToolRegistry {
    if (!AriaToolRegistry.instance) {
      AriaToolRegistry.instance = new AriaToolRegistry();
    }
    return AriaToolRegistry.instance;
  }

  /**
   * Register a tool
   */
  registerTool(definition: ToolDefinition, implementation: ToolImplementation): void {
    if (this.tools.has(definition.id)) {
      console.warn(`Tool already registered: ${definition.id}`);
    }
    this.tools.set(definition.id, definition);
    this.implementations.set(definition.id, implementation);
    this.emit('toolRegistered', definition);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolId: string): void {
    this.tools.delete(toolId);
    this.implementations.delete(toolId);
    this.emit('toolUnregistered', toolId);
  }

  /**
   * Get a tool definition
   */
  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAllTools().filter((t) => t.category === category);
  }

  /**
   * Get tools available in the current mode
   */
  getAvailableTools(mode?: AriaModeId): ToolDefinition[] {
    const currentMode = mode || this.modeRegistry.getState().currentMode;
    return this.getAllTools().filter((tool) =>
      this.modeRegistry.isToolAllowed(tool.id)
    );
  }

  /**
   * Check if a tool is available in the current mode
   */
  isToolAvailable(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) return false;
    return this.modeRegistry.isToolAllowed(toolId);
  }

  /**
   * Invoke a tool
   */
  async invokeTool(
    toolId: string,
    params: Record<string, any>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    // Check if tool exists
    const definition = this.tools.get(toolId);
    if (!definition) {
      return {
        success: false,
        content: '',
        error: `Tool not found: ${toolId}`,
        executionTimeMs: performance.now() - startTime,
      };
    }

    // Check mode permission
    if (!this.modeRegistry.isToolAllowed(toolId)) {
      return {
        success: false,
        content: '',
        error: `Tool not allowed in current mode: ${toolId}`,
        executionTimeMs: performance.now() - startTime,
      };
    }

    const implementation = this.implementations.get(toolId);
    if (!implementation) {
      return {
        success: false,
        content: '',
        error: `Tool implementation not found: ${toolId}`,
        executionTimeMs: performance.now() - startTime,
      };
    }

    // Validate parameters
    if (implementation.validate) {
      const validation = implementation.validate(params);
      if (!validation.valid) {
        return {
          success: false,
          content: '',
          error: `Invalid parameters: ${validation.error}`,
          executionTimeMs: performance.now() - startTime,
        };
      }
    }

    // Prepare/confirm if needed
    let wasConfirmed = false;
    if (implementation.prepare) {
      const preparation = await implementation.prepare(params, context);
      if (!preparation.shouldProceed) {
        return {
          success: false,
          content: '',
          error: preparation.message || 'Tool invocation cancelled',
          executionTimeMs: performance.now() - startTime,
          wasConfirmed: false,
        };
      }
      if (preparation.modifiedParams) {
        params = preparation.modifiedParams;
      }
      wasConfirmed = true;
    }

    try {
      // Execute the tool
      const result = await implementation.execute(params, context);
      result.executionTimeMs = performance.now() - startTime;
      result.wasConfirmed = wasConfirmed;

      // Track successful invocation in telemetry
      try {
        ariaTelemetry.trackToolInvocation(
          toolId,
          definition.category,
          context.mode,
          result.success,
          result.executionTimeMs,
          {
            requiredConfirmation: definition.requiresConfirmation,
            userApproved: wasConfirmed,
          }
        );
      } catch (telemetryError) {
        // Telemetry should never break functionality
        console.warn('[AriaToolRegistry] Telemetry tracking failed:', telemetryError);
      }

      this.emit('toolInvoked', {
        toolId,
        params,
        context,
        result,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const executionTimeMs = performance.now() - startTime;

      // Track failed invocation in telemetry
      try {
        ariaTelemetry.trackToolInvocation(
          toolId,
          definition.category,
          context.mode,
          false,
          executionTimeMs,
          {
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
            requiredConfirmation: definition.requiresConfirmation,
          }
        );
      } catch (telemetryError) {
        console.warn('[AriaToolRegistry] Telemetry tracking failed:', telemetryError);
      }

      return {
        success: false,
        content: '',
        error: `Tool execution failed: ${errorMessage}`,
        executionTimeMs,
      };
    }
  }

  /**
   * Generate tool descriptions for model prompt
   */
  generateToolDescriptions(mode?: AriaModeId): string {
    const tools = this.getAvailableTools(mode);
    const lines: string[] = ['# Available Tools\n'];

    // Group by category
    const byCategory = new Map<ToolCategory, ToolDefinition[]>();
    for (const tool of tools) {
      const category = byCategory.get(tool.category) || [];
      category.push(tool);
      byCategory.set(tool.category, category);
    }

    for (const [category, categoryTools] of byCategory) {
      lines.push(`\n## ${category.charAt(0).toUpperCase() + category.slice(1)} Tools\n`);

      for (const tool of categoryTools) {
        lines.push(`### ${tool.id}`);
        lines.push(tool.modelDescription);
        lines.push('\nParameters:');
        for (const param of tool.parameters) {
          const required = param.required ? '(required)' : '(optional)';
          lines.push(`- \`${param.name}\`: ${param.type} ${required} - ${param.description}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON schema for tools (for function calling)
   */
  generateToolSchemas(mode?: AriaModeId): object[] {
    const tools = this.getAvailableTools(mode);

    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.id,
        description: tool.modelDescription,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.parameters.map((p) => [
              p.name,
              {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
                ...(p.default !== undefined ? { default: p.default } : {}),
              },
            ])
          ),
          required: tool.parameters.filter((p) => p.required).map((p) => p.name),
        },
      },
    }));
  }
}

export default AriaToolRegistry;


