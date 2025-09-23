/*
 * pandoc_capsule.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Schema } from 'prosemirror-model';

import { base64Encode, base64Decode } from './base64';

import { PandocToken, ProsemirrorWriter, mapTokens, PandocTokenType } from './pandoc';

// constants used for creating/consuming capsules
const kFieldDelimiter = '\n';
const kValueDelimiter = ':';
const kTypeField = 'type';
const kPositionField = 'position';
const kPrefixField = 'prefix';
const kSourceField = 'source';
const kSuffixField = 'suffix';
const kBlockCapsuleSentinel = '31B8E172-B470-440E-83D8-E6B185028602'.toLowerCase();

// block capsule
export interface PandocBlockCapsule {
  type: string;
  position: number;
  prefix: string;
  source: string;
  suffix: string;
}

// preserve block source code through markdown parsing (e.g. for yaml metadata or rmd chunks).
// block capsules remove markdown from the document before pandoc parses it (placing it into
// a base64 encoded 'capsule'), then unwraps the capsule from the AST. All of this is done
// by the function in this interface.
export interface PandocBlockCapsuleFilter {
  // unique type id for this capsule
  type: string;

  // regex that matches a prefix (match[1]), the source to preserve (match[2]), and a suffix (match[3])
  // we need the prefix/suffix for the cases where the preserved source needs to be put back exactly
  // where it came from (e.g. in a multi-line html comment). we also need it to fixup indentation in
  // cases where capsules are unwrapped within a code block or raw block. the prefix and suffix
  // must begin and end (respectively) with newlines, and consist entirely of whitespace (e.g. leading
  // space for indented block or incidental whitespace after block delimiter)
  match: RegExp;

  // optional seconary filter expression (applied to a successful match to ensure
  // that matching wasn't overly greedy)
  discard?: RegExp;

  // custom function for pulling out the 3 parts from a match (defaults to p1,p2,p3)
  extract?: (
    match: string,
    p1: string,
    p2: string,
    p3: string,
    p4: string,
  ) => { prefix: string; source: string; suffix: string };

  // provide a (text) envelope around the capsule, e.g.
  //  - newlines to ensure that yaml is parsed as a standalone paragraph;
  //  - backticks to ensure an Rmd is structurally parsed by pandoc as a codeblock
  enclose: (capsuleText: string, capsule: PandocBlockCapsule) => string;

  // examine a piece of text from within the pandoc ast and, if approproate, substitute any
  // capsules of my type for the original text (otherwise just return the passed string).
  // this method will generally use encodedBlockCapsuleRegex to create a regex to search
  // with, then upon finding a capsule, will unpack it with parsePandocBlockCapsule, compare
  // the type against our own type, and in the case they match do the substitution.
  handleText: (text: string, tok: PandocToken) => string;

  // do you want to handle this token as a capsule object? if so return the capsule text
  // (only the filter will know how to extract it from a pandoc token b/c it knows
  // where it was parsed from and what happened in the 'enclose' method)
  handleToken: (tok: PandocToken) => string | null;

  // write a capsule as a pandoc node
  writeNode: (schema: Schema, writer: ProsemirrorWriter, capsule: PandocBlockCapsule) => void;
}

// transform the passed markdown to include base64 encoded block capsules as specified by the
// provided capsule filter. capsules are used to hoist block types that we don't want pandoc
// to see (e.g. yaml metadata or Rmd chunks) out of the markdown, only to be re-inserted
// after pandoc has yielded an ast. block capsules are a single base64 encoded pieced of
// text that include the original content, the matched prefix and suffix, and a type
// identifier for orchestrating the unpacking.
export function pandocMarkdownWithBlockCapsules(
  original: string,
  markdown: string,
  capsuleFilter: PandocBlockCapsuleFilter,
) {
  // default extractor
  const defaultExtractor = (_match: string, p1: string, p2: string, p3: string) => {
    return {
      prefix: p1,
      source: p2,
      suffix: p3,
    };
  };

  // find the original position of all the matches
  const positions: number[] = [];
  let match = capsuleFilter.match.exec(original);
  while (match != null) {
    positions.push(match.index);
    match = capsuleFilter.match.exec(original);
  }

  // reset capsule filter match index
  capsuleFilter.match.lastIndex = 0;

  // replace all w/ source preservation capsules
  return markdown.replace(capsuleFilter.match, (match: string, p1: string, p2: string, p3: string, p4: string) => {
    // read the original position of the match
    let position = 0;
    const originalPos = positions.shift();
    if (originalPos) {
      position = originalPos;
    }

    // if the capsuleFilter has a discard expression then check it
    if (capsuleFilter.discard && !!match.match(capsuleFilter.discard)) {
      return match;
    }

    // extract matches
    const extract = capsuleFilter.extract || defaultExtractor;
    const { prefix, source, suffix } = extract(match, p1, p2, p3, p4);

    // make the capsule
    const capsule: PandocBlockCapsule = {
      [kTypeField]: capsuleFilter.type,
      [kPositionField]: position,
      [kPrefixField]: prefix,
      [kSourceField]: source,
      [kSuffixField]: suffix,
    };

    // construct a field
    const field = (name: string, value: string) => `${name}${kValueDelimiter}${base64Encode(value)}`;

    // construct a record
    const record =
      field(kTypeField, capsule.type) +
      kFieldDelimiter +
      field(kPositionField, capsule.position.toString()) +
      kFieldDelimiter +
      field(kPrefixField, capsule.prefix) +
      kFieldDelimiter +
      field(kSourceField, capsule.source) +
      kFieldDelimiter +
      field(kSuffixField, capsule.suffix);

    // now base64 encode the entire record (so it can masquerade as a paragraph)
    const encodedRecord = base64Encode(record);

    // return capsule, which is:
    //   - a base64 encoded record surrounded with a sentinel value
    //   - enclosed in a filter specific envelope (used to influence pandoc parsing),
    //   - surrounded by the original prefix and suffix
    return (
      prefix +
      capsuleFilter.enclose(
        `${kBlockCapsuleSentinel}${kValueDelimiter}${encodedRecord}${kValueDelimiter}${kBlockCapsuleSentinel}`,
        capsule,
      ) +
      suffix
    );
  });
}

// block capsules can also end up not as block tokens, but rather as text within another
// token (e.g. within a backtick code block or raw_block). this function takes a set
// of pandoc tokens and recursively converts block capsules that aren't of type
// PandocTokenType.Str (which is what we'd see in a paragraph) into their original form
export function resolvePandocBlockCapsuleText(
  tokens: PandocToken[],
  filters: readonly PandocBlockCapsuleFilter[],
): PandocToken[] {
  // process all tokens
  return mapTokens(tokens, token => {
    // look for non-string pandoc tokens
    if (token.t !== PandocTokenType.Str && token.c) {
      if (typeof token.c === 'string') {
        token.c = decodeBlockCapsuleText(token.c, token, filters);
      } else if (Array.isArray(token.c)) {
        const children = token.c.length;
        for (let i = 0; i < children; i++) {
          if (typeof token.c[i] === 'string') {
            token.c[i] = decodeBlockCapsuleText(token.c[i], token, filters);
          }
        }
      }
    }

    return token;
  });
}

// decode the text capsule by running all of the filters (as there could be nesting)
export function decodeBlockCapsuleText(text: string, tok: PandocToken, filters: readonly PandocBlockCapsuleFilter[]) {
  filters.forEach(filter => {
    text = filter.handleText(text, tok);
  });
  return text;
}

export function blockCapsuleTextHandler(type: string, pattern: RegExp, textFilter?: (text: string) => string) {
  return (text: string, tok: PandocToken): string => {
    // if this is a code block or raw block then we need to strip the prefix
    // (b/c it could in a blockquote or indented in a list)
    const stripPrefix = tok.t === PandocTokenType.CodeBlock || tok.t === PandocTokenType.RawBlock;

    // replace text
    return text.replace(pattern, match => {
      const capsuleText = textFilter ? textFilter(match) : match;
      const capsule = parsePandocBlockCapsule(capsuleText);
      if (capsule.type === type) {
        if (stripPrefix) {
          return blockCapsuleSourceWithoutPrefix(capsule.source, capsule.prefix);
        } else {
          return capsule.source;
        }
      } else {
        return match;
      }
    });
  };
}

// token handler that looks for a paragraph token consisting entirely of a block capsule of our type.
// if we find that then return the block capsule text
export function blockCapsuleParagraphTokenHandler(type: string) {
  const tokenRegex = encodedBlockCapsuleRegex('^', '$');
  return (tok: PandocToken) => {
    if (tok.t === PandocTokenType.Para) {
      if (tok.c.length === 1 && tok.c[0].t === PandocTokenType.Str) {
        const text = tok.c[0].c as string;
        const match = text.match(tokenRegex);
        if (match) {
          const capsuleRecord = parsePandocBlockCapsule(match[0]);
          if (capsuleRecord.type === type) {
            return match[0];
          }
        }
      }
    }
    return null;
  };
}

export function blockCapsuleStrTokenHandler(type: string) {
  const tokenRegex = encodedBlockCapsuleRegex('^', '$');
  return (tok: PandocToken) => {
    if (tok.t === PandocTokenType.Str) {
      const text = tok.c as string;
      const match = text.match(tokenRegex);
      if (match) {
        const capsuleRecord = parsePandocBlockCapsule(match[0]);
        if (capsuleRecord.type === type) {
          return match[0];
        }
      }
    }
    return null;
  };
}

export const blockCapsuleHandlerOr = (
  handler1: (tok: PandocToken) => string | null,
  handler2: (tok: PandocToken) => string | null
) => (tok: PandocToken) => handler1(tok) ?? handler2(tok);

// create a regex that can be used to match a block capsule
export function encodedBlockCapsuleRegex(prefix?: string, suffix?: string, flags?: string) {
  return new RegExp(
    (prefix || '') +
      kBlockCapsuleSentinel +
      kValueDelimiter +
      '((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)' +
      kValueDelimiter +
      kBlockCapsuleSentinel +
      (suffix || ''),
    flags,
  );
}

// remove encoding envelope then parse the remaining text into a block capsule
export function parsePandocBlockCapsule(text: string): PandocBlockCapsule {
  const envelopeLen = kBlockCapsuleSentinel.length + kFieldDelimiter.length;
  const record = text.substring(envelopeLen, text.length - envelopeLen);
  const decodedRecord = base64Decode(record);
  const fields = decodedRecord.split(kFieldDelimiter);
  const fieldValue = (i: number) => base64Decode(fields[i].split(kValueDelimiter)[1]);
  return {
    [kTypeField]: fieldValue(0),
    [kPositionField]: parseInt(fieldValue(1), 10),
    [kPrefixField]: fieldValue(2),
    [kSourceField]: fieldValue(3),
    [kSuffixField]: fieldValue(4),
  };
}

// provide a version of the block capsule source with the prefix removed
// from all but the very first line. this allows us to restore the text
// to the level of indentation implied by the markdown (as opposed to the
// level found literally in the source file)
export function blockCapsuleSourceWithoutPrefix(source: string, prefix: string) {
  // prefix represents the indentation level of the block's source code, strip that
  // same prefix from all the lines of code save for the first one
  const prefixStripRegEx = new RegExp('^' + prefix);
  const lines = source.split('\n').map((line, index) => {
    return index > 0 ? line.replace(prefixStripRegEx, '') : line;
  });
  return lines.join('\n');
}
