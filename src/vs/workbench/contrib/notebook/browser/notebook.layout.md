The notebook editor is a virtualized list view rendered in two contexts (mainframe and webview/iframe). It's on top of the builtin list/tree view renderer but its experience is different from traditional list views like File Explorer and Settings Editor. This doc covers the architecture of the notebook editor and layout optimiziations we experimented.

# Archtecture

## Notebook model resolution

![arch](https://user-images.githubusercontent.com/876920/141845889-abe0384e-0093-4b08-831a-04424a4b8101.png)

## Viewport rendering

The rendering of notebook list view is a "guess and validate" process. It will calcuate how many cells/rows it can render within the viewport, have them all rendered, and then ask for their real dimension, and based on the cell/row dimensions it will decide if it needs to render more cells (if there are still some room in the viewport) or remove a few.

For short, the process is more or less

* Render cell/row (DOM write)
* Read dimensions (DOM read)

The catch here is while rendering a cell/row, if we happen to perform any DOM read operation between DOM write, it will trigger forced reflow and block the UI. To prevent this we would batch all DOM read operatiosn and postpone them untill the list view requests them.

The worflow of rendering a code cell with a text output is like below and all operations are synchronous

![render in the core](https://user-images.githubusercontent.com/876920/142256110-a1c5800f-be46-4bd2-bbff-077c1c73e1fd.png)

When the notebook document contains markdown cells or rich outputs, the workflow is a bit more complex and become asynchornously partially due to the fact the markdown and rich outputs are rendered in a separate webview/iframe. While the list view renders the cell/row, it will send requests to the webview for output rendering, the rendering result (like dimensions of the output elements) won't come back in current frame. Once we receive the output rendering results from the webview (say next frame), we would ask the list view to adjust the position/dimension of the cell and ones below.

![render outputs in the webview/iframe](https://user-images.githubusercontent.com/876920/142276957-f73a155e-70cb-4066-b5cc-5f451c1c91c8.png)


## Cell rendering

The rendering of cells in the notebook editor consists of following steps:

* Update reused DOM nodes in the template and cell decorations
* Set up context for the cell and toolbars
* Update cell toolbar, run toolbar and insertion toolbar between cells
* Render cell
* Register listeners for:
  * Notebook layout change
  * Cell layout change
  * Cell state change: Folding, Collapse, Focus

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

Copy in Notebook depends on the focus tracking

* Send `document.executeCommand('copy')` if users select text in output rendered in main frame by builtin renderer
* Request webview copy if the focus is inside the webview
* Copy cells if the focus is on notebook cell list
* Copy text if the focus is in cell editor (monaco editor)

![diagram](https://user-images.githubusercontent.com/876920/141730905-2818043e-1a84-45d3-ad27-83bd89235ca5.png)


# Optimizations

Since most elements' positions are absoulte and there is latency between the two frames, we have multiple optimizations to ensure smooth (we try our best) perceived user experience. The optimizations are mostly around:

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
