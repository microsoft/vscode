# GraphQL Queries Reference

## Fetch unresolved review threads (paginated)

```graphql
query($cursor: String) {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 3) {
            nodes {
              body
              path
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}
```

## Batch-resolve threads

```graphql
mutation {
  t1: resolveReviewThread(input: {threadId: "ID1"}) { thread { isResolved } }
  t2: resolveReviewThread(input: {threadId: "ID2"}) { thread { isResolved } }
}
```

## Fetch general PR comments edited in place (REST)

General PR comments are issue comments. Greptile may update one summary comment repeatedly, so select by `updated_at` instead of `created_at`:

```bash
gh api --paginate "repos/{owner}/{repo}/issues/<PR_NUMBER>/comments?per_page=100" \
  | jq -s 'add
    | map(select(.user.login | test("greptile"; "i")))
    | sort_by(.updated_at)
    | last
    | {author: .user.login, updated_at, body}'
```
