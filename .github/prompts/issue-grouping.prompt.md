---
agent: Engineering
model: Claude Sonnet 4.5 (copilot)
argument-hint: Give an assignee and or a label/labels. Issues with that assignee and label will be fetched and grouped.
description: Group similar issues.
tools:
  - github/search_issues
  - agent/runSubagent
  - edit/createFile
  - edit/editFiles
  - read/readFile
---

## Your Task
1. Use a subagent to:
  a. Using the GitHub MCP server, fetch only one page (50 per page) of the open issues for the given assignee and label in the `vscode` repository.
  b. After fetching a single page, look through the issues and see if there are are any good grouping categories.Output the categories as headers to a local file categorized-issues.md. Do NOT fetch more issue pages yet, make sure to write the categories to the file first.
2. Repeat step 1 (sequentially, don't parallelize) until all pages are fetched and categories are written to the file.
3. Use a subagent to Re-fetch only one page of the issues for the given assignee and label in the `vscode` repository. Write each issue into the categorized-issues.md file under the appropriate category header with a link and the number of upvotes. If an issue doesn't fit into any category, put it under an "Other" category.
4. Repeat step 3 (sequentially, don't parallelize) until all pages are fetched and all issues are written to the file.
5. Within each category, sort the issues by number of upvotes in descending order.
6. Show the categorized-issues.md file as the final output.
