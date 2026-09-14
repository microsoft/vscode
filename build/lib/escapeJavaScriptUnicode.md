<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# Unicode spellings in emitted JavaScript

Esbuild defaults to ASCII escaping where supported, but retains raw characters
inside regular expressions and some comments. A character above U+00FF can widen
Chromium's accumulated script source and cause earlier content to be rehashed.
The Unicode being matched is intentional; its raw source spelling is unnecessary.

## Transformation

`escapeJavaScriptUnicode` parses emitted JavaScript with Acorn and regular
expressions with regexpp. It rewrites literal characters, named captures and named
backreferences using equivalent Unicode escapes. Parsing the regex grammar is
important for identity escapes, astral characters, non-Unicode character classes,
and Unicode-set string alternatives.

Ordinary comment characters above U+00FF are escaped too. Unicode line and
paragraph separators in block comments become ordinary newlines, preserving
automatic semicolon insertion. Latin-1 characters are left alone.

The transform does **not** rewrite:

- String values, identifiers, or template contents, including tagged-template raw values.
- Copyright/license/preservation comments.
- Interpreter and debugger directives, including source URLs and source-map URLs.

Regex matching, flags, captures, and named-group values are preserved. Reflected
source text (`RegExp.source`, regex stringification, or `Function.toString()`) can
change, as with other build-time spelling/formatting transforms. This is not an
unconditional promise that the resulting file is ASCII or Latin-1: intentional
protected Unicode needs separate output validation and review.

## Output and source maps

`escapeJavaScriptOutput` applies sorted edits after code generation and adjusts
existing external or terminal base64 inline source maps using the same map helper
as private-field and NLS transformations. Missing referenced maps, malformed
input, unsupported inline maps, and out-of-root map paths fail explicitly.

Source-map content retains the original source. The map helper accounts for
CRLF, bare CR, and Unicode line terminators, including boundaries split by edits.
Assets and generated file names are not changed. Esbuild chunk names remain
opaque build identifiers; these post-processing edits, like other final-output
transforms, happen after esbuild computes them. Publish output trees atomically
under their revision/extension identity, not as unrelated files.

`escapeJavaScriptBuildOutput` uses esbuild's output metadata to process only files
emitted by that build. It does not rewrite stale siblings, downloaded VSIX
contents, or unrelated dependency files.

## Integrated producers

- Active core `build/next` bundling: after NLS, private fields, resource copying,
  standalone scripts, and optional browser SDK output.
- Dedicated browser SDK bundling.
- Non-watch shared extension and webview builds, including deliberately
  unminified Mermaid output. Minification settings are unchanged.
- Copilot's source build: after compilation/static assets and before maps move
  to their upload directory. The Copilot CI setup installs the build dependencies.
- Markdown dependency workers are re-emitted without bundling or minification,
  rather than copied with a dangling map reference. Esbuild composes upstream maps
  when available or produces an accurate map to the distributed JavaScript.

Downloaded, already-published extension artifacts are not modified. Their
publisher must use the corrected source build to produce new artifacts.

Core transpilation and watch-emitted extension entry bundles are not normalized.
The re-emitted Markdown worker uses the same mapped emit in watch callbacks.
CI enforcement and reviewed intentional-Unicode exceptions are separate from
this transform; generated NLS string serialization is also a separate change.

## Validation

Focused tests cover regex grammar and matching, raw templates, protected comments,
automatic semicolon insertion, map positions, inline/external maps, output
selection, nested worker emission, and concurrent shared emitters. Run:

```powershell
node --test build\lib\test\escapeJavaScriptUnicode.test.ts build\lib\test\escapeJavaScriptOutput.test.ts build\next\test\private-to-property.test.ts build\next\test\nls-sourcemap.test.ts
npm run typecheck --prefix build
```
