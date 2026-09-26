# greptile skills

[Agent Skills](https://agentskills.io) for automated PR review workflows. Supports GitHub, GitLab, Perforce, and local Greptile CLI reviews. Requires `git` + `gh` CLI (GitHub), `glab` CLI (GitLab), `p4` CLI (Perforce), or the Greptile CLI for local reviews.

## Skills

| Skill | Description |
|-------|-------------|
| [`check-pr`](check-pr/) | Check a PR/MR/CL for unresolved comments, failing checks, incomplete description. Fix and resolve. |
| [`cli-review`](cli-review/) | Run a Greptile CLI review from the current checkout and summarize findings. |
| [`greploop`](greploop/) | Loop: trigger Greptile review, fix comments, re-review — until 5/5 confidence and zero comments. |

`check-pr` and `greploop` auto-detect the platform (GitHub, GitLab, or Perforce) from the environment. `cli-review` runs against the current local git checkout with the Greptile CLI.

## Requirements

| Platform | CLI tool | Install |
|----------|----------|---------|
| GitHub | `gh` | [cli.github.com](https://cli.github.com) |
| GitLab | `glab` | [gitlab.com/gitlab-org/cli](https://gitlab.com/gitlab-org/cli) |
| Perforce | `p4` | [perforce.com/downloads](https://www.perforce.com/downloads/helix-command-line-client-p4) |
| Greptile | `greptile` | [greptile.com/cli](https://www.greptile.com/cli) |

Authenticate before use: `gh auth login`, `glab auth login`, configure `P4PORT`/`P4USER`/`P4CLIENT` for Perforce, or `greptile login`.

## Install

```bash
git clone https://github.com/greptileai/skills.git ~/.claude/skills/greptile
cd ~/.claude/skills
ln -s greptile/check-pr check-pr
ln -s greptile/cli-review cli-review
ln -s greptile/greploop greploop
```

Or as a submodule:

```bash
git submodule add https://github.com/greptileai/skills.git .skills/greptile
ln -s greptile/check-pr .skills/check-pr
ln -s greptile/cli-review .skills/cli-review
ln -s greptile/greploop .skills/greploop
```

Claude Code discovers skills by looking for `SKILL.md` files at `~/.claude/skills/<skill-name>/SKILL.md`. Since this is a multi-skill repo, symlinks are needed to expose each sub-skill at the expected depth.

## Usage

Invoke by name in your agent (e.g. `/check-pr 123`, `/cli-review`, or `/greploop`). If no PR/MR/CL number is given, `check-pr` and `greploop` auto-detect the PR/MR for the current branch, or the pending changelist for Perforce.

For self-hosted GitLab instances whose hostname doesn't contain "gitlab", pass `--vcs gitlab` explicitly. For Perforce, pass `--vcs perforce` if auto-detection fails.

## License

MIT
