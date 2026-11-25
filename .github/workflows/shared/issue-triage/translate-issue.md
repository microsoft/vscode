# Task: Translate Issue

Determine whether an issue is written in a language other than English and, if so, translate the issue's title and body into English so maintainers can read it.

## Input

You will be given an issue's title, body (description), and current labels.

## Idempotency Guard

If the issue already has any of these labels, the result is `already-translated`:

- `ai-translated` — applied by this workflow after it posts a translation comment
- `*english-please` — applied by the english-please automation when a non-English issue is detected

## Decision Criteria

### The answer is `english` when:
- The issue title and body are primarily written in English
- Or the issue is so short / code-only that no natural-language content is present to translate

Treat code blocks, file paths, stack traces, environment dumps, and proper nouns as language-neutral when judging the dominant language.

### The answer is a translation when:
- The issue title and/or body is primarily written in a language other than English

When the issue is non-English, translate the title and body into English following these guidelines:

- Translate the content accurately while maintaining the original meaning
- Preserve any code snippets, error messages, or technical terms as-is
- Keep markdown formatting intact (headings, lists, links, code fences, HTML comments)
- If a section of the input is already in English (e.g. an auto-filled template), leave it unchanged
- Maintain the tone and intent of the original message

### Body preprocessing

When translating, content from `Extension version:` onward is excluded — only the content before that marker is translated. Auto-generated extension version metadata is omitted from the translated body entirely. Only the first occurrence of `Extension version:` outside a fenced code block acts as the truncation marker; occurrences inside code blocks (e.g., pasted terminal output) are ignored.

## Edge Cases

- **Mixed-language issues** (half English, half another language): translate only the non-English portions; leave English portions unchanged.
- **Title-only issues** with no body: translate the title; leave the body section empty.
- **Code-heavy issues** with non-English comments inside code blocks: if the prose outside code blocks is English (or absent), answer `english`. If the prose is non-English, translate it but leave code block contents untouched.

## When Uncertain

Err on the side of `english`. Only return a translation when the issue is clearly not in English.

## Output

The output of this skill will be one of the following:

- `already-translated` — a translation comment already exists on the issue
- `english` — the issue is in English
- A translation block in this exact format:

  ```
  ## AI Translation:

  ### Title:
  {translated title}

  ### Body:
  {translated body}
  ```

Example for a Spanish issue:

```
## AI Translation:

### Title:
Editor crashes when opening large JSON files

### Body:
When I try to open a JSON file larger than 50MB, VS Code freezes for several minutes and then crashes.

- VS Code Version: 1.95.0
- OS: Windows 11

Steps to reproduce:
1. Open a JSON file >50MB
2. Wait for it to load
3. The editor freezes and eventually crashes
```
