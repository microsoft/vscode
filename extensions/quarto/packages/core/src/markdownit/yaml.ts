/*
 * markdownit-yaml.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) 2016-2020 ParkSB.
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

import MarkdownIt from "markdown-it";
import StateBlock from "markdown-it/lib/rules_block/state_block";
import Token from "markdown-it/lib/token";
import * as yaml from "js-yaml";
import { decorator } from "./utils/html.js";

// Typescript version of https://github.com/parksb/markdown-it-front-matter
// TODO: Rationalize this with quarto-core/src/markdownit-yaml.ts
//       This is a copy with rendering added - the core tokenizing function is identical (or should be)
const kTokFrontMatter = 'front_matter';

export function yamlPlugin(md: MarkdownIt, cb?: (yaml: unknown) => void) {
  const min_markers = 3,
    marker_str = "-",
    marker_char = marker_str.charCodeAt(0),
    marker_len = marker_str.length;

  function frontMatter(
    state: StateBlock,
    startLine: number,
    endLine: number,
    silent: boolean
  ) {
    let pos,
      nextLine,
      start_content,
      user_closed = false,
      start = state.bMarks[startLine] + state.tShift[startLine],
      max = state.eMarks[startLine];

    // Check out the first character of the first line quickly,
    // this should filter out non-front matter
    if (startLine !== 0 || marker_char !== state.src.charCodeAt(0)) {
      return false;
    }

    // Check out the rest of the marker string
    // while pos <= 3
    for (pos = start + 1; pos <= max; pos++) {
      if (marker_str[(pos - start) % marker_len] !== state.src[pos]) {
        start_content = pos + 1;
        break;
      }
    }

    const marker_count = Math.floor((pos - start) / marker_len);

    if (marker_count < min_markers) {
      return false;
    }
    pos -= (pos - start) % marker_len;

    // Since start is found, we can report success here in validation mode
    if (silent) {
      return true;
    }

    // Search for the end of the block
    nextLine = startLine;
    for (;;) {
      nextLine++;
      if (nextLine >= endLine) {
        // unclosed block should be autoclosed by end of document.
        // also block seems to be autoclosed by end of parent
        break;
      }

      if (state.src.slice(start, max) === "...") {
        break;
      }

      start = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (start < max && state.sCount[nextLine] < state.blkIndent) {
        // non-empty line with negative indent should stop the list:
        // - ```
        //  test
        break;
      }

      if (marker_char !== state.src.charCodeAt(start)) {
        continue;
      }

      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        // closing fence should be indented less than 4 spaces
        continue;
      }

      for (pos = start + 1; pos <= max; pos++) {
        if (marker_str[(pos - start) % marker_len] !== state.src[pos]) {
          break;
        }
      }

      // closing code fence must be at least as long as the opening one
      if (Math.floor((pos - start) / marker_len) < marker_count) {
        continue;
      }

      // make sure tail has spaces only
      pos -= (pos - start) % marker_len;
      pos = state.skipSpaces(pos);

      if (pos < max) {
        continue;
      }

      // found!
      user_closed = true;
      break;
    }

    // Ensure that we have real yaml here
    const markup = state.src.slice(startLine, pos);
    const yaml = parseFrontMatterStr(markup);
    const isYamlBlock = yaml !== null && typeof(yaml) === "object";
    
    // If this is yaml, render it
    if (isYamlBlock && user_closed) {
      const old_parent = state.parentType;
      const old_line_max = state.lineMax;
  
      const token = state.push(kTokFrontMatter, "", 0);
      token.hidden = true;
      token.markup = markup;
      token.block = true;
      token.map = [startLine, pos];
      token.meta = state.src.slice(start_content, start - 1);
  
      if (cb) {
        cb(token.meta);
      }    
      state.parentType = old_parent;
      state.lineMax = old_line_max;  
      state.line = nextLine + (user_closed ? 1 : 0);
      return true;
    } else {
      // This is not yaml, just continue
      state.line = nextLine + 1;
      return false;
    }
  }

  md.block.ruler.before("table", kTokFrontMatter, frontMatter, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  // Add rendering
  md.renderer.rules[kTokFrontMatter] = renderFrontMatter
}

function renderFrontMatter(tokens: Token[], idx: number): string {
  const token = tokens[idx];

  // Parse the markup
  const frontUnknown = parseFrontMatterStr(token.markup);

  // Extract important content
  if (typeof(frontUnknown) === "object") {
    const titleBlock: TitleBlock = {};
    const frontMatter = frontUnknown as Record<string, unknown>;

    const readStr = (key: string) => {
      if (frontMatter[key] === undefined) {
        return undefined;
      } else if (typeof(frontMatter[key]) === "string") {
        const val = frontMatter[key] as string;
        delete frontMatter[key];
        return val;
      } else {
        return undefined;
      }
    }
    
    // Read simple values
    titleBlock.title = readStr("title");
    titleBlock.subtitle = readStr("subtitle");
    titleBlock.abstract = readStr("abstract");
    titleBlock.date = readStr("date");
    titleBlock.modified = readStr("date-modified");
    titleBlock.doi = readStr("doi");
    const eatKeys = ['title', 'subtitle', 'abstract', 'date', 'date-modified', 'doi', 'author', 'authors'];
    // Read Authors
    titleBlock.authors = parseAuthor(frontMatter.author || frontMatter.authors);
    delete frontMatter.author;
    delete frontMatter.authors;


    // The final rendered HTML output
    const titleLines: string[] = [];

    // Render the title block and other yaml options
    const titleRendered = renderTitle(titleBlock);
    titleLines.push(titleRendered);

    if (Object.keys(frontMatter).length > 0) {

      // decorator
      const decor = decorator(["Options"]);
      titleLines.push(decor);

      // Left over YAML
      // Use the raw YAML string so we don't end up mutating / round tripping the YAML
      let eating = false;
      const outputYaml: string[] = [];
      const yamlNoDelimiters = token.markup.replace(/---\s*$/, '').replace(/^---\s*/, '');

      for (const line of yamlNoDelimiters.split("\n")) {
        const eatKey = eatKeys.some((k) => {
          const match = line.match(RegExp(`^${k}\\s*:`));
          return match !== null;
        })
        if (eatKey) {
          eating = true;
        } else {
          if (!eating || line.match(/^\S/)) {
            eating = false;
            outputYaml.push(line);  
          }
        }
      }

      const otherYamlRendered = `<pre class="quarto-frontmatter-container"><code class="cm-s-jupyter language-yaml quarto-frontmatter">${outputYaml.join("\n")}</code></pre>`;

      titleLines.push(otherYamlRendered);
    }
    return titleLines.join("\n");
  } else {
    return "";
  }
}

interface Author {
  name: string;
  affil?: string[];
  orcid?: string;
}

interface TitleBlock {
  title?: string;
  subtitle?: string;
  abstract?: string;
  date?: string;
  modified?: string;
  doi?: string;
  authors?: Author[]; 
}

type DocMetaValue = {
  value: string;
  padded?: boolean
};

// TODO: Use core function instead
function parseFrontMatterStr(str: string) {
  str = str.replace(/---\s*$/, "");
  try {
    return yaml.load(str, { schema: yaml.FAILSAFE_SCHEMA});
  } catch (error) {
    return undefined;
  }
}

function renderTitle(titleBlock: TitleBlock) {
  const rendered: string[] = [];
  if (titleBlock.title) {
    rendered.push(`<h1>${titleBlock.title}</h1>`);
  }

  if (titleBlock.subtitle) {
    rendered.push(`<p class="quarto-subtitle">${titleBlock.subtitle}</p>`);
  }

  const metadataBlocks: string[] = [];

  if (titleBlock.authors && titleBlock.authors?.length > 0) {
    const names: DocMetaValue[] = [];
    const affils: DocMetaValue[] = [];
    

    for (let i = 0; i < titleBlock.authors.length; i++) {
      const author = titleBlock.authors[i];      
      if (author.orcid) {
        names.push(
          { 
            value: `${author.name}<a href="https://orcid.org/${author.orcid}" class="quarto-orcid"><i></i></a>`,
            padded: i > 0
          });
      } else {
        names.push({ value: author.name, padded: i > 0 })
      }
      
      // Place empty rows to allow affiliations to line up
      const emptyCount = author.affil ? Math.max(author.affil.length - 1, 0) : 0;
      for (let j = 0; j < emptyCount; j++) {
        names.push({ value: "&nbsp;"});
      }

      // Collect affilations
      if (author.affil) {
        for (let k = 0; k < author.affil.length; k++) {
          const affil = author.affil[k];
          affils.push({
            value: affil,
            padded: i > 0 && k == 0
          });
        }
  
      }
    }

    const authLabel = names.length === 1 ? "Author" : "Authors";
    metadataBlocks.push(renderDocMeta(authLabel, names));

    if (affils.length > 0) {
      const affilLabel = affils.length === 1 ? "Affiliation" : "Affiliations";
      metadataBlocks.push(renderDocMeta(affilLabel, affils));
    }

  }
  
  if (titleBlock.date) {
    metadataBlocks.push(renderDocMeta("Date", [{value: titleBlock.date}]));
  }
  
  if (titleBlock.modified) {
    metadataBlocks.push(renderDocMeta("Modified", [{value: titleBlock.modified}]));
  }

  if (titleBlock.doi) {
    metadataBlocks.push(renderDocMeta("DOI", [{value: `<a href="https://doi.org/${titleBlock.doi}">${titleBlock.doi}</a>`}]));
  }

  if (metadataBlocks.length > 0) {
    rendered.push(renderDocMetas(metadataBlocks));
  }

  if (titleBlock.abstract) {
    rendered.push(`<p class="quarto-abstract">${titleBlock.abstract}</p>`);
  }

  return rendered.join("\n");
}

function renderDocMetas(docMetas: string[]) {
  const rendered: string[] = [];

  rendered.push(`<div class="quarto-meta-block">`);
  docMetas.forEach((docMeta) => { rendered.push(docMeta)});
  rendered.push(`</div>`);

  return rendered.join("\n");
}

function renderDocMeta(label: string, vals: DocMetaValue[]) {
  const rendered: string[] = [];

  rendered.push(`<div class="quarto-meta">`);
  rendered.push(`<p class="quarto-meta-title">${label}</p>`);
  vals.forEach((val) => {
    const clz = val.padded ? ` class="quarto-meta-padded"` : "";
    rendered.push(`<p${clz}>${val.value}</p>`);
  });
  rendered.push(`</div>`);

  return rendered.join("\n");
}

function parseAuthor(author: unknown) : Author[] {
  const authorsRaw = Array.isArray(author) ? author : [author];
  const authors: Author[] = [];
  for (const authorRaw of authorsRaw) {
    if (typeof(authorRaw) === "string") {
      authors.push({
        name: authorRaw
      });
    } else if (typeof(authorRaw) === "object") {

      const str = (key: string, defaultValue?: string) => {
        if (typeof(authorRaw[key]) === "string") {
          return authorRaw[key] as string;
        } else {
          return defaultValue;
        }
      }

      const affiliations: string[] = [];
      const affiliationSimple = str("affiliation");
      if (affiliationSimple) {
        affiliations.push(affiliationSimple);
      } else if (authorRaw.affiliations) {
        const affils = Array.isArray(authorRaw.affiliations) ? authorRaw.affiliations as unknown[] : [authorRaw.affiliations];
        affils.forEach((affilRaw: unknown) => {
          if (typeof(affilRaw) === "string") {
            affiliations.push(affilRaw);
          // eslint-disable-next-line no-constant-condition
          } else if (typeof(affilRaw === "object")) {
            const affilRecord = affilRaw as Record<string, unknown>;
            const name = affilRecord.name;
            if (typeof(name) === "string") {
              affiliations.push(name);
            }
          }
        });
      }

      authors.push({
        name: str("name", "")!,
        orcid: str("orcid"),
        affil: affiliations
      })
    }
  }
  return authors;
}
