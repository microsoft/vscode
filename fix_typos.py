edits = {
    "src/vs/editor/contrib/snippet/browser/snippetController2.ts": [
        ("// as that is the inflight state causing cancelation", "// as that is the inflight state causing cancellation"),
        ("// regster completion item provider when there is any choice element", "// register completion item provider when there is any choice element"),
    ],
    "src/vs/editor/contrib/snippet/browser/snippetSession.ts": [
        ("// not acurate any more -> simply restore it", "// not accurate any more -> simply restore it"),
        ("// change stickness to never grow when typing at its edges", "// change stickiness to never grow when typing at its edges"),
        ("// Massage placeholder-indicies of the nested snippet to be", "// Massage placeholder-indices of the nested snippet to be"),
        ("// Renormalize fractional placeholder indicies back to small integers.", "// Renormalize fractional placeholder indices back to small integers."),
        ("// sort selections by their start position but remeber", "// sort selections by their start position but remember"),
    ],
    "src/vs/editor/contrib/suggest/browser/suggestInlineCompletions.ts": [
        ("// when no word is being typed (word characters superseed trigger characters)", "// when no word is being typed (word characters supersede trigger characters)"),
        ("// refesh model is required", "// refresh model is required"),
    ],
    "src/vs/editor/contrib/suggest/browser/suggestWidget.ts": [
        ('// accidential "resize-to-single-items" cases aren\'t happening', '// accidental "resize-to-single-items" cases aren\'t happening'),
    ],
    "src/vs/editor/browser/gpu/atlas/textureAtlas.ts": [
        (" * is distrubuted over multiple idle callbacks to avoid blocking the main thread.", " * is distributed over multiple idle callbacks to avoid blocking the main thread."),
    ],
    "src/vs/editor/contrib/contextmenu/browser/contextmenu.ts": [
        ("// Unless the user triggerd the context menu through Shift+F10, use the mouse position as menu position", "// Unless the user triggered the context menu through Shift+F10, use the mouse position as menu position"),
    ],
    "src/vs/editor/contrib/message/browser/messageController.ts": [
        ("// define bounding box around position and first mouse occurance", "// define bounding box around position and first mouse occurrence"),
    ],
    "src/vs/editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.ts": [
        ("throw new BugIndicatingError('Could not find avilable width for icon')", "throw new BugIndicatingError('Could not find available width for icon')"),
    ],
}
for path, replacements in edits.items():
    with open(path, "r", encoding="utf-8", newline="") as f:
        content = f.read()
    for old, new in replacements:
        if old not in content:
            print(f"NOT FOUND in {path}: {old!r}")
            continue
        content = content.replace(old, new)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    print(f"OK: {path}")
