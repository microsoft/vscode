# Chat Input State Migration to ChatModel

## Initial prompt

There's a bunch of data in the ChatWidget that we want to be associated with the ChatModel so it can be serialized, restored, and transferred efficiently. Some of this is currently manually transferred when we move editors (see #file:chatMoveActions.ts:132-139 ) but if this was on the model it would get moved automatically.

Specifically the data that should be associated are:

- Chat attachments (ChatAttachmentModel)
- The chat mode
- The currently selected model
- The value and selection of the input box

This is currently a bit spread in a lot of places in the ChatWidget, ChatAttachmentsModel, etc. Please research how this data is used. Make a diagram of the current data flow, and come up with an idea for an improved data flow with an improved diagram and a plan for how it could be incrementally shifted.

## Executive Summary

**Goal**: Move chat input state (attachments, mode, selected model, input value/selection) from ChatWidget/ChatInputPart to ChatModel for automatic serialization, restoration, and transfer.

**Current Problem**: Input state is fragmented across multiple components, requiring manual transfer code when moving editors. Selected model and cursor selection aren't serialized at all.

**Solution**: Add `inputState` property to ChatModel as the single source of truth. ChatInputPart becomes a view/controller that mirrors the model via observables.

---

## Current Architecture Analysis

### State Components to Migrate

1. **Chat Attachments** (`ChatAttachmentModel`)
   - **Current Location**: `ChatInputPart._attachmentModel`
   - **Current Flow**:
     - Created per input part instance
     - Serialized to `IChatInputState.chatContextAttachments` in getViewState()
     - Restored via `ChatInputPart.initForNewChatModel()` from `IChatViewState.inputState`
     - Manually transferred when moving editors
     - Snapshot stored in `ChatRequestModel.attachedContext` per request
   - **Files**: `chatAttachmentModel.ts`, `chatInputPart.ts`

2. **Chat Mode**
   - **Current Location**: `ChatInputPart._currentModeObservable`
   - **Current Flow**:
     - Stored as observable in ChatInputPart
     - Serialized to `IChatInputState.chatMode` (ID string only)
     - Also stored globally in storage via `GlobalLastChatModeKey`
     - Restored from state or global storage
     - Snapshot stored in `ChatRequestModel.modeInfo` per request
   - **Files**: `chatInputPart.ts`, `chatModes.ts`

3. **Selected Language Model**
   - **Current Location**: `ChatInputPart._currentLanguageModel`
   - **Current Flow**:
     - Stored in ChatInputPart as `ILanguageModelChatMetadataAndIdentifier`
     - **NOT serialized in view state**
     - Stored globally in storage per location: `chat.currentLanguageModel.{location}`
     - Restored from storage on initialization
     - Snapshot stored in `ChatRequestModel.modelId` per request
   - **Files**: `chatInputPart.ts`

4. **Input Value and Selection**
   - **Current Location**: `ChatInputPart._inputEditor` (CodeEditorWidget)
   - **Current Flow**:
     - Input value stored in editor's text model (`inputModel`)
     - Selection stored in editor widget state
     - Serialized to `IChatViewState.inputValue` (text only, no selection)
     - Restored via `ChatInputPart.setValue()` with cursor at end
     - **Selection state is lost on transfer**
   - **Files**: `chatInputPart.ts`, `chatWidget.ts`

### Current Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          ChatWidget                              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    ChatInputPart                           │  │
│  │                                                            │  │
│  │  _attachmentModel: ChatAttachmentModel                    │  │
│  │    └─> attachments: IChatRequestVariableEntry[]           │  │
│  │                                                            │  │
│  │  _currentModeObservable: IChatMode                        │  │
│  │    └─> { id, kind, label, ... }                           │  │
│  │                                                            │  │
│  │  _currentLanguageModel: ILanguageModelChatMetadataAndId  │  │
│  │    └─> { identifier, metadata }                           │  │
│  │                                                            │  │
│  │  _inputEditor: CodeEditorWidget                           │  │
│  │    └─> inputModel: ITextModel (text)                      │  │
│  │    └─> selection/cursor position                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           ↓                                      │
│                    getViewState()                                │
│                           ↓                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         IChatViewState (transient transfer object)         │  │
│  │  • inputValue: string                                     │  │
│  │  • inputState: IChatInputState {                          │  │
│  │      chatContextAttachments,                              │  │
│  │      chatMode: string                                     │  │
│  │      // MISSING: selectedModel, cursor selection          │  │
│  │    }                                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                   Manual Transfer on Move
                   (chatMoveActions.ts)
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                         ChatModel                                 │
│                                                                   │
│  • sessionResource: URI                                          │
│  • timestamp, title, location                                    │
│  • _requests: ChatRequestModel[]                                 │
│      └─> Each request has snapshot:                              │
│          - attachedContext: IChatRequestVariableEntry[]          │
│          - modeInfo: IChatRequestModeInfo                        │
│          - modelId: string                                       │
│                                                                   │
│  toJSON() → ISerializableChatData                               │
│  • requests: ISerializableChatRequestData[]                      │
│      └─> Includes per-request snapshots above                    │
│  • MISSING: Current draft input state                            │
└──────────────────────────────────────────────────────────────────┘
```

### Key Problems Identified

1. **Fragmented State**: No single source of truth for current input state
2. **Manual Transfer Code**: `chatMoveActions.ts` must manually extract and restore state
3. **Incomplete Serialization**:
   - Selected model not in view state
   - Cursor selection not preserved
4. **Duplication**: Each request stores snapshots, but current draft not in model
5. **Testing Difficulty**: State spread across components
6. **No Draft History**: Can't implement undo/checkpoint for unsent input

---

## Proposed Architecture

### New Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                          ChatWidget                               │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              ChatInputPart (View/Controller)               │   │
│  │                                                            │   │
│  │  _attachmentModel: ChatAttachmentModel (mirrors model)    │   │
│  │      ↕ two-way sync ↕                                      │   │
│  │  _inputEditor: CodeEditorWidget (mirrors model)           │   │
│  │      ↕ two-way sync ↕                                      │   │
│  │                                                            │   │
│  │  Observes: chatModel.inputState (IObservable)             │   │
│  │  Writes: chatModel.setInputState(partial)                 │   │
│  └───────────────────────────────────────────────────────────┘   │
│                           ↕                                       │
│                    Two-way binding                                │
└──────────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────────┐
│                  ChatModel (Source of Truth)                      │
│                                                                   │
│  _inputState: IObservable<IChatModelInputState> {                │
│      attachments: IChatRequestVariableEntry[],                   │
│      mode: IChatMode,                                            │
│      selectedModel: ILanguageModelChatMetadataAndIdentifier?,    │
│      inputText: string,                                          │
│      cursorPosition: IPosition,                                  │
│      selection: IRange | undefined                               │
│  }                                                                │
│                                                                   │
│  _requests: ChatRequestModel[]                                   │
│      └─> Created from inputState snapshot on send                │
│                                                                   │
│  toJSON() → ISerializableChatData {                              │
│      inputState: IChatModelInputState,  ← NEW                    │
│      requests: ISerializableChatRequestData[]                    │
│  }                                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                   Automatic Serialization
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    ISerializableChatData                          │
│                                                                   │
│  • sessionId, timestamp, title, location                         │
│  • inputState: IChatModelInputState  ← NEW                       │
│  • requests: ISerializableChatRequestData[]                      │
└──────────────────────────────────────────────────────────────────┘
```

### New Types and Interfaces

#### IChatModelInputState (NEW)

Add to `src/vs/workbench/contrib/chat/common/chatModel.ts`:

```typescript
/**
 * Represents the current state of the chat input that hasn't been sent yet.
 * This is the "draft" state that should be preserved across sessions.
 */
export interface IChatModelInputState {
    /** Current attachments in the input */
    attachments: IChatRequestVariableEntry[];

    /** Currently selected chat mode */
    mode: {
        /** Mode ID (e.g., 'ask', 'edit', 'agent', or custom mode ID) */
        id: string;
        /** Mode kind for builtin modes */
        kind: ChatModeKind | undefined;
    };

    /** Currently selected language model, if any */
    selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;

    /** Current input text */
    inputText: string;

    /** Cursor position in input */
    cursorPosition: IPosition;

    /** Current selection range, if any */
    selection: IRange | undefined;
}

/**
 * Serializable version of IChatModelInputState
 */
export interface ISerializableChatModelInputState {
    attachments: IChatRequestVariableEntry[];
    mode: {
        id: string;
        kind: ChatModeKind | undefined;
    };
    selectedModel: {
        identifier: string;
        metadata: ILanguageModelChatMetadata;
    } | undefined;
    inputText: string;
    cursorPosition: IPosition;
    selection: IRange | undefined;
}
```

#### Updated ISerializableChatData

```typescript
export interface ISerializableChatData4 extends Omit<ISerializableChatData3, 'version'> {
    version: 4;
    /** Current draft input state */
    inputState?: ISerializableChatModelInputState;
}

export type ISerializableChatData = ISerializableChatData4;
```

#### ChatModel Changes

```typescript
export class ChatModel extends Disposable implements IChatModel {
    // NEW: Observable input state
    private readonly _inputState: ISettableObservable<IChatModelInputState>;

    /** Observable for current input state (draft that hasn't been sent) */
    readonly inputState: IObservable<IChatModelInputState>;

    constructor(/* ... */) {
        super();

        // Initialize with default or restored state
        const initialInputState: IChatModelInputState = {
            attachments: [],
            mode: { id: 'ask', kind: ChatModeKind.Ask },
            selectedModel: undefined,
            inputText: '',
            cursorPosition: { lineNumber: 1, column: 1 },
            selection: undefined
        };

        this._inputState = observableValue('chatModelInputState', initialInputState);
        this.inputState = this._inputState;

        // ... existing initialization
    }

    /**
     * Update the input state (partial update)
     */
    setInputState(state: Partial<IChatModelInputState>): void {
        this._inputState.set({
            ...this._inputState.get(),
            ...state
        }, undefined);
    }

    /**
     * Clear input state (after sending or clearing)
     */
    clearInputState(): void {
        this._inputState.set({
            attachments: [],
            mode: this._inputState.get().mode, // Keep mode
            selectedModel: this._inputState.get().selectedModel, // Keep model
            inputText: '',
            cursorPosition: { lineNumber: 1, column: 1 },
            selection: undefined
        }, undefined);
    }

    override toJSON(): ISerializableChatData {
        const inputState = this._inputState.get();
        return {
            version: 4,
            // ... existing fields
            inputState: {
                attachments: inputState.attachments,
                mode: inputState.mode,
                selectedModel: inputState.selectedModel,
                inputText: inputState.inputText,
                cursorPosition: inputState.cursorPosition,
                selection: inputState.selection
            }
        };
    }
}
```

---

## Migration Plan

### Phase 1: Add State to Model (Non-Breaking)

**Goal**: Add input state infrastructure to ChatModel without changing existing behavior.

**Duration**: 1-2 days

**Files to Modify**:

1. `src/vs/workbench/contrib/chat/common/chatModel.ts`
   - Add `IChatModelInputState` interface
   - Add `ISerializableChatModelInputState` interface
   - Add `ISerializableChatData4` interface
   - Update type alias: `ISerializableChatData = ISerializableChatData4`
   - Add `_inputState` observable to `ChatModel`
   - Add `inputState` readonly getter
   - Add `setInputState()` method
   - Add `clearInputState()` method
   - Update `toJSON()` to include `inputState`
   - Update `normalizeSerializableChatData()` to handle v4

2. `src/vs/workbench/contrib/chat/common/chatServiceImpl.ts`
   - Update deserialization in `_deserialize()` to restore `inputState`
   - Handle missing `inputState` for backward compatibility

**Testing**:
- Create new chat session, verify `inputState` initialized
- Save session, verify `inputState` in JSON
- Load old session (v3), verify backward compatibility
- Load new session (v4), verify `inputState` restored

**Success Criteria**:
- ✅ New sessions have `inputState` property
- ✅ Serialization includes `inputState`
- ✅ Old sessions still load correctly
- ✅ No regressions in existing functionality

---

### Phase 2: Sync ChatInputPart → ChatModel (Write-Only)

**Goal**: Make ChatInputPart write changes to ChatModel's input state.

**Duration**: 2-3 days

**Files to Modify**:

1. `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`

   **Add model reference**:
   ```typescript
   private _chatModel: IChatModel | undefined;

   setChatModel(model: IChatModel | undefined): void {
       this._chatModel = model;
       // Initial sync from model to view happens in Phase 3
   }
   ```

   **Add sync method**:
   ```typescript
   private _syncInputStateToModel(): void {
       if (!this._chatModel) {
           return;
       }

       const mode = this._currentModeObservable.get();
       const cursorPosition = this._inputEditor.getPosition();
       const selection = this._inputEditor.getSelection();

       this._chatModel.setInputState({
           attachments: this._attachmentModel.attachments,
           mode: {
               id: mode.id,
               kind: mode.kind
           },
           selectedModel: this._currentLanguageModel,
           inputText: this._inputEditor.getValue(),
           cursorPosition: cursorPosition || { lineNumber: 1, column: 1 },
           selection: selection && !selection.isEmpty() ? selection : undefined
       });
   }
   ```

   **Add debounced text sync**:
   ```typescript
   private readonly _syncTextDebounced = this._register(
       new RunOnceScheduler(() => this._syncInputStateToModel(), 150)
   );
   ```

   **Hook up to events**:
   - Attachments: Add to `_attachmentModel.onDidChange` handler
   - Mode: Add to `_onDidChangeCurrentChatMode` emission
   - Model: Add to `_onDidChangeCurrentLanguageModel` emission
   - Text: Add to `_inputEditor.onDidChangeModelContent` handler (debounced)
   - Cursor/Selection: Add to `_inputEditor.onDidChangeCursorPosition` handler

2. `src/vs/workbench/contrib/chat/browser/chatWidget.ts`

   **Pass model reference**:
   ```typescript
   setModel(model: IChatModel, viewState: IChatViewState): void {
       // ... existing code
       this.input.setChatModel(model);
   }
   ```

**Testing**:
- Type in input, verify `chatModel.inputState.inputText` updates
- Add attachment, verify `chatModel.inputState.attachments` updates
- Change mode, verify `chatModel.inputState.mode` updates
- Switch model, verify `chatModel.inputState.selectedModel` updates
- Move cursor, verify `chatModel.inputState.cursorPosition` updates
- Select text, verify `chatModel.inputState.selection` updates
- Verify debouncing works for text input

**Success Criteria**:
- ✅ All input changes written to model
- ✅ Debouncing prevents excessive updates
- ✅ No performance degradation
- ✅ Existing functionality unchanged

---

### Phase 3: Sync ChatModel → ChatInputPart (Bidirectional)

**Goal**: Make ChatInputPart read from ChatModel and establish two-way binding.

**Duration**: 2-3 days

**Files to Modify**:

1. `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`

   **Add model observer**:
   ```typescript
   private readonly _modelSyncDisposables = this._register(new DisposableStore());

   setChatModel(model: IChatModel | undefined): void {
       this._chatModel = model;
       this._modelSyncDisposables.clear();

       if (!model) {
           return;
       }

       // Initial sync from model to view
       this._syncFromModel(model.inputState.get());

       // Observe changes from model
       this._modelSyncDisposables.add(autorun(reader => {
           const inputState = model.inputState.read(reader);
           this._syncFromModel(inputState);
       }));
   }

   private _isSyncingFromModel = false;

   private _syncFromModel(state: IChatModelInputState): void {
       // Prevent circular updates
       if (this._isSyncingFromModel) {
           return;
       }

       try {
           this._isSyncingFromModel = true;

           // Update attachments
           if (!arraysEqual(this._attachmentModel.attachments, state.attachments)) {
               this._attachmentModel.clearAndSetContext(...state.attachments);
           }

           // Update mode
           const currentMode = this._currentModeObservable.get();
           if (currentMode.id !== state.mode.id) {
               this.setChatMode(state.mode.id, false);
           }

           // Update model
           if (state.selectedModel &&
               this._currentLanguageModel?.identifier !== state.selectedModel.identifier) {
               this.setCurrentLanguageModel(state.selectedModel);
           }

           // Update text
           if (this._inputEditor.getValue() !== state.inputText) {
               this._inputEditor.setValue(state.inputText);
           }

           // Update cursor/selection
           if (state.selection) {
               this._inputEditor.setSelection(state.selection);
           } else if (state.cursorPosition) {
               this._inputEditor.setPosition(state.cursorPosition);
           }
       } finally {
           this._isSyncingFromModel = false;
       }
   }
   ```

   **Update sync to model to check flag**:
   ```typescript
   private _syncInputStateToModel(): void {
       if (!this._chatModel || this._isSyncingFromModel) {
           return;
       }
       // ... rest of sync logic
   }
   ```

   **Update `initForNewChatModel()`**:
   ```typescript
   initForNewChatModel(state: IChatViewState, chatSessionIsEmpty: boolean): void {
       // Read from model's inputState instead of viewState
       if (this._chatModel) {
           const modelState = this._chatModel.inputState.get();
           this._syncFromModel(modelState);
       } else {
           // Fallback to old behavior for compatibility
           // ... existing code
       }

       // ... rest of initialization
   }
   ```

2. `src/vs/workbench/contrib/chat/browser/chatWidget.ts`

   **Update `clear()`**:
   ```typescript
   async clear(): Promise<void> {
       // ... existing code

       // Clear model's input state
       if (this.viewModel) {
           this.viewModel.model.clearInputState();
       }

       // ... rest of clear logic
   }
   ```

**Testing**:
- Load session with saved input state, verify UI restored correctly
- Modify model directly, verify UI updates
- Modify UI, verify model updates, verify UI doesn't flicker
- Test rapid typing, verify no race conditions
- Clear session, verify input cleared in both model and UI

**Success Criteria**:
- ✅ Bidirectional sync works without loops
- ✅ Loading sessions restores full input state
- ✅ No flickering or race conditions
- ✅ Clear resets both model and UI

---

### Phase 4: Remove Manual Transfer Code

**Goal**: Rely on model serialization instead of manual state transfer.

**Duration**: 1-2 days

**Files to Modify**:

1. `src/vs/workbench/contrib/chat/browser/actions/chatMoveActions.ts`

   **Simplify `executeMoveToAction()`**:
   ```typescript
   async function executeMoveToAction(
       accessor: ServicesAccessor,
       moveTo: MoveToNewLocation,
       sessionResource?: URI
   ) {
       const widgetService = accessor.get(IChatWidgetService);
       const editorService = accessor.get(IEditorService);

       const widget = (sessionResource
           ? widgetService.getWidgetBySessionResource(sessionResource)
           : undefined) ?? widgetService.lastFocusedWidget;

       if (!widget || !widget.viewModel || widget.location !== ChatAgentLocation.Chat) {
           // Open new empty chat
           await editorService.openEditor({
               resource: ChatEditorInput.getNewEditorUri(),
               options: {
                   pinned: true,
                   auxiliary: { compact: true, bounds: { width: 640, height: 640 } }
               }
           }, moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP);
           return;
       }

       const resourceToOpen = widget.viewModel.sessionResource;

       // Clear widget (but model preserves inputState automatically)
       await widget.clear();

       // Open in new location - model will be transferred with inputState
       const options: IChatEditorOptions = {
           pinned: true,
           auxiliary: { compact: true, bounds: { width: 640, height: 640 } }
       };
       await editorService.openEditor(
           { resource: resourceToOpen, options },
           moveTo === MoveToNewLocation.Window ? AUX_WINDOW_GROUP : ACTIVE_GROUP
       );
   }
   ```

   **Remove**:
   - `const viewState = widget.getViewState();` line
   - `viewState` parameter passing
   - Manual restoration code

2. `src/vs/workbench/contrib/chat/browser/chatEditor.ts`

   **Simplify state management**:
   ```typescript
   // Remove or simplify _viewState memento usage
   // Model's inputState is now the source of truth

   override getViewState(): object | undefined {
       // Can be simplified or removed if not needed elsewhere
       return this.widget?.getViewState();
   }
   ```

3. `src/vs/workbench/contrib/chat/browser/chatViewPane.ts`

   **Update `loadSession()`**:
   ```typescript
   async loadSession(sessionId: URI, viewState?: IChatViewState): Promise<void> {
       // viewState parameter may be optional now
       // Model loads inputState automatically
       const sessionModel = await this.chatService.loadSession(sessionId);
       if (sessionModel) {
           this._widget.setModel(sessionModel, viewState ?? {});
       }
   }
   ```

**Testing**:
- Move chat from sidebar to editor, verify all input state preserved
- Move chat from editor to new window, verify all input state preserved
- Move empty chat, verify works without errors
- Move chat with attachments, verify attachments transferred
- Move chat with selection, verify selection preserved

**Success Criteria**:
- ✅ Moving editors preserves all input state
- ✅ Cursor selection preserved (new capability)
- ✅ Selected model preserved (new capability)
- ✅ Code simplified, viewState parameter mostly unused
- ✅ No manual state extraction needed

---

### Phase 5: Cleanup and Optimize

**Goal**: Remove redundant code and optimize the architecture.

**Duration**: 2-3 days

**Files to Modify**:

1. `src/vs/workbench/contrib/chat/browser/chatWidget.ts`

   **Simplify `getViewState()`**:
   ```typescript
   getViewState(): IChatViewState {
       // Most state now in model, this can be minimal or removed
       return {
           // Only include what's NOT in model
           // May just be view-specific UI state
       };
   }
   ```

2. `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`

   **Remove global storage for mode/model**:
   ```typescript
   // Remove or deprecate:
   // - getSelectedModelStorageKey()
   // - Global mode storage (GlobalLastChatModeKey)
   // Model is now source of truth

   // Update initialization to read from model:
   private initSelectedModel() {
       // Read from chatModel.inputState if available
       // Otherwise use defaults
       if (this._chatModel) {
           const modelState = this._chatModel.inputState.get();
           if (modelState.selectedModel) {
               this.setCurrentLanguageModel(modelState.selectedModel);
           }
       }
   }
   ```

3. `src/vs/workbench/contrib/chat/common/chatWidgetHistoryService.ts`

   **Simplify `IChatInputState`**:
   ```typescript
   // May be able to remove or simplify this interface
   // Most state now in IChatModelInputState
   export interface IChatInputState {
       // Only contrib-specific state that's not in model
   }
   ```

4. **Add Unit Tests**:

   Create `src/vs/workbench/contrib/chat/test/common/chatModelInputState.test.ts`:
   ```typescript
   suite('ChatModel InputState', () => {
       test('initializes with default state', () => { /* ... */ });
       test('setInputState updates state', () => { /* ... */ });
       test('clearInputState preserves mode and model', () => { /* ... */ });
       test('serialization includes inputState', () => { /* ... */ });
       test('deserialization restores inputState', () => { /* ... */ });
       test('backward compatibility with v3 sessions', () => { /* ... */ });
   });
   ```

   Create `src/vs/workbench/contrib/chat/test/browser/chatInputPartSync.test.ts`:
   ```typescript
   suite('ChatInputPart Model Sync', () => {
       test('writing to input updates model', () => { /* ... */ });
       test('updating model updates input', () => { /* ... */ });
       test('no circular updates', () => { /* ... */ });
       test('debouncing works for text', () => { /* ... */ });
   });
   ```

5. **Update Documentation**:
   - Add JSDoc to `IChatModelInputState`
   - Document sync behavior in `ChatInputPart`
   - Update architecture docs if they exist

**Testing**:
- Run full test suite
- Test all chat locations (editor, sidebar, panel, quick chat)
- Test session persistence across restarts
- Performance test: rapid typing, many attachments
- Test with various chat modes
- Test model switching

**Success Criteria**:
- ✅ All redundant storage removed
- ✅ All tests pass
- ✅ No performance regressions
- ✅ Code coverage >80% for new code
- ✅ Documentation complete

---

## Testing Strategy

### Unit Tests

1. **ChatModel InputState**:
   - Default initialization
   - Partial updates via `setInputState()`
   - Clear behavior
   - Serialization/deserialization
   - Backward compatibility

2. **ChatInputPart Sync**:
   - Model → View updates
   - View → Model updates
   - No circular updates
   - Debouncing
   - Concurrent updates

### Integration Tests

1. **Session Persistence**:
   - Save session with input state
   - Load session, verify state restored
   - Backward compatibility with old sessions

2. **Editor Transfers**:
   - Move sidebar → editor
   - Move editor → new window
   - Move with various input states

3. **Multi-Component**:
   - Change mode, verify model and UI sync
   - Add attachment, verify model and UI sync
   - Type text, verify debounced sync

### Manual Testing

1. **User Workflows**:
   - Start chat, type message, add attachments, send
   - Start chat, type message, close without sending, reopen
   - Start chat in sidebar, move to editor
   - Switch between different chats

2. **Edge Cases**:
   - Rapid typing
   - Many attachments (>20)
   - Long text input (>10k chars)
   - Network interruption during save
   - Concurrent changes to same session

### Performance Testing

1. **Metrics to Track**:
   - Text input latency (should be <16ms)
   - Attachment add time (should be <100ms)
   - Session load time (should not increase >10%)
   - Memory usage (should not increase >5%)

2. **Test Scenarios**:
   - Type 1000 characters rapidly
   - Add 50 attachments
   - Switch between 10 sessions
   - Keep session open for 1 hour

---

## Rollout Strategy

### Phase 1-2: Feature Flag (Optional)

Consider adding feature flag for gradual rollout:

```typescript
const USE_MODEL_INPUT_STATE = 'chat.useModelInputState';

// In ChatInputPart.setChatModel()
if (this.configurationService.getValue<boolean>(USE_MODEL_INPUT_STATE)) {
    // New behavior
} else {
    // Old behavior
}
```

### Monitoring

1. **Telemetry Events**:
   - `chat/inputState/synced` - Count of successful syncs
   - `chat/inputState/syncError` - Errors during sync
   - `chat/inputState/loadSuccess` - Successful loads
   - `chat/inputState/loadFailure` - Failed loads

2. **Error Tracking**:
   - Circular update detection
   - Serialization failures
   - Deserialization failures
   - Sync timeouts

### Rollback Plan

If issues discovered in production:

1. **Phase 2-3**: Disable write-to-model flag
2. **Phase 4**: Revert manual transfer code
3. **Phase 1**: Data in model but not used (safe)

---

## Success Metrics

### Functional Metrics

- ✅ All input state preserved on editor move
- ✅ Cursor selection preserved (0% → 100%)
- ✅ Selected model preserved (0% → 100%)
- ✅ Session restore includes full input state
- ✅ No manual transfer code needed

### Performance Metrics

- ✅ Text input latency unchanged (±5%)
- ✅ Session load time unchanged (±10%)
- ✅ Memory usage unchanged (±5%)

### Code Quality Metrics

- ✅ Lines of code reduced by >100 LOC
- ✅ Cyclomatic complexity reduced
- ✅ Test coverage >80% for new code
- ✅ Zero P0 bugs in first month

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Circular update loops | Medium | High | Careful flag checking, extensive testing |
| Performance degradation | Low | High | Debouncing, performance tests, monitoring |
| Data loss on migration | Low | Critical | Backward compatibility, gradual rollout |
| Breaking existing extensions | Low | Medium | Maintain old APIs during transition |
| Merge conflicts | Medium | Low | Small PRs, clear boundaries |

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Add to Model | 1-2 days | None |
| Phase 2: Write Sync | 2-3 days | Phase 1 |
| Phase 3: Read Sync | 2-3 days | Phase 2 |
| Phase 4: Remove Manual | 1-2 days | Phase 3 |
| Phase 5: Cleanup | 2-3 days | Phase 4 |
| **Total** | **8-13 days** | Sequential |

---

## Open Questions

1. **Should we preserve input state across workspace reloads?**
   - Current behavior: Input cleared on reload
   - Proposed: Input persisted via model
   - Decision needed: Product team input required

2. **How to handle mode/model conflicts?**
   - E.g., saved state has model not available anymore
   - Proposed: Fall back to default, show notification
   - Decision needed: UX design required

3. **Should we sync implicit context state?**
   - Current: Not part of proposal
   - Consider: Add in Phase 5 if needed
   - Decision needed: Defer until Phase 5

4. **Performance targets for large inputs?**
   - How many attachments should we support?
   - Maximum input text length?
   - Decision needed: Define limits

---

## Appendix: File Reference

### Key Files to Modify

| File | Primary Changes |
|------|----------------|
| `chatModel.ts` | Add `IChatModelInputState`, `_inputState`, serialization |
| `chatInputPart.ts` | Add sync methods, model observer, remove global storage |
| `chatWidget.ts` | Pass model to input part, simplify `getViewState()` |
| `chatMoveActions.ts` | Remove manual transfer, rely on model |
| `chatEditor.ts` | Simplify state management |
| `chatViewPane.ts` | Update to use model state |
| `chatServiceImpl.ts` | Update deserialization |

### Related Files (May Need Updates)

- `chatAttachmentModel.ts` - Ensure compatibility
- `chatWidgetHistoryService.ts` - Simplify interface
- `chatSessionStore.ts` - Verify serialization
- `chatModes.ts` - Ensure mode state compatible

---

## Conclusion

This migration will centralize chat input state in ChatModel, enabling automatic serialization, restoration, and transfer. The incremental 5-phase approach minimizes risk while delivering immediate benefits in each phase. The end result is a cleaner architecture with less manual state management code and improved user experience through better state preservation.
