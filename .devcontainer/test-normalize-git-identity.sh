#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/normalize-git-identity.sh"
ORIGINAL_PATH="$PATH"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

CASE_NO=0
HOME_DIR=""
BIN_DIR=""
REPO_DIR=""

fail() {
	printf '%s\n' "FAIL: $*" >&2
	exit 1
}

assert_eq() {
	expected="$1"
	actual="$2"
	label="$3"
	[ "$expected" = "$actual" ] || fail "$label: expected '$expected', got '$actual'"
}

new_case() {
	CASE_NO=$((CASE_NO + 1))
	case_dir="$TMP_ROOT/case-$CASE_NO"
	HOME_DIR="$case_dir/home"
	BIN_DIR="$case_dir/bin"
	REPO_DIR="$case_dir/repo"
	mkdir -p "$HOME_DIR" "$BIN_DIR" "$REPO_DIR"
	git -C "$REPO_DIR" init -q
}

write_fake_gh_profile() {
	cat > "$BIN_DIR/gh" <<'EOF'
#!/bin/sh
case "$*" in
	*"--jq .login") printf '%s\n' 'NguyenCuong1989' ;;
	*"--jq .id") printf '%s\n' '196793856' ;;
	*"--jq .name // .login") printf '%s\n' 'NgCuong' ;;
	*) exit 1 ;;
esac
EOF
	chmod +x "$BIN_DIR/gh"
}

write_failing_gh() {
	cat > "$BIN_DIR/gh" <<'EOF'
#!/bin/sh
exit 1
EOF
	chmod +x "$BIN_DIR/gh"
}

run_normalizer() {
	(
		cd "$REPO_DIR"
		HOME="$HOME_DIR" \
		PATH="$BIN_DIR:$ORIGINAL_PATH" \
		GITHUB_USER="${GITHUB_USER_OVERRIDE:-}" \
		GITHUB_ACTOR="" \
		sh "$SCRIPT"
	)
}

printf '%s\n' "[1/4] Preserve a valid global identity and remove a malformed local override"
new_case
HOME="$HOME_DIR" git config --global user.name 'Existing User'
HOME="$HOME_DIR" git config --global user.email 'existing@example.com'
git -C "$REPO_DIR" config user.email 'pc@ai.(none)'
run_normalizer >/dev/null
assert_eq 'Existing User' "$(HOME="$HOME_DIR" git config --global --get user.name)" 'preserved global name'
assert_eq 'existing@example.com' "$(HOME="$HOME_DIR" git config --global --get user.email)" 'preserved global email'
assert_eq '' "$(git -C "$REPO_DIR" config --local --get user.email 2>/dev/null || true)" 'removed malformed local email'

printf '%s\n' "[2/4] Resolve identity from the authenticated GitHub profile"
new_case
write_fake_gh_profile
run_normalizer >/dev/null
assert_eq 'NgCuong' "$(HOME="$HOME_DIR" git config --global --get user.name)" 'GitHub display name'
assert_eq '196793856+NguyenCuong1989@users.noreply.github.com' "$(HOME="$HOME_DIR" git config --global --get user.email)" 'GitHub noreply email'

printf '%s\n' "[3/4] Fall back to the Codespaces login when GitHub API resolution fails"
new_case
write_failing_gh
GITHUB_USER_OVERRIDE='NguyenCuong1989'
run_normalizer >/dev/null
unset GITHUB_USER_OVERRIDE
assert_eq 'NguyenCuong1989' "$(HOME="$HOME_DIR" git config --global --get user.name)" 'fallback name'
assert_eq 'NguyenCuong1989@users.noreply.github.com' "$(HOME="$HOME_DIR" git config --global --get user.email)" 'fallback noreply email'

printf '%s\n' "[4/4] Remain non-blocking when no GitHub identity can be resolved"
new_case
write_failing_gh
run_normalizer >/dev/null
assert_eq '' "$(HOME="$HOME_DIR" git config --global --get user.name 2>/dev/null || true)" 'missing unresolved name'
assert_eq '' "$(HOME="$HOME_DIR" git config --global --get user.email 2>/dev/null || true)" 'missing unresolved email'

printf '%s\n' 'PASS: Git identity normalization tests completed.'
