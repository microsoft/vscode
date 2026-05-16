#!/bin/bash
# Release script for AI Studio
# Usage: ./scripts/release.sh [patch|minor|major]
#
# Prerequisites:
#   - GH_TOKEN environment variable must be set
#   - git working directory must be clean
#
# This script will:
#   1. Bump the version in package.json
#   2. Commit the version bump
#   3. Create a git tag (app-v{version})
#   4. Push the commit and tag
#   5. GitHub Actions will build and publish the release

set -euo pipefail

BUMP_TYPE="${1:-patch}"

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

if [ -z "${GH_TOKEN:-}" ]; then
  echo "Error: GH_TOKEN environment variable is not set."
  echo ""
  echo "Set it with:"
  echo "  export GH_TOKEN=your_github_personal_access_token"
  echo ""
  echo "Generate a token at: https://github.com/settings/tokens/new"
  echo "Required permissions: repo, workflow"
  exit 1
fi

# Check for clean working directory
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working directory is not clean. Commit or stash changes first."
  exit 1
fi

cd "$(dirname "$0")/.."

# Bump version
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version | sed 's/^v//')
echo "Bumped version to $NEW_VERSION"

# Commit version bump
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"

# Create tag
TAG="app-v$NEW_VERSION"
git tag -a "$TAG" -m "Release $NEW_VERSION"
echo "Created tag: $TAG"

# Push commit and tag
git push origin HEAD
git push origin "$TAG"
echo ""
echo "Release $NEW_VERSION triggered!"
echo "GitHub Actions will build and publish installers automatically."
echo "Monitor progress at: https://github.com/nathakumar/vscode/actions"
