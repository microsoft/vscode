/**
 * Aria Tools Module
 *
 * Exports tool registry and all tool implementations.
 */

export {
  AriaToolRegistry,
  type ToolDefinition,
  type ToolParameter,
  type ToolCategory,
  type ToolInvocationContext,
  type ToolResult,
  type ToolArtifact,
  type ToolImplementation,
} from './AriaToolRegistry';

export {
  ToolPermissionService,
  type PermissionDecision,
  type ToolPermissionOverride,
} from './ToolPermissionService';

export { registerAllTools, getToolStats } from './registerAllTools';

// Tool implementations
export * from './terminal';
export * from './git';
export * from './debug';
export * from './file';
export * from './diagnostics';

