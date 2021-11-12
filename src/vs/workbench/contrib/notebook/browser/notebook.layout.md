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

### What's the catch

Setting `overflow: hidden` turns out to be imperfect. When we replace outputs (or just in place rerender), due to the existence of `overflow: hidden`, the whole output container will be invisible for a super short period (as height changes to zero and we have a `max-height = 0`) and then show up again. This will cause unexpected flash https://github.com/microsoft/vscode/issues/132143#issuecomment-958495698. You won't see this without `overflow: hidden` as the browser is smart enough to know how to replace the old with the new DOM node without noticeable delay.


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



## Focus Tracking

Due to the nature of virtualization (list view) and two layers architecture, the focus tracking is more complex compared to file explorer or monaco editor. When a notebook is *focused*, the `document.activeElement` can be

* Monaco editor, when users focus on a cell editor
  * `textarea` when users focus the text
  * Widgets
* Webview/iframe, when users focus on markdown cell or rich outputs rendered rendered in iframe
* List view container, when users focus on cell container
* Focusable element inside the notebook editor
  * Builtin output (e.g., text output)
  * Find Widget
  * Cell statusbar
  * Toolbars

The catch here is if the focus is on a monaco editor, instead of the list view container, when the cell is moved out of view, the list view removes the cell row from the DOM tree. The `document.activeElement` will fall back `document.body` when that happens. To ensure that the notebook editor doesn't blur, we need to move focus back to list view container when the focused cell is moved out of view. More importantly, focus the cell editor again when the cell is visible again (if the cell is still the *active* cell).
