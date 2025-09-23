import { EditorState } from "prosemirror-state";
import { Node, Slice, Fragment } from "prosemirror-model";
import { createExtensionManager as initExtensionManager, initUI } from "../fixtures-extensions";
import { initSchema } from "../fixtures-schema";
import { initPlugins } from "../fixtures-plugins";
import { NodeIndex } from "../../src/api/nodeindex";

const ui = initUI();
const extensions = initExtensionManager();
const schema = initSchema(extensions);
const plugins = initPlugins(schema, extensions, ui);

it("NodeIndex initialization", () => {
  const state = createState();
  const cache = createParagraphIndex(state.doc);
  expect(cache.getIndex()).toHaveLength(3);
  expect(cache.getIndex()).toMatchSnapshot();
  
  cache.getIndex().forEach(({node}) => {
    expect(node.type).toBe(schema.nodes.paragraph);
  });
});

it("NodeIndex updates when a node's contents change", () => {
  const state = createState();
  const cache = createParagraphIndex(state.doc);

  const [ first ] = cache.getIndex();
  expect(first.node.textContent).toBe("Paragraph One");

  const tr1 = state.tr;
  tr1.replaceRange(first.pos + 1, first.pos + 1 + first.node.content.size,
    new Slice(Fragment.from(schema.text("New content for this paragraph")), 0, 0));

  const state1 = state.apply(tr1);
  const cache1 = cache.apply(tr1);
  verifyCache(cache1, state1);
  expect(cache1.getIndex()[0].node.attrs.provisional).toBeFalsy();
  expect(cache1.getIndex()).toHaveLength(3);
  expect(cache1.getIndex()).toMatchSnapshot();
  expect(cache1.getIndex()[0].node.textContent).toBe("New content for this paragraph");
});


it("NodeIndex handles node deletion/restoration", () => {
  const state = createState();
  const cache = createParagraphIndex(state.doc);
  const [ _, second ] = cache.getIndex();

  // 1. remove the second paragraph

  const tr1 = state.tr.delete(second.pos, second.pos + second.node.nodeSize);

  const state1 = state.apply(tr1);
  const cache1 = cache.apply(tr1);
  verifyCache(cache1, state1);
  expect(cache1.getIndex()).toHaveLength(2);
  expect(cache1.getIndex()).toMatchSnapshot();

  // 2. put the paragraph back

  const tr2 = state1.tr.insert(second.pos, second.node);

  const state2 = state1.apply(tr2);
  const cache2 = cache1.apply(tr2);
  verifyCache(cache2, state2);
  expect(cache2.getIndex()).toHaveLength(3);
  expect(cache2.getIndex()).toMatchSnapshot();

  // 2a. Go back to tr1 and do the same as tr2, but mutate tr1 (i.e. deletion
  //     and restoration in one transaction instead of two)

  const tr2a = tr1.insert(second.pos, second.node);

  const state2a = state.apply(tr2a);
  const cache2a = cache.apply(tr2a);
  verifyCache(cache2a, state2a);
  expect(cache2a.getIndex()).toEqual(cache2.getIndex());
});

it("NodeIndex handles node replacement", () => {
  const state = createState();
  const cache = createParagraphIndex(state.doc);
  const [ _first, _second, third ] = cache.getIndex();

  const tr3 = state.tr.replace(third.pos, third.pos + third.node.nodeSize,
    new Slice(Fragment.from(
      schema.nodes.paragraph.create(null, schema.text("A wild paragraph has appeared!"))
    ), 0, 0));

  const state3 = state.apply(tr3);
  const cache3 = cache.apply(tr3);
  verifyCache(cache3, state3);
  expect(cache3.getIndex()).toHaveLength(3);
  expect(cache3.getIndex()).toMatchSnapshot();
});

function paragraphPredicate(node: Node) {
  return node.type === schema.nodes.paragraph;
}

// Ensure that the incremental changes made to `cache` left it in a state
// equivalent to creating the index from scratch using the new doc.
function verifyCache(cache: NodeIndex, state: EditorState) {
  const refCache = NodeIndex.create(paragraphPredicate, state.doc);
  expect(cache.getIndex()).toEqual(refCache.getIndex());
}

function createParagraphIndex(doc: Node) {
  return NodeIndex.create(paragraphPredicate, doc);
}

function createState() : EditorState {
  const doc = Node.fromJSON(schema,
    /*
Heading 1
=========

Paragraph One

Paragraph Two

Heading 2
---------

Paragraph Three
*/
    {"type":"doc","content":[{"type":"body","content":[{"type":"heading","attrs":{"level":1,"link":null,"navigation_id":"8ce83611-b232-49b4-ad97-e354b085cf71","id":null,"classes":[],"keyvalue":[]},"content":[{"type":"text","text":"Heading 1"}]},{"type":"paragraph","content":[{"type":"text","text":"Paragraph One"}]},{"type":"paragraph","content":[{"type":"text","text":"Paragraph Two"}]},{"type":"heading","attrs":{"level":2,"link":null,"navigation_id":"0c357123-7391-4b01-a626-529513e7f4df","id":null,"classes":[],"keyvalue":[]},"content":[{"type":"text","text":"Heading 2"}]},{"type":"paragraph","content":[{"type":"text","text":"Paragraph Three"}]}]},{"type":"notes"},{"type":"annotations"}]}
  );

  const state = EditorState.create({
    schema,
    doc,
    plugins
  });

  return state;
}
