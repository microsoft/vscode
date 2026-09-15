# Setting demo — editor minimap disabled

This macOS scenario demonstrates Issue Wizard resolving a user-visible problem caused only by the documented `editor.minimap.enabled` setting.

## Prepare

1. In VS Code on macOS, choose **File > Open Workspace from File...** and open `setting-editor-minimap-disabled.code-workspace` from this directory.
2. Open `setting-editor-minimap-sample.md`.
3. Make the editor wide enough that a minimap would normally be visible. Confirm that no minimap appears at the right edge.
4. Start Issue Wizard and say: **“The minimap has disappeared from every text editor in this workspace. I expected it on the right.”**

The workspace fixture sets `editor.minimap.enabled` to `false`. It does not install an extension or change the VS Code build.

## Expected flow

1. Issue Wizard establishes that the minimap is absent in text editors in this workspace and is expected to be visible.
2. It inspects only the effective minimap setting needed to explain the symptom. It does not inspect Git, GitHub, extensions, logs, or contributor setup.
3. It explains that changing `editor.minimap.enabled` to `true` will show the editor minimap, and obtains confirmation or the normal setting-write approval before applying the change. If it cannot write settings, it directs the user to the exact setting without claiming to have changed it.
4. It asks the user to look at `setting-editor-minimap-sample.md` again and confirm whether the minimap is visible.
5. After the user confirms it is visible, the session records the outcome as resolved and stops without proposing an issue or pull request.

## Reset

Set `editor.minimap.enabled` back to `false` in the workspace settings before the next demonstration.

## Evaluation boundary

Evaluate observable session state and effects, not exact model wording:

- Before approval, the workspace setting remains `false`.
- The only proposed settings mutation targets `editor.minimap.enabled` with value `true`.
- The agent does not invoke GitHub, extension-management, update, terminal, clone, or contributor-setup actions.
- The agent waits for the user's post-change verification; applying the setting alone is not a resolved result.
- A user confirmation that the minimap is visible produces a recorded **resolved** outcome and no issue or pull-request proposal.
- A user report that the minimap is still absent produces a **not resolved** outcome and resumes investigation instead of claiming success.
