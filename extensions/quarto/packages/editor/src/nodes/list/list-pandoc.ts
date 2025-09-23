/*
 * list-pandoc.ts
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

import { Node as ProsemirrorNode, NodeType, Fragment, Attrs } from 'prosemirror-model';

import { PandocOutput, PandocToken, ProsemirrorWriter, PandocTokenType } from '../../api/pandoc';

import { fragmentWithCheck, tokensWithChecked } from './list-checked';
import { ListNumberDelim, ListNumberStyle } from '../../api/list-types';
import { isList } from '../../api/list';
import { ListCapabilities } from '../../api/list-types';

const LIST_ATTRIBS = 0;
const LIST_CHILDREN = 1;

const LIST_ATTRIB_ORDER = 0;
const LIST_ATTRIB_NUMBER_STYLE = 1;
const LIST_ATTRIB_NUMBER_DELIM = 2;

// Note that we are planning on eliminating the markdownOutputFilter after this commit
// as there will be no more uses of it and it plays poorly w/ e.g. pandoc table output
// which needs to reliably know the number of characters wide each column will be).
// (previous uses of markdownOutputFilter were converted to use output.writeRawMarkdown).
// So, if we are attempting to re-enable example lists b/c there is now round tripping
// of example lists through the pandoc AST we need an alternative way to fixup
// example list output (likely a more robust pandoc AST).
const kListItemExampleSentinel = '20543127-1873-4833-AC49-5B352CFA2AF5';
const kListItemExampleRegex = new RegExp(`\\(\\d+\\) ${kListItemExampleSentinel}`, 'g');

export function readPandocList(nodeType: NodeType, capabilities: ListCapabilities) {
  // alias schema
  const schema = nodeType.schema;

  // default extraction functions
  let getChildren = (tok: PandocToken) => tok.c;
  let getAttrs: (tok: PandocToken) => Attrs = () => ({});

  // function to read the number style (convert example to default if we
  // don't support example lists)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readNumberStyle = (attribs: any) => {
    if (capabilities.fancy) {
      const style = attribs[LIST_ATTRIB_NUMBER_STYLE].t;
      if (style === ListNumberStyle.Example && !capabilities.example) {
        return ListNumberStyle.DefaultStyle;
      } else {
        return style;
      }
    } else {
      return ListNumberStyle.DefaultStyle;
    }
  };

  // specialize for ordered_list
  if (nodeType === schema.nodes.ordered_list) {
    getAttrs = (tok: PandocToken) => {
      const attribs = tok.c[LIST_ATTRIBS];
      return {
        order: capabilities.order ? attribs[LIST_ATTRIB_ORDER] : 1,
        number_style: readNumberStyle(attribs),
        number_delim: capabilities.fancy ? attribs[LIST_ATTRIB_NUMBER_DELIM].t : ListNumberDelim.DefaultDelim,
      };
    };
    getChildren = (tok: PandocToken) => tok.c[LIST_CHILDREN];
  }

  const listItemNodeType = schema.nodes.list_item;
  return (writer: ProsemirrorWriter, tok: PandocToken) => {

    // determine if this is an example list and log if it is
    if ((nodeType === schema.nodes.ordered_list) && capabilities.fancy) {
      const style = tok.c[LIST_ATTRIBS][LIST_ATTRIB_NUMBER_STYLE].t;
      if (style === ListNumberStyle.Example) {
        writer.logExampleList();
      }
    }
    
    const children = getChildren(tok);
    const attrs = { ...getAttrs(tok), 
                    tight: children.length && children[0].length && children[0][0].t === 'Plain'
                  };
    writer.openNode(nodeType, attrs);
    children.forEach((child: PandocToken[]) => {
      // setup tokens/attribs for output
      let tokens = child;
      const childAttrs: { checked: null | boolean } = { checked: null };

      // special task list processing if the current format supports task lists
      if (capabilities.tasks) {
        // look for checkbox in first character of child tokens
        // if we see it, remove it and set childAttrs.checked as appropriate
        const childWithChecked = tokensWithChecked(child);
        childAttrs.checked = childWithChecked.checked;
        tokens = childWithChecked.tokens;
      }

      // process children
      writer.openNode(listItemNodeType, childAttrs);
      writer.writeTokens(tokens);
      writer.closeNode();
    });
    writer.closeNode();
  };
}

export function writePandocOrderedList(capabilities: ListCapabilities) {
  return (output: PandocOutput, node: ProsemirrorNode) => {
    // alias some list options
    const options = listNodeOptions(node, capabilities);

    // force delim to two parens for example styles. we do this
    // to simplify the search/replace of example list sentinels
    // during conversion post-processing
    const delim = options.example ? ListNumberDelim.TwoParens : node.attrs.number_delim;

    output.writeToken(PandocTokenType.OrderedList, () => {
      output.writeArray(() => {
        output.write(capabilities.order ? node.attrs.order : 1);
        output.writeToken(capabilities.fancy ? node.attrs.number_style : ListNumberStyle.DefaultStyle);
        output.writeToken(capabilities.fancy ? delim : ListNumberDelim.DefaultDelim);
      });
      output.writeArray(() => {
        node.forEach(item => writePandocListItem(output, options, item));
      });
    });
  };
}

export function writePandocBulletList(capabilities: ListCapabilities) {
  return (output: PandocOutput, node: ProsemirrorNode) => {
    output.writeToken(PandocTokenType.BulletList, () => {
      node.forEach(item => writePandocListItem(output, listNodeOptions(node, capabilities), item));
    });
  };
}

export function exampleListPandocMarkdownOutputFilter(markdown: string) {
  return markdown.replace(kListItemExampleRegex, '(@) ');
}

interface ListNodeOptions {
  tight: boolean;
  example: boolean;
}

function listNodeOptions(node: ProsemirrorNode, capabilities: ListCapabilities): ListNodeOptions {
  const options = {
    tight: node.attrs.tight,
    example: capabilities.example ? node.attrs.number_style === ListNumberStyle.Example : false,
  };

  // if it's tight see if we need to override b/c of multiple blocks
  // (allow case of [paragraph,list] which is just a nested list)
  node.forEach(item => {
    if (options.tight && item.childCount > 1) {
      if (item.childCount > 2 || !isList(item.child(1)) ) {
        options.tight = false;
      }
    }
  });

  return options;
}

function writePandocListItem(output: PandocOutput, options: ListNodeOptions, node: ProsemirrorNode) {
  const checked = node.attrs.checked;

  output.writeArray(() => {
    node.forEach((itemNode: ProsemirrorNode, _offset, index) => {
      if (itemNode.type === node.type.schema.nodes.paragraph) {
        const paraItemBlockType = options.tight ? PandocTokenType.Plain : PandocTokenType.Para;
        output.writeToken(paraItemBlockType, () => {
          // for first item block, prepend check mark if we have one
          if (checked !== null && index === 0) {
            writeListItemInlines(
              output,
              options.example,
              fragmentWithCheck(node.type.schema, itemNode.content, checked),
              index,
            );
          } else {
            writeListItemInlines(output, options.example, itemNode.content, index);
          }
        });
      } else {
        output.writeNode(itemNode);
      }
    });
  });
}

function writeListItemInlines(output: PandocOutput, example: boolean, fragment: Fragment, index: number) {
  if (index === 0 && example) {
    output.writeToken(PandocTokenType.Str, kListItemExampleSentinel);
  }
  output.writeInlines(fragment);
}
