#!/bin/sh
set -eu

is_valid_email() {
	case "${1:-}" in
		""|*"(none)"*|*".none"*|*" "*|@*|*@|*@*@*) return 1 ;;
		*@*) return 0 ;;
		*) return 1 ;;
	esac
}

clean_malformed_local_email() {
	if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		return 0
	fi

	local_email="$(git config --local --get user.email 2>/dev/null || true)"
	if [ -n "$local_email" ] && ! is_valid_email "$local_email"; then
		git config --local --unset-all user.email 2>/dev/null || true
		printf '%s\n' "Removed malformed repository-local Git email override: $local_email"
	fi
}

normalize_git_identity() {
	# A malformed repository-local value overrides a valid global identity, so
	# clean it before deciding whether the global configuration can be preserved.
	clean_malformed_local_email

	current_name="$(git config --global --get user.name 2>/dev/null || true)"
	current_email="$(git config --global --get user.email 2>/dev/null || true)"

	if [ -n "$current_name" ] && is_valid_email "$current_email"; then
		printf '%s\n' "Git identity already configured: $current_name <$current_email>"
		return 0
	fi

	login="${GITHUB_USER:-${GITHUB_ACTOR:-}}"
	account_id=""
	display_name=""

	if command -v gh >/dev/null 2>&1; then
		login_from_api="$(gh api user --jq '.login' 2>/dev/null || true)"
		account_id="$(gh api user --jq '.id' 2>/dev/null || true)"
		display_name="$(gh api user --jq '.name // .login' 2>/dev/null || true)"
		[ -n "$login_from_api" ] && login="$login_from_api"
	fi

	if [ -z "$login" ]; then
		printf '%s\n' "WARNING: Git identity is missing and the GitHub login could not be resolved."
		printf '%s\n' "Run: git config --global user.name '<name>'"
		printf '%s\n' "     git config --global user.email '<email>'"
		return 0
	fi

	[ -n "$display_name" ] || display_name="$login"
	if [ -n "$account_id" ]; then
		noreply_email="${account_id}+${login}@users.noreply.github.com"
	else
		noreply_email="${login}@users.noreply.github.com"
	fi

	git config --global user.name "$display_name"
	git config --global user.email "$noreply_email"

	printf '%s\n' "Configured Git identity: $(git var GIT_AUTHOR_IDENT)"
}

normalize_git_identity
