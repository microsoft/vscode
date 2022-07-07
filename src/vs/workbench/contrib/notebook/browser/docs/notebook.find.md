

## Find in Outputs

* Find is no longer **synchronous**
  * Progress bar in Find Widget
  * Require all outputs to be rendered first
* `window.find`
  * Shadow DOM nodes are skipped in non-chromium browsers
  * no builtin css rule for find match color
* `hiliteColor`
  * Modifies DOM
  * Shadow DOM not supported, we can potentially have our own impl
* Find match range serialization `document.getSelection`
  * `document.getSelection().getRangeAt(0).cloneRange()` not immutable, changed when document active selection changes
  * range will be invalid after `hiliteColor` executed
  * require our own serialization/deserialization
* Performance
  * `window.find` can be slow
    * We currently travese the DOM tree to figure out which cell/output contain the find match belongs to, it's really costly. One idea is checking the absolute position of the find match and compare it with output container positions.
  * Search only rendered outputs
    * MutationObserver for output change
	* Change active selection to the beginning of the new output and then request `window.find`

