# Notebook Layout

The notebook editor is a virtualized list view rendered in two contexts (mainframe and webview/iframe). Since most elements' positions are absoulte and there is latency between the two frames, we have multiple optimizations to ensure smooth (we try our best) perceived user experience. The optimizations are mostly around:

* Ensure the elements in curent viewport are stable when other elements dimensions update
* Fewer layout messages between the main and iframe
* Less flickering and forced reflow on scrolling

While we continue optimizing the layout code, we need to make sure that the new optimization won't lead to regression in above three aspects. Here is a list of existing optimziations we already have and we want to make sure they still perform well when updating layout code.

## Executing code cell followed by markdown cells

Code cell outputs and markdown cells are both rendered in the underling webview. When executing a code cell, the list view will

1. Request cell output rendering in webview
2. Cell output height change
  2.1 in the webview, we set `maxHeight: 0; overflow: hidden` on the output DOM node, then it won't overlap with the following markdown cells
  2.2 broadcast the height change to the list view in main frame
3. List view received the height update request
  3.1 Send acknowledge of the output height change to webview
  3.2 Push down code cells below
  3.3 Webview remove `maxHeight: 0` on the output DOM node

Whether users would see flickering or overlap of outputs, monaco editor and markdown cells depends on the latency between 3.2 and 3.3.

## Re-executing code cell followed by markdown cells

Re-exuecting code cell consists of two steps:

1. Remove old outputs, which will reset the output height to 0
2. Render new outputs, which will push elements below downwards

The latency between 1 and 2 will cause the UI to flicker (as cells below this code cell will move upwards then downwards in a short period of time. However a lot of the time, we just tweak the code a bit and the outputs will have the same shape and very likely same rendered height, seeing the movement of cells below it is not pleasant.

For example say we have code

```py
print(1)
```

it will generate text output `1`. Updating the code to

```py
print(2)
```

will genrate text output `2`. The re-rendering of the output is fast and we want to ensure the UI is stable in this scenario, to archive this:

1. Clear existing output `1`
  1.1 Remove the output DOM node, but we reserve the height of the output
  1.2 In 200ms, we will reset the output height to `0`, unless there is a new output rendered
2. Received new output
  2.1 Re-render the new output
  2.2 Calcuate the height of the new output, update layout


If the new output is rendered within 200ms, users won't see the UI movement.

## Scrolling

Code cell outputs and markdown cells are rendered in the webview, which are async in nature. In order to have the cell outputs and markdown previews rendered when users scroll to them, we send rendering requests of cells in the next viewport when it's idle. Thus scrolling downwards is smoother.

However, we **don't** warmup the previous viewport as the cell height change of previous viewport might trigger the flickering of markdown cells in current viewport. Before we optimize this, do not do any warmup of cells before current viewport.


