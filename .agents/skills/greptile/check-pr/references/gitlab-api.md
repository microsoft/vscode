# GitLab API Reference

Useful GitLab REST API calls for working with merge request discussions, using `glab api`.

`glab api` automatically resolves `:fullpath` to the URL-encoded project path from the local git remote.

## Fetch MR details

```bash
glab mr view <MR_IID> --output json
```

Key fields (compared to GitHub equivalents):
- `iid` — internal MR number (use this, not `id`)
- `source_branch` — equivalent to GitHub's `headRefName`
- `sha` — HEAD commit SHA, equivalent to GitHub's `headRefOid`
- `description` — equivalent to GitHub's `body`

## Fetch all discussions (inline + general comments)

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/discussions?per_page=100"
```

Paginate with `&page=2`, `&page=3`, etc. until the response array length is less than `per_page`.

Each discussion object:
- `id` — discussion ID (used for resolution)
- `resolved` — `true` or `false`
- `notes` — array of note objects

Each note object:
- `type` — `"DiffNote"` for inline diff comments, `null` for general comments
- `author.username` — author's username
- `body` — comment text
- `position.new_path` — file path (for `DiffNote` type)

## Filter for unresolved inline diff comments

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/discussions?per_page=100" | \
  jq '[.[] | select(.resolved == false and (.notes[0].type == "DiffNote"))]'
```

## Resolve a single discussion

```bash
glab api --method PUT \
  "projects/:fullpath/merge_requests/<MR_IID>/discussions/<DISCUSSION_ID>" \
  --field resolved=true
```

There is no batch resolution in GitLab — issue one PUT per discussion.

## Fetch pipeline status for an MR

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/pipelines"
```

Pipeline statuses: `running`, `pending`, `success`, `failed`, `canceled`, `skipped`.

## Fetch jobs for a specific pipeline

```bash
glab api "projects/:fullpath/pipelines/<PIPELINE_ID>/jobs"
```

Each job has `name`, `status`, `stage`, and `web_url`.

## Fetch MR notes (general comments and bot reviews)

```bash
glab api "projects/:fullpath/merge_requests/<MR_IID>/notes?per_page=100"
```

Filter by `author.username` to find Greptile bot comments. The exact bot username depends on the Greptile installation — check the first Greptile comment to identify it.

## Post a comment on an MR

```bash
glab mr note <MR_IID> --message "your message here"
```

Or via API:

```bash
glab api --method POST \
  "projects/:fullpath/merge_requests/<MR_IID>/notes" \
  --field body="your message here"
```
