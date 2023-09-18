---
title: GitHub Copilot extension
description: Install and use the GitHub Copilot extension for Azure Data Studio.
author: dzsquared
ms.author: drskwier
ms.reviewer: erinstellato
ms.date: 5/24/2023
ms.service: azure-data-studio
ms.topic: conceptual
---

# GitHub Copilot extension

[GitHub Copilot](https://github.com/features/copilot) is an AI-powered pair programmer extension for Azure Data Studio that provides you with context-aware code completions, suggestions, and even entire code snippets. This powerful tool helps developers write code more efficiently, reduce the time spent on repetitive tasks, and minimize errors.

## How GitHub Copilot works

GitHub Copilot works by utilizing advanced machine learning models trained on a vast dataset of publicly available code from GitHub repositories. As you type code, the AI analyzes the context and provides relevant suggestions in real-time. You can receive suggestions also by writing a natural language comment describing what you want the code to do.

The GitHub Copilot extension in Azure Data Studio uses context from the editor to provide suggestions. For example, if you're writing a query that joins two tables, GitHub Copilot suggests the join condition from columns in the open editor, other files in the workspace, and common syntax patterns.

### Works with IntelliSense

GitHub Copilot works with IntelliSense to provide suggestions for code completion. IntelliSense is a feature of Azure Data Studio that provides suggestions for code completion, parameter info, and object names. IntelliSense is enabled by default in Azure Data Studio and provides its suggestions based on the context of the current connection and all SQL syntax.

The suggestions provided by IntelliSense are completion of a single word or phrase. GitHub Copilot provides suggestions for entire lines of code, including syntax and formatting.

## What is GitHub Copilot

GitHub Copilot for Azure Data Studio can be used in any editor window. To use GitHub Copilot, you must have an active internet connection. You can use GitHub Copilot in the following ways:

1. By typing code in the editor, GitHub Copilot provides suggestions in real-time.
2. By typing a natural language comment, GitHub Copilot provides suggestions for code that corresponds to the comment.

To accept a suggestion, press `tab`. To reject a suggestion, press `esc`.

At any time, pressing `ctrl+enter` opens the GitHub Copilot Completions Panel, which provides suggestions for code based on the context of the editor.

GitHub Copilot chat is not currently available for Azure Data Studio.

## Installing the GitHub Copilot extension

To get started, all you need is [Azure Data Studio 1.44](../release-notes-azure-data-studio.md#may-2023) or later, and a GitHub Copilot [subscription](https://docs.github.com/en/enterprise-cloud@latest/billing/managing-billing-for-github-copilot/about-billing-for-github-copilot). 

> [!TIP]
> GitHub Copilot is free for verified students and for maintainers of popular open source projects on GitHub.

1. Select the Extensions Icon to view the available extensions.

    ![extension manager icon](media/add-extensions/extension-manager-icon.png)

2. Search for the **GitHub Copilot** extension and select it to view its details. Select **Install** to add the extension.


## Using GitHub Copilot

### Copilot prompts for common SQL syntax

When you are creating T-SQL in an editor, Copilot can provide suggestions for common SQL syntax. For example, if you're writing a query that joins two tables, Copilot suggests the join condition from columns in the open editor, other files in the workspace, and common syntax patterns.

:::image type="content" source="media/github-copilot-extension/common-syntax.png" alt-text="Copilot prompting the autocompletion of a table join and where statement." border="true":::

### Copilot prompts from comments

Copilot's suggestions can be directed from comments in the editor, including natural language comments. For example, if you write a comment that describes a query, Copilot provides suggestions for the query.

:::image type="content" source="media/github-copilot-extension/code-suggestion-from-comment.png" alt-text="Copilot prompting the beginning of a PIVOT query." border="true":::

Copilot's suggestions may complete parts of the syntax required for the query, or may complete the entire query. In the example above, Copilot began the query to PIVOT the data.  Below, Copilot completed the PIVOT query based on the comment.

:::image type="content" source="media/github-copilot-extension/code-suggestion-from-comment-2.png" alt-text="Copilot prompting the completion of a PIVOT query." border="true":::

### Seeing alternative suggestions

During Copilot use in a SQL editor, you can see alternative suggestions, if any are available, by pressing `alt+[` (or `option+[` on macOS) to cycle through the suggestions. The previous suggestion is shown by pressing `alt+]` (or `option+]` on macOS).

You can see multiple suggestions by pressing `ctrl+enter` to open the Copilot Completions Panel. The Copilot Completions Panel shows multiple suggestions for the current context of the editor.


## Privacy

Your code is yours. We follow responsible practices in accordance with our [Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement) to ensure that your code snippets will not be used as suggested code for other users of GitHub Copilot.