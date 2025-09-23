/*
 * rmd_chunk.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';

import { Extension, ExtensionContext } from '../../api/extension';
import { PandocOutput, PandocTokenType } from '../../api/pandoc';

import { codeNodeSpec } from '../../api/code';
import { ProsemirrorCommand, EditorCommandId } from '../../api/command';

import { EditorUI, EditorUIChunks } from '../../api/ui-types';
import { kBookdownDocType, kQuartoDocType } from '../../api/format';
import { rmdChunk, insertRmdChunk } from '../../api/rmd';
import { OmniInsertGroup } from '../../api/omni_insert';

import { RmdChunkImagePreviewPlugin } from './rmd_chunk-image';
import { rmdChunkBlockCapsuleFilter } from './rmd_chunk-capsule';

import './rmd_chunk-styles.css';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorOptions } from '../../api/options';

const extension = (context: ExtensionContext): Extension | null => {
  const { ui, options, format } = context;

  if (!format.rmdExtensions.codeChunks) {
    return null;
  }

  return {
    nodes: [
      {
        name: 'rmd_chunk',
        spec: {
          ...codeNodeSpec(),
          attrs: {
            navigation_id: { default: null },
            md_index: { default: 0 },
          },
          parseDOM: [
            {
              tag: "div[class*='rmd-chunk']",
              preserveWhitespace: 'full',
            },
          ],
          toDOM() {
            return ['div', { class: 'rmd-chunk pm-code-block' }, 0];
          },
        },

        code_view: {
          firstLineMeta: true,
          lineNumbers: true,
          lineNumberFormatter: (lineNumber: number) => {
            if (lineNumber === 1) {
              return '';
            } else {
              return lineNumber - 1 + '';
            }
          },
          bookdownTheorems: format.docTypes.includes(kBookdownDocType),
          classes: ['pm-chunk-background-color'],
          lang: (_node: ProsemirrorNode, content: string) => {
            const match = content.match(/^\{([a-zA-Z0-9_-]+)/);
            if (match) {
              return match[1].split("-").pop() || "";
            } else {
              return null;
            }
          },
          createFromPastePattern: /^\{([a-zA-Z0-9_-]+).*}.*?\n/m,
        },

        pandoc: {
          blockCapsuleFilter: rmdChunkBlockCapsuleFilter(),

          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.writeToken(PandocTokenType.Para, () => {
              const parts = rmdChunk(node.textContent);
              if (parts) {
                output.writeRawMarkdown(parts.delimiter + '{' + parts.meta + '}\n' + parts.code + parts.delimiter + '\n');
              }
            });
          },
        },
      },
    ],

    commands: () => {
      const commands = [
        new RChunkCommand(ui, options),
        new PythonChunkCommand(ui, options),
        new JuliaChunkCommand(ui, options)
      ];
      if (!options.defaultCellTypePython) {
        commands.push(
          new BashChunkCommand(ui, options),
          new RcppChunkCommand(ui, options),
          new SQLChunkCommand(ui, options),
          new D3ChunkCommand(ui, options),
          new StanChunkCommand(ui, options),
        )
      }
      if (format.docTypes.includes(kQuartoDocType)) {
        commands.push(
          new MermaidChunkCommand(ui, options),
          new GraphVizChunkCommand(ui, options)
        )
      }
      if (ui.chunks) {
        commands.push(
          new ExpandAllChunksCommand(ui.chunks),
          new CollapseAllChunksCommand(ui.chunks)
        );
      }
      return commands;
    },

    plugins: () => {
      if (options.rmdImagePreview) {
        return [new RmdChunkImagePreviewPlugin(ui.context)];
      } else {
        return [];
      }
    },
  };
};

class RmdChunkCommand extends ProsemirrorCommand {
  constructor(
    ui: EditorUI,
    options: EditorOptions,
    id: EditorCommandId,
    keymap: string[],
    priority: number,
    lang: string,
    placeholder: string,
    image: () => string,
    group = OmniInsertGroup.Chunks,
    keywords?: string[]
  ) {
    super(id, keymap, insertRmdChunk(placeholder), {
      name: `${lang} ${ui.context.translateText('Code ')} ${cellName(ui, options)}`,
      description: `${ui.context.translateText('Executable')} ${lang} ${cellName(ui, options).toLowerCase()}`,
      group,
      priority,
      image,
      keywords: ["cell", "chunk", ...(keywords ? keywords : [])]
    });
  }
}

function cellName(ui: EditorUI, options: EditorOptions) {
  if (options.defaultCellTypePython) {
    return ui.context.translateText('Cell');
  } else {
    return ui.context.translateText('Chunk');
  }
}

const kInsertCodeChunkShortcut = ['Mod-Alt-i'];

class RChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui, 
      options,
      EditorCommandId.RCodeChunk, 
      !options.defaultCellTypePython ? kInsertCodeChunkShortcut : [], 
      !options.defaultCellTypePython ? 10 : 8, 
      'R', 
      '{r}\n', 
      () => ui.prefs.darkMode() ? ui.images.omni_insert!.r_chunk_dark! : ui.images.omni_insert!.r_chunk!,
      OmniInsertGroup.Common
    );
  }
}

class PythonChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui,
      options,
      EditorCommandId.PythonCodeChunk,
      options.defaultCellTypePython ? kInsertCodeChunkShortcut : [],
      options.defaultCellTypePython ? 10 : 8,
      'Python',
      '{python}\n',
      () => ui.images.omni_insert!.python_chunk!,
      OmniInsertGroup.Common
    );
  }
}


class JuliaChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui,
      options,
      EditorCommandId.JuliaCodeChunk,
      [],
      9,
      'Julia',
      '{julia}\n',
      () => ui.prefs.darkMode() ? ui.images.omni_insert!.code_block_dark : ui.images.omni_insert!.code_block!,
      OmniInsertGroup.Common
    );
  }
}

class BashChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(ui, options, EditorCommandId.BashCodeChunk, [], 7, 'Bash', '{bash}\n', () =>
      ui.prefs.darkMode() ? ui.images.omni_insert!.bash_chunk_dark! : ui.images.omni_insert!.bash_chunk!,
    );
  }
}

class RcppChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(ui, options, EditorCommandId.RcppCodeChunk, [], 6, 'Rcpp', '{Rcpp}\n', () =>
      ui.prefs.darkMode() ? ui.images.omni_insert!.rcpp_chunk_dark! : ui.images.omni_insert!.rcpp_chunk!,
    );
  }
}

class SQLChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui,
      options,
      EditorCommandId.SQLCodeChunk,
      [],
      5,
      'SQL',
      '{sql connection=}\n',
      () => ui.images.omni_insert!.sql_chunk!,
      OmniInsertGroup.Chunks
    );
  }
}

class D3ChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(ui, options, EditorCommandId.D3CodeChunk, [], 4, 'D3', '{d3 data=}\n', () => ui.images.omni_insert!.d3_chunk!, OmniInsertGroup.Chunks);
  }
}

class MermaidChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui,
      options,
      EditorCommandId.MermaidCodeChunk,
      [],
      7,
      'Mermaid',
      '{mermaid}\n',
      () => ui.prefs.darkMode() ? ui.images.omni_insert!.code_block_dark : ui.images.omni_insert!.code_block!,
      OmniInsertGroup.Chunks,
      ["diagram"]
    );
  }
}

class GraphVizChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui,
      options,
      EditorCommandId.GraphVizCodeChunk,
      [],
      7,
      'GraphViz',
      '{dot}\n',
      () => ui.prefs.darkMode() ? ui.images.omni_insert!.code_block_dark : ui.images.omni_insert!.code_block!,
      OmniInsertGroup.Chunks,
      ["diagram", "dot"]
    );
  }
}

class StanChunkCommand extends RmdChunkCommand {
  constructor(ui: EditorUI, options: EditorOptions) {
    super(
      ui,
      options,
      EditorCommandId.StanCodeChunk,
      [],
      7,
      'Stan',
      '{stan output.var=}\n',
      () => ui.images.omni_insert!.stan_chunk!,
      OmniInsertGroup.Chunks
    );
  }
}

class ChunkExpansionCommand extends ProsemirrorCommand {
  constructor(
    chunks: EditorUIChunks,
    id: EditorCommandId,
    keymap: string[],
    expand: boolean
  ) {
    super(id, keymap, (_state: EditorState, dispatch?: (tr: Transaction) => void) => 
    {
      if (dispatch) {
        chunks.setChunksExpanded(expand);
      }
      return true;
    });
  }
}

class ExpandAllChunksCommand extends ChunkExpansionCommand {
  constructor(chunks: EditorUIChunks) {
    super(chunks, EditorCommandId.ExpandAllChunks, [], true);
  }
}

class CollapseAllChunksCommand extends ChunkExpansionCommand {
  constructor(chunks: EditorUIChunks,) {
    super(chunks, EditorCommandId.CollapseAllChunks, [], false);
  }
}

export default extension;
