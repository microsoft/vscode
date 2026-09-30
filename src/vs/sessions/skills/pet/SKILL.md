---
name: pet
description: Teach the VS Code pet, the pixel-art robot on the chat input, new moves (pixel-art animations) and reactions to the user's messages or clicks, or change, play and forget them. Use when the user types /pet or asks to create or change an animation, move or reaction for the pet.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Teach the VS Code pet

The VS Code pet is the small pixel-art robot with two antennae that sits on the chat input of this window. It is not part of the user's project: don't create files, web pages or scripts for it, and don't open the browser. You teach it only through the `petGuide` and `teachPet` tools; if they aren't available, tell the user to show the pet with `/vscode-pet` first, and stop.

Everything the pet is taught also lives in its Interactions and Sprites pages (the pet's context menu, Interactions… and Sprites…), and in `pets.md`, where they can edit them as text. Interactions is when the pet shows a sprite, where the user picks the one sprite each of the pet's events plays, adds sprites to the click's pool, and writes text interactions; Sprites is everything it can show, where the user makes, plays, copies and forgets moves by hand and sees what uses each. Lessons you teach show up there right away, and what the user changes there is what `petGuide` reports.

To play or forget a move ("play YES", "forget the duck"), call `teachPet` right away with `play` or `forgetMoves` and the user's words, without reading the guide. If a name doesn't match, the result lists the moves the pet knows: pick the one the user meant and call again. Then reply in a few words.

To create or change moves and reactions:

1. Call `petGuide`. It explains how to draw moves in layers on the pet's real poses, the craft of the pet's own art, and what the pet knows; its picture shows the pet's built-in moves.
2. Plan the move in one line: its story in key poses and the props or word it needs. Before drawing, always call `petGuide` again with `examples` naming the one or two built-in moves closest to the request: their layers show the exact format to follow, and their pictures show every frame. Then draw the move in layers, following the guide. To change a move ("make it slower", "a red hat"), call `petGuide` with `moves` naming it to get it whole, and send it back with the same name, changing only what was asked.
3. Call `teachPet` with `"preview": true` for new or changed moves. It saves nothing and returns a picture of every frame on a dark and a light theme: look at each frame as a designer would, fix what reads wrong, and preview again, at most twice. If the result lists mistakes, fix all of them: nothing is saved until the lesson is valid.
4. Call `teachPet` with the same lesson without `preview`. For a reaction to messages ("whenever I say do it, play YES SIR"), pass `reactions` with `phrases`; for one of the pet's own events ("when I click you, get angry", "when a request finishes, do the SHIP IT move"), pass `reactions` with that `trigger` (`click`, `requestDone`, `confirmation`, `dizzy`, `sleep`, `typing` or `responding`). On `click`, the move joins the pet's own animations and one of them plays at random; on any other event, the move is the one sprite that plays, in place of the pet's own animation and of a move taught for it before, held for as long as the event lasts. Teach the move in the same call if the pet doesn't know it yet.
5. The pet plays the new move right away. Reply in one or two short sentences, in the user's language: what the pet learned, that they can ask for changes, and where to see and change it by hand: a move on the pet's Sprites page, a reaction on its Interactions page. To share a move, the user copies it from the Sprites page; teach a move someone pasted with `pastedMoves`, as it is.
