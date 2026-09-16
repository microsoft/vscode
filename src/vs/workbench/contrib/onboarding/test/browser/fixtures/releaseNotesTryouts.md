<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Try This experience showcase

Open this file, then run **Developer: Open Current File as Release Notes**.

This page demonstrates several useful levels of interaction. A release-note feature does not need to reproduce its complete behavior to provide value.

## Guide me: Problems filter

Use this pattern when locating a control and understanding its role is sufficient.

This example opens the Problems view, highlights its filter control, and shows an anchored message. The filter remains interactive while the spotlight is visible, but the example does not manufacture workspace diagnostics.

<!-- %IF TRYOUTS %
[Try Filtering Problems](command:workbench.action.onboarding.tryFeature?%5B%22problems.filter%22%5D)
%ENDIF % -->

## Try it: Smart diff layout

Use this pattern when the behavior can be prepared safely with isolated sample data.

The comparison uses bundled sample text, not workspace files. In the diff editor, use **Diff View** to select Inline, Side by Side, or Automatic, then resize the editor.

<!-- %IF TRYOUTS %
[Try Smart Diff Layout](command:workbench.action.onboarding.tryFeature?%5B%22editor.smart-diff%22%5D)
%ENDIF % -->

## Help me get ready: Create an automation

Use this pattern when the user should perform prerequisite or navigation actions in the real product.

The action opens the Agents window and asks you to:

1. Select **Automations** in the sidebar.
2. Review the **Built-in Templates** section.
3. Select **Create Automation**.

The tour advances after your real sidebar selection. Nothing is saved until you choose **Create** in the configuration dialog. When account or feature prerequisites are missing, the action explains what is needed instead of enabling them automatically.

<!-- %IF TRYOUTS %
[Try Creating an Automation](command:workbench.action.onboarding.tryFeature?%5B%22automations.create%22%5D)
%ENDIF % -->

## Use my context: GitHub attachments

Use this pattern when the feature must bind an action to a specific session, editor, or widget instead of relying on whichever UI was last focused.

The action prepares a separate Chat draft and opens its GitHub attachment picker. It must not replace another draft or send a request. Missing setup or attachment support is reported explicitly.

<!-- %IF TRYOUTS %
[Try GitHub Attachments](command:workbench.action.onboarding.tryFeature?%5B%22chat.github-attachments%22%5D)
%ENDIF % -->

## Guide me: Model and provider selection

Use this pattern for a control whose choices have important capability, speed, provider, or billing implications.

The action opens a new unsent composer in the Agents window, highlights the model picker, and opens its details. Review the available models and providers, but close the picker without selecting anything if you want to leave your current model unchanged. The example never sends a prompt or chooses a billing provider for you.

<!-- %IF TRYOUTS %
[Explore Models and Providers](command:workbench.action.onboarding.tryFeature?%5B%22chat.model-provider-selection%22%5D)
%ENDIF % -->

## Help me get ready: Automatic browser reload

Use this pattern when the highlighted control only exists after the user chooses an applicable resource.

Before starting, open a local HTML file in the Integrated Browser. If a local browser tab is not active, the action opens **Quick Open Browser Tab** so you can choose one. It then highlights the reload menu and explains **Refresh Automatically** without navigating, reloading, or changing the setting.

<!-- %IF TRYOUTS %
[Find Automatic Browser Reload](command:workbench.action.onboarding.tryFeature?%5B%22browser.auto-reload%22%5D)
%ENDIF % -->

## Explain safely: unavailable example

Use this fallback when the installed product does not register the referenced experience.

This deliberately unknown identifier must render as unavailable and must not execute a command.

<!-- %IF TRYOUTS %
[Unavailable Example](command:workbench.action.onboarding.tryFeature?%5B%22validation.not-registered%22%5D)
%ENDIF % -->

## Compatibility: existing release-note behavior

The existing settings chip `setting(editor.wordWrap:on)` remains interactive. The Command Palette shortcut is `kb(workbench.action.showCommands)`.

[Open Word Wrap Setting](command:workbench.action.openSettings?%5B%22%40id%3Aeditor.wordWrap%22%5D)
