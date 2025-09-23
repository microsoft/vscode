import { Schema, NodeSpec, MarkSpec, DOMParser, Node as ProsemirrorNode } from 'prosemirror-model';

const kCslDOMParser = cslDOMParser();

export function cslTextToProsemirrorNode(text: string): ProsemirrorNode | null {
  const domParser = new window.DOMParser();
  const doc = domParser.parseFromString(text, 'text/html');
  if (doc) {
    const pmNode = kCslDOMParser.parse(doc.body, { preserveWhitespace: 'full' });
    return pmNode;
  } else {
    return null;
  }
}

export function cslDOMParser(): DOMParser {
  return DOMParser.fromSchema(cslSchema());
}

function cslSchema() {
  const nodes: { [name: string]: NodeSpec } = {
    doc: {
      content: 'inline*',
    },
    text: {
      group: 'inline',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toDOM(node: ProsemirrorNode) : any {
        return node.text;
      },
    },
  };
  const marks: { [name: string]: MarkSpec } = {};
  marks.strong = tagSpec('b');
  marks.em = tagSpec('i');
  marks.sup = tagSpec('sup');
  marks.sub = tagSpec('sub');
  marks.smallcaps = spanSpec('smallcaps');
  marks.nocase = spanSpec('nocase');

  // return schema
  return new Schema({
    nodes,
    marks,
  });
}

function tagSpec(tag: string): MarkSpec {
  return {
    parseDOM: [{ tag }],
    toDOM() {
      return [tag];
    },
  };
}

function spanSpec(clz: string): MarkSpec {
  return {
    parseDOM: [{ tag: `span[class*='${clz}']` }],
    toDOM() {
      return ['span', { class: clz }];
    },
  };
}
