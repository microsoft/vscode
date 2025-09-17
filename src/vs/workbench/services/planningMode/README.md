# Planning Zen Mode

Planning Zen Mode is a specialized mode in VS Code designed for research, analysis, and planning phases of software development. It restricts file editing operations while preserving full access to MCP (Model Context Protocol) tools, creating a focused environment for investigation and delegation preparation.

## Features

### 🔒 File Editing Restrictions
- **Complete file editing lockdown** - No saves, creates, writes, or deletes
- **Read-only editor enforcement** - All editors become read-only with clear messaging
- **MCP tools remain fully functional** - Research and analysis tools work normally
- **Visual indicators** - Clear UI feedback showing restricted state

### 📝 Conversation Tracking
- **Comprehensive logging** - Tracks all user inputs, AI responses, and tool calls
- **Metadata capture** - Records tool parameters, results, and error states
- **Session persistence** - Conversation history survives VS Code restarts
- **Structured storage** - Organized by timestamp and interaction type

### 📊 Perfect Delegation
- **Intelligent summarization** - Generates concise but complete summaries
- **Key findings extraction** - Automatically identifies important discoveries
- **Tool usage analysis** - Lists all tools used and their purposes
- **Actionable recommendations** - Provides next-step suggestions
- **Export capabilities** - Markdown and JSON export formats

### 🎛️ Rich User Experience
- **Status bar integration** - Prominent visual indicator when active
- **Keyboard shortcuts** - `Ctrl+Shift+P` to toggle mode
- **Command palette** - Full integration with VS Code commands
- **Contextual menus** - Available in View menu and appearance settings
- **Configuration options** - Extensive customization available

## Usage

### Activating Planning Mode

1. **Command Palette**: `Ctrl+Shift+P` → "Toggle Planning Mode"
2. **Keyboard Shortcut**: `Ctrl+Shift+P` (customizable)
3. **View Menu**: View → Appearance → Planning Mode
4. **Status Bar**: Click the status bar indicator when active

### Working in Planning Mode

- **Use MCP tools freely** for research and analysis
- **Ask questions** about the codebase, architecture, or requirements
- **Explore and investigate** without fear of accidental changes
- **Document findings** through conversation
- **Plan implementation** strategies and approaches

### Exporting Results

1. **Export Conversation**: Command Palette → "Export Planning Conversation"
2. **Clear History**: Command Palette → "Clear Planning Conversation"
3. **Generated Summary**: Includes timeline, tools used, findings, and recommendations

## Example Workflow

```markdown
# Planning Session Example

1. **Activate Planning Mode**
   - `Ctrl+Shift+P` → Toggle Planning Mode
   - Status bar shows "Planning Mode" indicator

2. **Research Phase**
   - Use file search tools to understand codebase structure
   - Analyze dependencies and architecture
   - Identify potential integration points

3. **Analysis Phase**
   - Use debugging tools to understand current behavior
   - Examine error logs and performance metrics
   - Document findings in conversation

4. **Planning Phase**
   - Discuss implementation approaches
   - Identify required changes and their scope
   - Plan testing strategies

5. **Export for Delegation**
   - Export conversation summary
   - Handoff to coding agent with complete context
   - Deactivate Planning Mode to begin implementation
```

## Configuration

### Available Settings

```json
{
  "planningMode.enabled": true,
  "planningMode.autoRestrictEditing": true,
  "planningMode.showStatusBar": true,
  "planningMode.conversationTracking": true,
  "planningMode.notificationLevel": "info",
  "planningMode.exportFormat": "markdown"
}
```

### Setting Descriptions

- **enabled**: Enable/disable Planning Mode functionality
- **autoRestrictEditing**: Automatically restrict file editing when activated
- **showStatusBar**: Show status bar indicator when mode is active
- **conversationTracking**: Enable conversation logging for delegation
- **notificationLevel**: Control notification verbosity (none/info/warning/error)
- **exportFormat**: Default export format (markdown/json)

## Architecture

### Core Components

- **PlanningModeService**: Central service managing state and conversation
- **PlanningModeEditorController**: Manages editor read-only enforcement
- **PlanningModeStatusBarController**: Status bar integration and feedback
- **PlanningModeContextKeyController**: Context keys for command enablement
- **PlanningModeAwareTextFileService**: File operation interception

### Integration Points

- **TextFile Service**: Intercepts file write operations
- **Editor Service**: Enforces read-only state on all editors
- **MCP Integration**: Maintains full tool functionality
- **Command System**: Provides toggle and export commands
- **Configuration System**: Extensive customization options

## Benefits

### For Planning and Analysis
- **Focused environment** free from accidental edits
- **Complete tool access** for thorough investigation
- **Structured documentation** of research process
- **Clear separation** between planning and implementation

### For AI-Assisted Development
- **Perfect delegation context** with complete conversation history
- **Structured handoff** between planning and coding phases
- **Reduced context switching** between analysis and implementation
- **Improved collaboration** between human and AI developers

### For Team Workflows
- **Reproducible planning sessions** with full conversation exports
- **Knowledge sharing** through detailed session summaries
- **Audit trails** of decision-making processes
- **Structured handoffs** between team members

## Implementation Details

The Planning Mode implementation follows VS Code's architectural patterns:

- **Service-based architecture** with dependency injection
- **Event-driven updates** for UI synchronization
- **Layered interception** at file service and editor levels
- **Context key integration** for command enablement
- **Configuration schema** for user customization

The feature is designed to be:
- **Non-intrusive** when disabled
- **Performant** with minimal overhead
- **Extensible** for future enhancements
- **Testable** with comprehensive test coverage

## Future Enhancements

- **Integration with specific MCP servers** for automatic conversation logging
- **Advanced summarization** with LLM-powered insights
- **Template systems** for common planning workflows
- **Collaboration features** for team planning sessions
- **Integration with project management** tools and workflows
