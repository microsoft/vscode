# GitLab API Reference

Useful GitLab REST API calls for the greploop workflow, using `glab api`.

`glab api` automatically resolves `:fullpath` to the URL-encoded project path from the local git remote.

## Fetch MR details

```bash
glab mr view <MR_IID> --output json
```

Key fields:
- `iid` — internal MR number (use this, not `id`)
- `source_branch` — equivalent to GitHub's `headRefName`
- `sha` — HEAD commit SHA
- `description` — MR body (Greptile may update this with the confidence score)

## Trigger Greptile review

```bash
glab mr note <MR_IID> --message "@greptile review"
```

## Fetch pipelines for an MR

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/pipelines"
```

Check `status` field: `running`, `pending`, `success`, `failed`, `canceled`, `skipped`.

## Fetch jobs for a pipeline (to find the Greptile job)

```bash
glab api "projects/:fullpath/pipelines/<PIPELINE_ID>/jobs"
```

Filter jobs where `name` matches `greptile` (case-insensitive). Terminal statuses: `success`, `failed`, `canceled`.

## Check if any pipeline is running

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/pipelines" | \
  jq '[.[] | select(.status == "running" or .status == "pending")] | length'
```

Returns `0` if no pipelines are running/pending.

## Find pipeline for a specific commit SHA

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/pipelines" | \
  jq -r --arg sha "COMMIT_SHA" '[.[] | select(.sha == $sha)] | sort_by(.id) | last | .id // empty'
```

## Fetch MR notes (to find Greptile's confidence score)

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/notes?per_page=100&sort=desc&order_by=created_at"
```

Filter by `author.username` for the Greptile bot. Scan `body` for a confidence pattern like `3/5` or `5/5`.

The Greptile bot username on GitLab may differ from GitHub's `greptile-apps[bot]` — check the first Greptile comment on the MR to identify the exact username.

## Fetch unresolved discussions (inline comments)

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/discussions?per_page=100"
```

Paginate with `&page=2`, etc. until response array length < `per_page`.

Filter for unresolved inline diff comments from Greptile:
```bash
jq '[.[] | select(.resolved == false and (.notes[0].type == "DiffNote") and (.notes[0].author.username == "GREPTILE_BOT_USERNAME"))]'
```

Each discussion has:
- `id` — use this for resolution
- `notes[0].body` — the comment text
- `notes[0].position.new_path` — file path

## Resolve a discussion

```bash
glab api --method PUT \
  "projects/:fullpath/merge_requests/<MR_IID>/discussions/<DISCUSSION_ID>" \
  --field resolved=true
```

GitLab has no batch resolution — issue one PUT per discussion.
