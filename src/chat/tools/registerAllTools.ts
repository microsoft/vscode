/**
 * Register All Tools - Initialize all tool implementations
 *
 * This module registers all available tools with the AriaToolRegistry.
 */

import { AriaToolRegistry } from './AriaToolRegistry';
import { registerTerminalTools } from './terminal';
import { registerGitTools } from './git';
import { registerDebugTools } from './debug';
import { registerFileTools } from './file';
import { registerDiagnosticsTools } from './diagnostics';
import { registerResearchTools } from './research';
import { registerWorkspaceTools } from './workspace';

/**
 * Register all built-in tools with the registry
 */
export function registerAllTools(registry?: AriaToolRegistry): AriaToolRegistry {
  const toolRegistry = registry || AriaToolRegistry.getInstance();

  // Register tools by category
  registerTerminalTools(toolRegistry);
  registerGitTools(toolRegistry);
  registerDebugTools(toolRegistry);
  registerFileTools(toolRegistry);
  registerDiagnosticsTools(toolRegistry);
  registerResearchTools(toolRegistry);
  registerWorkspaceTools(toolRegistry);

  console.log(`[AriaToolRegistry] Registered ${toolRegistry.getAllTools().length} tools`);

  return toolRegistry;
}

/**
 * Get tool count by category
 */
export function getToolStats(): Record<string, number> {
  const registry = AriaToolRegistry.getInstance();
  const tools = registry.getAllTools();

  const stats: Record<string, number> = {};
  for (const tool of tools) {
    stats[tool.category] = (stats[tool.category] || 0) + 1;
  }

  return stats;
}

export default registerAllTools;
