---
description: Add a run action to the current session
---
<!-- Customize this prompt and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

Help the user add a run action to the current Agent Session. A run action is a shell command that can be triggered from the session's Run button in the title bar.

1. Ask the user what shell command they'd like to run (e.g. `npm run build`, `python manage.py runserver`, `./scripts/test.sh`)
2. Ask for an optional label to identify the action in the Run button menu (defaults to the command if omitted)
3. Ask whether to save it to workspace storage (`.vscode/tasks.json`) or user storage
4. Add a new entry to the appropriate `tasks.json` file in this format:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "<label>",
      "type": "shell",
      "command": "<command>",
      "inSessions": true
    }
  ]
}
```

If a `tasks.json` already exists, append the new task to the existing `tasks` array — do not overwrite other tasks. Once the file is saved, confirm to the user that the run action has been added and explain how to trigger it using the Run button.
