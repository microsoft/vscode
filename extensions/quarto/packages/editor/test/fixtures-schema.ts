import { Schema, NodeSpec, Node as ProsemirrorNode, MarkSpec } from "prosemirror-model";
import { PandocNode } from "editor/src/api/node";
import { PandocMark } from "editor/src/api/mark";
import { initExtensions, ExtensionManager } from "editor/src/editor/editor-extensions";

export function initSchema(extensions: ExtensionManager): Schema {
  // build in doc node + nodes from extensions
  const nodes: { [name: string]: NodeSpec } = {
    doc: {
      content: 'body notes annotations',
    },

    body: {
      content: 'block+',
      isolating: true,
      parseDOM: [{ tag: 'div[class*="body"]' }],
      toDOM() {
        return ['div', { class: 'body pm-cursor-color pm-text-color pm-background-color pm-editing-root-node' }, 
                 ['div', { class: 'pm-content'}, 0]
               ];
      },
    },

    notes: {
      content: 'note*',
      parseDOM: [{ tag: 'div[class*="notes"]' }],
      toDOM() {
        return ['div', { class: 'notes pm-cursor-color pm-text-color pm-background-color pm-editing-root-node' }, 
                 ['div', { class: 'pm-content'}, 0]
               ];
      },
    },

    note: {
      content: 'block+',
      attrs: {
        ref: {},
        number: { default: 1 },
      },
      isolating: true,
      parseDOM: [
        {
          tag: 'div[class*="note"]',
          getAttrs(dom: Node | string) {
            const el = dom as Element;
            return {
              ref: el.getAttribute('data-ref'),
            };
          },
        },
      ],
      toDOM(node: ProsemirrorNode) {
        return [
          'div',
          { 'data-ref': node.attrs.ref, class: 'note pm-footnote-body', 'data-number': node.attrs.number },
          0,
        ];
      },
    },

    annotations: {
      content: '',
      selectable: false,
      attrs: {},
    }
  };
  extensions.pandocNodes().forEach((node: PandocNode) => {
    nodes[node.name] = node.spec;
  });

  // marks from extensions
  const marks: { [name: string]: MarkSpec } = {};
  extensions.pandocMarks().forEach((mark: PandocMark) => {
    marks[mark.name] = mark.spec;
  });

  // return schema
  return new Schema({
    nodes,
    marks,
  });
}