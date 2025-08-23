"""Line-cache functionality."""

import linecache
from typing import List


def generate_unique_filename(cls: type, func_name: str, lines: List[str] = []) -> str:
    """
    Create a "filename" suitable for a function being generated.

    If *lines* are provided, insert them in the first free spot or stop
    if a duplicate is found.
    """
    extra = ""
    count = 1

    while True:
        unique_filename = "<cattrs generated {} {}.{}{}>".format(
            func_name, cls.__module__, getattr(cls, "__qualname__", cls.__name__), extra
        )
        if not lines:
            return unique_filename
        cache_line = (len("\n".join(lines)), None, lines, unique_filename)
        if linecache.cache.setdefault(unique_filename, cache_line) == cache_line:
            return unique_filename

        # Looks like this spot is taken. Try again.
        count += 1
        extra = f"-{count}"
