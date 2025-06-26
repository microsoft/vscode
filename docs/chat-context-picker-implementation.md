# Chat Context Picker Implementation in VS Code

## Overview

The chat context picker in VS Code is the "Add Context..." functionality that allows users to attach various types of context (files, symbols, problems, etc.) to their chat requests. This document provides a comprehensive overview of where and how this picker is implemented.

## Main Implementation Files

### 1. Core Interface Definitions
**File**: `src/vs/workbench/contrib/chat/browser/chatContextPickService.ts`

This file contains the foundational interfaces and service for the picker system:

- `IChatContextPicker` - Interface for picker configuration (placeholder, picks, configure options)
- `IChatContextPickerItem` - Interface for items that open sub-pickers 
- `IChatContextValueItem` - Interface for items that directly provide context values
- `IChatContextPickService` - Service that manages registered context items
- `IChatContextPickerPickItem` - Interface for individual items within a picker
- `ChatContextPickService` - Implementation of the context pick service

### 2. Main Picker Action Implementation
**File**: `src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts`

Contains the core picker functionality:

- `AttachContextAction` - The main action class that implements "Add Context..." (ID: `workbench.action.chat.attachContext`)
- Integrates with VS Code's `IQuickInputService` for the picker UI
- Handles both simple context values and complex sub-picker interactions
- Supports file/symbol attachment from quick access providers
- Manages the picker workflow and context attachment

### 3. Built-in Context Picker Items
**File**: `src/vs/workbench/contrib/chat/browser/actions/chatContext.ts`

Implements the default context picker items:

- `ChatContextContributions` - Registers all built-in context items
- `ToolsContextPickerPick` - Picker for available tools
- `RelatedFilesContextPickerPick` - Picker for related files 
- `OpenEditorContextValuePick` - Value picker for open editors
- `ClipboardImageContextValuePick` - Value picker for clipboard images
- `ScreenshotContextValuePick` - Value picker for screenshots

### 4. UI Integration
**File**: `src/vs/workbench/contrib/chat/browser/chatInputPart.ts`

Integrates the picker into the chat input UI:

- `AddFilesButton` - Custom action view item that renders the "Add Context" button
- Button appears in the `MenuId.ChatInputAttachmentToolbar` menu
- Styled with attach icon and "Add Context..." label
- Triggers the `AttachContextAction` when clicked

## Feature-Specific Picker Implementations

### Notebook Context Picker
**File**: `src/vs/workbench/contrib/notebook/browser/controller/chat/notebook.chat.contribution.ts`

- `KernelVariableContextPicker` - Allows selecting kernel variables from notebooks
- Only enabled in notebook chat location

### SCM History Context Picker  
**File**: `src/vs/workbench/contrib/scm/browser/scmHistoryChatContext.ts`

- `SCMHistoryItemContext` - Picker for source control history items (commits)
- Integrates with SCM view service and history providers

### Problems/Markers Context Picker
**File**: `src/vs/workbench/contrib/markers/browser/markersChatContext.ts`

- `MarkerChatContextPick` - Picker for problems/diagnostics
- Groups markers by file and severity

### Symbol Context Picker
**File**: `src/vs/workbench/contrib/search/browser/chatContributions.ts`

- `SymbolsContextPickerPick` - Picker for workspace symbols
- `FilesAndFoldersPickerPick` - Picker for files and folders
- Integrates with search services

## Architecture Pattern

The picker system follows a consistent architectural pattern:

1. **Registration**: Context items are registered with `IChatContextPickService`
2. **Two Types of Items**:
   - `IChatContextValueItem` - Directly provide context values
   - `IChatContextPickerItem` - Open sub-pickers for user selection
3. **Main Action**: `AttachContextAction` aggregates all registered items
4. **UI Integration**: Button in chat input toolbar triggers the action
5. **Extensibility**: Feature areas can register their own context items

## Key Menu Points

- **Button Menu**: `MenuId.ChatInputAttachmentToolbar` - Where the "Add Context" button appears
- **Keybinding**: `Ctrl+/` (when in chat input)
- **Action ID**: `workbench.action.chat.attachContext`

## Flow Summary

1. User clicks "Add Context..." button or uses `Ctrl+/` shortcut
2. `AttachContextAction.run()` is executed
3. Action collects all registered context items from `IChatContextPickService`
4. Quick pick is shown with available context options
5. User selects an item:
   - If `IChatContextValueItem`: directly attaches the context
   - If `IChatContextPickerItem`: opens a sub-picker for further selection
6. Selected context is added to the chat widget's attachment model

This architecture allows VS Code to provide a unified context attachment experience while enabling different feature areas to contribute their own specialized context types.