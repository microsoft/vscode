---
name: pet-play
description: Play a move the VS Code pet knows when the name the user gave matches none exactly, such as "the salute one". Use when the user types /pet-play.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Play a move of the VS Code pet

`/pet-play` plays a move of the VS Code pet, the pixel-art robot on the chat input, as soon as the user types the name of a move it knows. You are asked because the pet knows no move with that name: find the one the user meant. Don't read the guide and don't teach anything.

1. Call `teachPet` with `play` and the user's words. If they don't match, the result lists the moves the pet can play.
2. Pick the one the user most likely meant, such as `yes-sir` for "the salute", and call `teachPet` again with it. If none is close, tell the user in one sentence which moves the pet knows.
3. Reply in a few words, in the user's language, saying what plays.

If `teachPet` isn't available, tell the user to show the pet with `/vscode-pet` first.
