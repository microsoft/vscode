# GitHub Public Repo Cloner

This VS Code extension adds a sidebar view where you can search public GitHub repositories and clone them.

## Features

- Sidebar activity bar entry named **GitHub Repos**
- Command to search public repositories using GitHub Search API
- Search results rendered in a tree view
- Clone any listed public repository through VS Code Git integration
- Context menu action to open the repository page in a browser

## Commands

- `GitHub Repo Cloner: Search Repositories`
- `GitHub Repo Cloner: Refresh Repository Results`
- `GitHub Repo Cloner: Clone Repository`
- `GitHub Repo Cloner: Open Repository on GitHub`

## Run Locally

1. Open `github-repo-cloner-extension` in VS Code.
2. Run `npm install`.
3. Run `npm run compile`.
4. Press `F5` to launch an Extension Development Host.
5. In the new window, open the **GitHub Repos** sidebar and run **Search Repositories**.

## Notes

- This extension uses unauthenticated GitHub API calls, so heavy usage can hit GitHub rate limits.
- Cloning uses the built-in `git.clone` command.
