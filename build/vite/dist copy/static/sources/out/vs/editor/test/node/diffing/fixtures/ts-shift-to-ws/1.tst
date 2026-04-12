const childEndsAfterEnd = lengthGreaterThanEqual(nodeOffsetEnd, endOffset);
if (childEndsAfterEnd) {
    // No child after this child in the requested window, don't recurse
    node = child;
    level++;
    continue whileLoop;
}

const shouldContinue = collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, push, level + 1, levelPerBracketType);
if (!shouldContinue) {
    return false;
}