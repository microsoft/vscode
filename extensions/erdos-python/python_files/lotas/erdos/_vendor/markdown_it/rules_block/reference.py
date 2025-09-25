import logging

from ..common.utils import charCodeAt, isSpace, normalizeReference
from .state_block import StateBlock

LOGGER = logging.getLogger(__name__)


def reference(state: StateBlock, startLine: int, _endLine: int, silent: bool) -> bool:
    LOGGER.debug(
        "entering reference: %s, %s, %s, %s", state, startLine, _endLine, silent
    )

    pos = state.bMarks[startLine] + state.tShift[startLine]
    maximum = state.eMarks[startLine]
    nextLine = startLine + 1

    if state.is_code_block(startLine):
        return False

    if state.src[pos] != "[":
        return False

    string = state.src[pos : maximum + 1]

    # string = state.getLines(startLine, nextLine, state.blkIndent, False).strip()
    maximum = len(string)

    labelEnd = None
    pos = 1
    while pos < maximum:
        ch = charCodeAt(string, pos)
        if ch == 0x5B:  # /* [ */
            return False
        elif ch == 0x5D:  # /* ] */
            labelEnd = pos
            break
        elif ch == 0x0A:  # /* \n */
            if (lineContent := getNextLine(state, nextLine)) is not None:
                string += lineContent
                maximum = len(string)
                nextLine += 1
        elif ch == 0x5C:  # /* \ */
            pos += 1
            if (
                pos < maximum
                and charCodeAt(string, pos) == 0x0A
                and (lineContent := getNextLine(state, nextLine)) is not None
            ):
                string += lineContent
                maximum = len(string)
                nextLine += 1
        pos += 1

    if (
        labelEnd is None or labelEnd < 0 or charCodeAt(string, labelEnd + 1) != 0x3A
    ):  # /* : */
        return False

    # [label]:   destination   'title'
    #         ^^^ skip optional whitespace here
    pos = labelEnd + 2
    while pos < maximum:
        ch = charCodeAt(string, pos)
        if ch == 0x0A:
            if (lineContent := getNextLine(state, nextLine)) is not None:
                string += lineContent
                maximum = len(string)
                nextLine += 1
        elif isSpace(ch):
            pass
        else:
            break
        pos += 1

    # [label]:   destination   'title'
    #            ^^^^^^^^^^^ parse this
    destRes = state.md.helpers.parseLinkDestination(string, pos, maximum)
    if not destRes.ok:
        return False

    href = state.md.normalizeLink(destRes.str)
    if not state.md.validateLink(href):
        return False

    pos = destRes.pos

    # save cursor state, we could require to rollback later
    destEndPos = pos
    destEndLineNo = nextLine

    # [label]:   destination   'title'
    #                       ^^^ skipping those spaces
    start = pos
    while pos < maximum:
        ch = charCodeAt(string, pos)
        if ch == 0x0A:
            if (lineContent := getNextLine(state, nextLine)) is not None:
                string += lineContent
                maximum = len(string)
                nextLine += 1
        elif isSpace(ch):
            pass
        else:
            break
        pos += 1

    # [label]:   destination   'title'
    #                          ^^^^^^^ parse this
    titleRes = state.md.helpers.parseLinkTitle(string, pos, maximum, None)
    while titleRes.can_continue:
        if (lineContent := getNextLine(state, nextLine)) is None:
            break
        string += lineContent
        pos = maximum
        maximum = len(string)
        nextLine += 1
        titleRes = state.md.helpers.parseLinkTitle(string, pos, maximum, titleRes)

    if pos < maximum and start != pos and titleRes.ok:
        title = titleRes.str
        pos = titleRes.pos
    else:
        title = ""
        pos = destEndPos
        nextLine = destEndLineNo

    # skip trailing spaces until the rest of the line
    while pos < maximum:
        ch = charCodeAt(string, pos)
        if not isSpace(ch):
            break
        pos += 1

    if pos < maximum and charCodeAt(string, pos) != 0x0A and title:
        # garbage at the end of the line after title,
        # but it could still be a valid reference if we roll back
        title = ""
        pos = destEndPos
        nextLine = destEndLineNo
        while pos < maximum:
            ch = charCodeAt(string, pos)
            if not isSpace(ch):
                break
            pos += 1

    if pos < maximum and charCodeAt(string, pos) != 0x0A:
        # garbage at the end of the line
        return False

    label = normalizeReference(string[1:labelEnd])
    if not label:
        # CommonMark 0.20 disallows empty labels
        return False

    # Reference can not terminate anything. This check is for safety only.
    if silent:
        return True

    if "references" not in state.env:
        state.env["references"] = {}

    state.line = nextLine

    # note, this is not part of markdown-it JS, but is useful for renderers
    if state.md.options.get("inline_definitions", False):
        token = state.push("definition", "", 0)
        token.meta = {
            "id": label,
            "title": title,
            "url": href,
            "label": string[1:labelEnd],
        }
        token.map = [startLine, state.line]

    if label not in state.env["references"]:
        state.env["references"][label] = {
            "title": title,
            "href": href,
            "map": [startLine, state.line],
        }
    else:
        state.env.setdefault("duplicate_refs", []).append(
            {
                "title": title,
                "href": href,
                "label": label,
                "map": [startLine, state.line],
            }
        )

    return True


def getNextLine(state: StateBlock, nextLine: int) -> None | str:
    endLine = state.lineMax

    if nextLine >= endLine or state.isEmpty(nextLine):
        # empty line or end of input
        return None

    isContinuation = False

    # this would be a code block normally, but after paragraph
    # it's considered a lazy continuation regardless of what's there
    if state.is_code_block(nextLine):
        isContinuation = True

    # quirk for blockquotes, this line should already be checked by that rule
    if state.sCount[nextLine] < 0:
        isContinuation = True

    if not isContinuation:
        terminatorRules = state.md.block.ruler.getRules("reference")
        oldParentType = state.parentType
        state.parentType = "reference"

        # Some tags can terminate paragraph without empty line.
        terminate = False
        for terminatorRule in terminatorRules:
            if terminatorRule(state, nextLine, endLine, True):
                terminate = True
                break

        state.parentType = oldParentType

        if terminate:
            # terminated by another block
            return None

    pos = state.bMarks[nextLine] + state.tShift[nextLine]
    maximum = state.eMarks[nextLine]

    # max + 1 explicitly includes the newline
    return state.src[pos : maximum + 1]
