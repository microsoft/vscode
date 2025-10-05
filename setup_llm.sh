#!/bin/bash
# setup_llm.sh - Shell environment setup for AI assistants (Claude Code, Codex, Copilot, etc.)
# 
# Usage: source ./setup_llm.sh
#
# This script sets up helpful aliases and environment configurations to help AI assistants
# work more effectively with the NovaFuse project. Run this before starting your AI session.
set -e


echo "🤖 Setting up LLM-friendly environment for NovaFuse project..."

source .venv/bin/activate

# Python aliases - Use poetry for all Python commands
alias python='poetry run python'
alias pytest='poetry run pytest'
alias mypy='poetry run mypy'
alias ruff='poetry run ruff'
alias bandit='poetry run bandit'
alias coverage='poetry run coverage'

# Quick make commands
alias ma='make all'
alias md='make dev'
alias mt='make test'
alias mc='make clean'
alias mca='make clean all'
alias ms='make summary'

# Git shortcuts for common AI operations
alias gs='git status'
alias gd='git diff'
alias gdh='git diff HEAD'
alias gl='git log --oneline -10'

# Project navigation
alias cdp='cd /home/bots/git/project-base'
alias cdui='cd /home/bots/git/project-base-ui'
alias cdpm='cd /home/bots/git/project-base-pm'

# Show what's running
alias llm-debug-on='export LLM_DEBUG=1'
alias llm-debug-off='unset LLM_DEBUG'

# Function to show expanded commands when debugging
run() {
    if [ -n "$LLM_DEBUG" ]; then
        echo ">>> $@" >&2
    fi
    "$@"
}

# Export Python path for the project
#export PYTHONPATH="${PYTHONPATH}:$(pwd)/src"

# Set poetry to use local venv
export POETRY_VIRTUALENVS_IN_PROJECT=true

# Disable Python bytecode generation (cleaner for AI sessions)
export PYTHONDONTWRITEBYTECODE=1

# Enable color output for various tools
export FORCE_COLOR=1
export PY_COLORS=1

# Dashboard shortcut
alias dashboard='echo "Dashboard available at http://localhost:8080"'

# Quick status check
alias status='make summary && echo -e "\n📊 Dashboard: http://localhost:8080"'

# Function to quickly check if all quality gates pass
qcheck() {
    echo "🔍 Running quick quality check..."
    make dev
    local result=$?
    if [ $result -eq 0 ]; then
        echo "✅ Quick checks passed!"
    else
        echo "❌ Quick checks failed - see errors above"
    fi
    return $result
}

# Function to run a command with poetry if needed
prun() {
    if [ -f "pyproject.toml" ]; then
        echo "Running with poetry: $@"
        poetry run "$@"
    else
        "$@"
    fi
}

# Show current git worktree
echo "📁 Current worktree: $(basename $(pwd))"
echo "🌿 Git branch: $(git branch --show-current 2>/dev/null || echo 'not in git repo')"

# Check if poetry environment is active
if poetry env info --path &>/dev/null; then
    echo "🐍 Poetry environment: $(poetry env info --path)"
else
    echo "⚠️  No poetry environment detected"
fi

echo ""
echo "✅ LLM environment ready! Key aliases:"
echo "  • python → poetry run python"
echo "  • ma → make all"
echo "  • mca → make clean all" 
echo "  • qcheck → run quick quality checks"
echo "  • status → show project status"
echo ""
echo "💡 Tip: Use 'llm-debug-on' to see expanded commands"


