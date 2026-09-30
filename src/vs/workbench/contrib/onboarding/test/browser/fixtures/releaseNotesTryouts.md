<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Try This experience showcase

Open this file, then run **Developer: Open Current File as Release Notes**.

This page demonstrates the model-picker and diff-editor examples.

## Try it: Smart diff layout

Use this pattern when the behavior can be prepared safely with isolated sample data.

The comparison uses bundled sample text, not workspace files. In the diff editor, use **Diff View** to select Inline, Side by Side, or Automatic, then resize the editor.

`try(editor.smart-diff,Try Smart Diff Layout)`

## Guide me: Model and provider selection

Use this pattern for a control whose choices have important capability, speed, provider, or billing implications.

The action opens a new unsent composer in the Agents window, highlights the model picker, and opens its details. Review the available models and providers, but close the picker without selecting anything if you want to leave your current model unchanged. The example never sends a prompt or chooses a billing provider for you.

`try(chat.model-provider-selection,Explore Models and Providers)`

## Compatibility: existing release-note behavior

The same example can use different shorthand labels while a legacy link keeps its product-generated label:

`try(editor.smart-diff,Compare Inline, Side by Side, and Automatic (Read-Only))`

[Legacy Smart Diff Example](command:workbench.action.onboarding.tryFeature?%5B%22editor.smart-diff%22%5D)

Malformed shorthand remains literal code: `try(editor.smart-diff,)`. A well-formed unknown ID has an inert explanation:

`try(unknown.release-notes-example,Unavailable Example)`

The existing settings chip `setting(editor.wordWrap:on)` remains interactive. The Command Palette shortcut is `kb(workbench.action.showCommands)`.

[Open Word Wrap Setting](command:workbench.action.openSettings?%5B%22%40id%3Aeditor.wordWrap%22%5D)
