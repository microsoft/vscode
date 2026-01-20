# AgentsQuickChat Specification

## Overview

AgentsQuickChat is a unified quick-access overlay that serves as the primary entry point for agent interactions. It appears when clicking the AgentsControl pill in the mission control area, providing:

1. **Natural language input** to start new agent chat sessions
2. **Hybrid input** that transforms in-place to show Quick Access providers (commands, files, symbols) when special prefixes are typed
3. **Recent sessions list** showing ongoing and completed agent sessions

## Visual Design

```
┌──────────────────────────────────────────────────────────────────┐
│  ← →   [ Ask anything or describe what to build next  🎤 ▷ ]  ✕ │  <- Header
├──────────────────────────────────────────────────────────────────┤
│  Local ∨    Agent ∨                              GPT 5.2 ∨       │  <- Model Picker Row
├──────────────────────────────────────────────────────────────────┤
│  RECENT SESSIONS                                                 │  <- Section Header
│  ◐ Add tests to new code                      Cloud • 5 min     │
│  ● Refining preview layout and icons   2 Files +150 -10 • 1 hr  │
│  ○ Replace placeholder text            🔀 #27774 • Cloud • 1 day│
│                                                                  │
│                         Show More                                │  <- Footer
└──────────────────────────────────────────────────────────────────┘
```

When user types `>` (or other Quick Access prefix):

```
┌──────────────────────────────────────────────────────────────────┐
│  ← →   [ >                                                ]  ✕  │  <- Same header
├──────────────────────────────────────────────────────────────────┤
│  Add Browser Breakpoint                                     ⚙   │  <- Quick Access picks
│  Add Function Breakpoint                                        │
│  Calls: Show Call Hierarchy                            ⇧ ⌥ K    │
│  Calls: Show Incoming Calls                                     │
│  ...                                                            │
└──────────────────────────────────────────────────────────────────┘
```

## Architecture

### Files

| File | Purpose |
|------|---------|
| `agentsQuickChatService.ts` | Service interface and implementation for managing overlay lifecycle |
| `agentsQuickChat.ts` | Main overlay component, renders header, model picker, and content area |
| `agentsQuickChatInput.ts` | Hybrid input controller with prefix detection and mode switching |
| `media/agentsQuickChat.css` | Styling for all AgentsQuickChat components |

### Service Interface

```typescript
interface IAgentsQuickChatService {
	readonly _serviceBrand: undefined;

	/** Whether the quick chat overlay is currently visible */
	readonly isVisible: boolean;

	/** Fires when visibility changes */
	readonly onDidChangeVisibility: Event<boolean>;

	/** Open the quick chat overlay */
	open(options?: IAgentsQuickChatOpenOptions): void;

	/** Close the quick chat overlay */
	close(): void;

	/** Toggle the quick chat overlay */
	toggle(): void;

	/** Focus the input box (if already open) */
	focus(): void;
}

interface IAgentsQuickChatOpenOptions {
	/** Initial value for the input box */
	query?: string;
	/** Whether to preserve existing input value */
	preserveValue?: boolean;
}
```

### Component Hierarchy

```
AgentsQuickChat (main container)
├── Header
│   ├── NavigationButtons (← →) - disabled initially
│   ├── AgentsQuickChatInput (hybrid input box)
│   │   ├── Input element
│   │   ├── Microphone button
│   │   └── Submit button
│   └── CloseButton (✕)
├── ModelPickerRow
│   ├── LocationPicker ("Local ∨")
│   ├── ModePicker ("Agent ∨")
│   └── ModelPicker ("GPT 5.2 ∨")
└── ContentArea (swappable)
    ├── SessionsMode (default)
    │   ├── AgentSessionsControl (reused)
    │   └── ShowMoreFooter
    └── QuickAccessMode (when prefix detected)
        └── QuickAccessList (picks from provider)
```

## Behavior

### Input Handling

1. **Default mode (no prefix)**: Input accepts natural language
   - Typing filters the sessions list in real-time (deferred - see Future Work)
   - Pressing Enter creates a new agent session with the query
   - New session appears at top of "Recent Sessions" list
   - Widget stays open, input clears

2. **Quick Access mode (prefix detected)**: Input delegates to Quick Access providers
   - Typing `>` switches to Commands provider
   - Typing `@` switches to Symbols provider  
   - Typing `#` switches to Workspace Symbols provider
   - Typing `%` switches to Text Search provider
   - Content area shows Quick Access picks instead of sessions
   - Selecting a pick executes it, widget closes
   - Clearing prefix switches back to Sessions mode

### Prefix Detection

The hybrid input monitors value changes and detects prefixes registered in `IQuickAccessRegistry`:

```typescript
// Pseudo-code for prefix detection
onInputChange(value: string) {
	const provider = quickAccessRegistry.getQuickAccessProvider(value);
	if (provider && provider.prefix !== '') {
		// Switch to Quick Access mode
		this.showQuickAccessMode(provider, value);
	} else {
		// Switch back to Sessions mode
		this.showSessionsMode();
	}
}
```

### Session Creation

When Enter is pressed with plain text (no Quick Access prefix):

1. Get current model selection from ModelPickerRow
2. Call agent session creation API with query and model
3. Clear input box
4. New session appears at top of Recent Sessions list
5. Widget remains open for further interactions

### Navigation

- **Escape**: Close the widget
- **Arrow Down**: Focus first item in list (sessions or Quick Access picks)
- **Arrow Up/Down**: Navigate list items
- **Enter**: Execute selected item or submit query
- **Tab**: Cycle through interactive elements

## Integration Points

### AgentStatusWidget

Modify `_handlePillClick()` in `agentStatusWidget.ts`:

```typescript
private _handlePillClick(): void {
	if (this._displayedSession) {
		// Open the specific session
		this.instantiationService.invokeFunction(openSession, this._displayedSession);
	} else {
		// Open AgentsQuickChat instead of regular quick chat
		this.agentsQuickChatService.toggle();
	}
}
```

### Registration

In `agentSessions.contribution.ts`:

```typescript
// Register the service
registerSingleton(IAgentsQuickChatService, AgentsQuickChatService, InstantiationType.Delayed);

// Register toggle command
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.toggleQuickChat',
			title: localize('toggleAgentsQuickChat', "Toggle Agents Quick Chat"),
			f1: true,
			keybinding: { /* TBD */ }
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IAgentsQuickChatService).toggle();
	}
});
```

## Future Work

1. **Session filtering**: Filter sessions list as user types (before prefix detection)
2. **Back/forward navigation**: History of previous searches/states within widget
3. **Voice input**: Microphone button functionality
4. **Model persistence**: Remember last selected model across sessions
5. **Keyboard shortcuts**: Configurable keybinding for toggle action

## Dependencies

- `IQuickInputService` - For creating the overlay widget
- `IQuickAccessRegistry` - For prefix detection and provider lookup
- `IInstantiationService` - For creating child components
- `IAgentSessionsService` - For session creation and listing
- `IContextKeyService` - For scoped context keys
- `ICommandService` - For executing Quick Access picks
