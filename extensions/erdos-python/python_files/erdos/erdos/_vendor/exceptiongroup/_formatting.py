# traceback_exception_init() adapted from trio
#
# _ExceptionPrintContext and traceback_exception_format() copied from the standard
# library
from __future__ import annotations

import collections.abc
import sys
import textwrap
import traceback
from functools import singledispatch
from types import TracebackType
from typing import Any, List, Optional

from ._exceptions import BaseExceptionGroup

max_group_width = 15
max_group_depth = 10
_cause_message = (
    "\nThe above exception was the direct cause of the following exception:\n\n"
)

_context_message = (
    "\nDuring handling of the above exception, another exception occurred:\n\n"
)


def _format_final_exc_line(etype, value):
    valuestr = _safe_string(value, "exception")
    if value is None or not valuestr:
        line = f"{etype}\n"
    else:
        line = f"{etype}: {valuestr}\n"

    return line


def _safe_string(value, what, func=str):
    try:
        return func(value)
    except BaseException:
        return f"<{what} {func.__name__}() failed>"


class _ExceptionPrintContext:
    def __init__(self):
        self.seen = set()
        self.exception_group_depth = 0
        self.need_close = False

    def indent(self):
        return " " * (2 * self.exception_group_depth)

    def emit(self, text_gen, margin_char=None):
        if margin_char is None:
            margin_char = "|"
        indent_str = self.indent()
        if self.exception_group_depth:
            indent_str += margin_char + " "

        if isinstance(text_gen, str):
            yield textwrap.indent(text_gen, indent_str, lambda line: True)
        else:
            for text in text_gen:
                yield textwrap.indent(text, indent_str, lambda line: True)


def exceptiongroup_excepthook(
    etype: type[BaseException], value: BaseException, tb: TracebackType | None
) -> None:
    sys.stderr.write("".join(traceback.format_exception(etype, value, tb)))


class PatchedTracebackException(traceback.TracebackException):
    def __init__(
        self,
        exc_type: type[BaseException],
        exc_value: BaseException,
        exc_traceback: TracebackType | None,
        *,
        limit: int | None = None,
        lookup_lines: bool = True,
        capture_locals: bool = False,
        compact: bool = False,
        _seen: set[int] | None = None,
    ) -> None:
        kwargs: dict[str, Any] = {}
        if sys.version_info >= (3, 10):
            kwargs["compact"] = compact

        is_recursive_call = _seen is not None
        if _seen is None:
            _seen = set()
        _seen.add(id(exc_value))

        self.stack = traceback.StackSummary.extract(
            traceback.walk_tb(exc_traceback),
            limit=limit,
            lookup_lines=lookup_lines,
            capture_locals=capture_locals,
        )
        self.exc_type = exc_type
        # Capture now to permit freeing resources: only complication is in the
        # unofficial API _format_final_exc_line
        self._str = _safe_string(exc_value, "exception")
        try:
            self.__notes__ = getattr(exc_value, "__notes__", None)
        except KeyError:
            # Workaround for https://github.com/python/cpython/issues/98778 on Python
            # <= 3.9, and some 3.10 and 3.11 patch versions.
            HTTPError = getattr(sys.modules.get("urllib.error", None), "HTTPError", ())
            if sys.version_info[:2] <= (3, 11) and isinstance(exc_value, HTTPError):
                self.__notes__ = None
            else:
                raise

        if exc_type and issubclass(exc_type, SyntaxError):
            # Handle SyntaxError's specially
            self.filename = exc_value.filename
            lno = exc_value.lineno
            self.lineno = str(lno) if lno is not None else None
            self.text = exc_value.text
            self.offset = exc_value.offset
            self.msg = exc_value.msg
            if sys.version_info >= (3, 10):
                end_lno = exc_value.end_lineno
                self.end_lineno = str(end_lno) if end_lno is not None else None
                self.end_offset = exc_value.end_offset
        elif (
            exc_type
            and issubclass(exc_type, (NameError, AttributeError))
            and getattr(exc_value, "name", None) is not None
        ):
            suggestion = _compute_suggestion_error(exc_value, exc_traceback)
            if suggestion:
                self._str += f". Did you mean: '{suggestion}'?"

        if lookup_lines:
            # Force all lines in the stack to be loaded
            for frame in self.stack:
                frame.line

        self.__suppress_context__ = (
            exc_value.__suppress_context__ if exc_value is not None else False
        )

        # Convert __cause__ and __context__ to `TracebackExceptions`s, use a
        # queue to avoid recursion (only the top-level call gets _seen == None)
        if not is_recursive_call:
            queue = [(self, exc_value)]
            while queue:
                te, e = queue.pop()

                if e and e.__cause__ is not None and id(e.__cause__) not in _seen:
                    cause = PatchedTracebackException(
                        type(e.__cause__),
                        e.__cause__,
                        e.__cause__.__traceback__,
                        limit=limit,
                        lookup_lines=lookup_lines,
                        capture_locals=capture_locals,
                        _seen=_seen,
                    )
                else:
                    cause = None

                if compact:
                    need_context = (
                        cause is None and e is not None and not e.__suppress_context__
                    )
                else:
                    need_context = True
                if (
                    e
                    and e.__context__ is not None
                    and need_context
                    and id(e.__context__) not in _seen
                ):
                    context = PatchedTracebackException(
                        type(e.__context__),
                        e.__context__,
                        e.__context__.__traceback__,
                        limit=limit,
                        lookup_lines=lookup_lines,
                        capture_locals=capture_locals,
                        _seen=_seen,
                    )
                else:
                    context = None

                # Capture each of the exceptions in the ExceptionGroup along with each
                # of their causes and contexts
                if e and isinstance(e, BaseExceptionGroup):
                    exceptions = []
                    for exc in e.exceptions:
                        texc = PatchedTracebackException(
                            type(exc),
                            exc,
                            exc.__traceback__,
                            lookup_lines=lookup_lines,
                            capture_locals=capture_locals,
                            _seen=_seen,
                        )
                        exceptions.append(texc)
                else:
                    exceptions = None

                te.__cause__ = cause
                te.__context__ = context
                te.exceptions = exceptions
                if cause:
                    queue.append((te.__cause__, e.__cause__))
                if context:
                    queue.append((te.__context__, e.__context__))
                if exceptions:
                    queue.extend(zip(te.exceptions, e.exceptions))

    def format(self, *, chain=True, _ctx=None):
        if _ctx is None:
            _ctx = _ExceptionPrintContext()

        output = []
        exc = self
        if chain:
            while exc:
                if exc.__cause__ is not None:
                    chained_msg = _cause_message
                    chained_exc = exc.__cause__
                elif exc.__context__ is not None and not exc.__suppress_context__:
                    chained_msg = _context_message
                    chained_exc = exc.__context__
                else:
                    chained_msg = None
                    chained_exc = None

                output.append((chained_msg, exc))
                exc = chained_exc
        else:
            output.append((None, exc))

        for msg, exc in reversed(output):
            if msg is not None:
                yield from _ctx.emit(msg)
            if exc.exceptions is None:
                if exc.stack:
                    yield from _ctx.emit("Traceback (most recent call last):\n")
                    yield from _ctx.emit(exc.stack.format())
                yield from _ctx.emit(exc.format_exception_only())
            elif _ctx.exception_group_depth > max_group_depth:
                # exception group, but depth exceeds limit
                yield from _ctx.emit(f"... (max_group_depth is {max_group_depth})\n")
            else:
                # format exception group
                is_toplevel = _ctx.exception_group_depth == 0
                if is_toplevel:
                    _ctx.exception_group_depth += 1

                if exc.stack:
                    yield from _ctx.emit(
                        "Exception Group Traceback (most recent call last):\n",
                        margin_char="+" if is_toplevel else None,
                    )
                    yield from _ctx.emit(exc.stack.format())

                yield from _ctx.emit(exc.format_exception_only())
                num_excs = len(exc.exceptions)
                if num_excs <= max_group_width:
                    n = num_excs
                else:
                    n = max_group_width + 1
                _ctx.need_close = False
                for i in range(n):
                    last_exc = i == n - 1
                    if last_exc:
                        # The closing frame may be added by a recursive call
                        _ctx.need_close = True

                    if max_group_width is not None:
                        truncated = i >= max_group_width
                    else:
                        truncated = False
                    title = f"{i + 1}" if not truncated else "..."
                    yield (
                        _ctx.indent()
                        + ("+-" if i == 0 else "  ")
                        + f"+---------------- {title} ----------------\n"
                    )
                    _ctx.exception_group_depth += 1
                    if not truncated:
                        yield from exc.exceptions[i].format(chain=chain, _ctx=_ctx)
                    else:
                        remaining = num_excs - max_group_width
                        plural = "s" if remaining > 1 else ""
                        yield from _ctx.emit(
                            f"and {remaining} more exception{plural}\n"
                        )

                    if last_exc and _ctx.need_close:
                        yield _ctx.indent() + "+------------------------------------\n"
                        _ctx.need_close = False
                    _ctx.exception_group_depth -= 1

                if is_toplevel:
                    assert _ctx.exception_group_depth == 1
                    _ctx.exception_group_depth = 0

    def format_exception_only(self):
        """Format the exception part of the traceback.
        The return value is a generator of strings, each ending in a newline.
        Normally, the generator emits a single string; however, for
        SyntaxError exceptions, it emits several lines that (when
        printed) display detailed information about where the syntax
        error occurred.
        The message indicating which exception occurred is always the last
        string in the output.
        """
        if self.exc_type is None:
            yield traceback._format_final_exc_line(None, self._str)
            return

        stype = self.exc_type.__qualname__
        smod = self.exc_type.__module__
        if smod not in ("__main__", "builtins"):
            if not isinstance(smod, str):
                smod = "<unknown>"
            stype = smod + "." + stype

        if not issubclass(self.exc_type, SyntaxError):
            yield _format_final_exc_line(stype, self._str)
        elif traceback_exception_format_syntax_error is not None:
            yield from traceback_exception_format_syntax_error(self, stype)
        else:
            yield from traceback_exception_original_format_exception_only(self)

        if isinstance(self.__notes__, collections.abc.Sequence):
            for note in self.__notes__:
                note = _safe_string(note, "note")
                yield from [line + "\n" for line in note.split("\n")]
        elif self.__notes__ is not None:
            yield _safe_string(self.__notes__, "__notes__", func=repr)


traceback_exception_original_format = traceback.TracebackException.format
traceback_exception_original_format_exception_only = (
    traceback.TracebackException.format_exception_only
)
traceback_exception_format_syntax_error = getattr(
    traceback.TracebackException, "_format_syntax_error", None
)
if sys.excepthook is sys.__excepthook__:
    traceback.TracebackException.__init__ = (  # type: ignore[assignment]
        PatchedTracebackException.__init__
    )
    traceback.TracebackException.format = (  # type: ignore[assignment]
        PatchedTracebackException.format
    )
    traceback.TracebackException.format_exception_only = (  # type: ignore[assignment]
        PatchedTracebackException.format_exception_only
    )
    sys.excepthook = exceptiongroup_excepthook

# Ubuntu's system Python has a sitecustomize.py file that imports
# apport_python_hook and replaces sys.excepthook.
#
# The custom hook captures the error for crash reporting, and then calls
# sys.__excepthook__ to actually print the error.
#
# We don't mind it capturing the error for crash reporting, but we want to
# take over printing the error. So we monkeypatch the apport_python_hook
# module so that instead of calling sys.__excepthook__, it calls our custom
# hook.
#
# More details: https://github.com/python-trio/trio/issues/1065
if getattr(sys.excepthook, "__name__", None) in (
    "apport_excepthook",
    # on ubuntu 22.10 the hook was renamed to partial_apport_excepthook
    "partial_apport_excepthook",
):
    # patch traceback like above
    traceback.TracebackException.__init__ = (  # type: ignore[assignment]
        PatchedTracebackException.__init__
    )
    traceback.TracebackException.format = (  # type: ignore[assignment]
        PatchedTracebackException.format
    )
    traceback.TracebackException.format_exception_only = (  # type: ignore[assignment]
        PatchedTracebackException.format_exception_only
    )

    from types import ModuleType

    import apport_python_hook

    # monkeypatch the sys module that apport has imported
    fake_sys = ModuleType("exceptiongroup_fake_sys")
    fake_sys.__dict__.update(sys.__dict__)
    fake_sys.__excepthook__ = exceptiongroup_excepthook
    apport_python_hook.sys = fake_sys


@singledispatch
def format_exception_only(__exc: BaseException) -> List[str]:
    return list(
        PatchedTracebackException(
            type(__exc), __exc, None, compact=True
        ).format_exception_only()
    )


@format_exception_only.register
def _(__exc: type, value: BaseException) -> List[str]:
    return format_exception_only(value)


@singledispatch
def format_exception(
    __exc: BaseException,
    limit: Optional[int] = None,
    chain: bool = True,
) -> List[str]:
    return list(
        PatchedTracebackException(
            type(__exc), __exc, __exc.__traceback__, limit=limit, compact=True
        ).format(chain=chain)
    )


@format_exception.register
def _(
    __exc: type,
    value: BaseException,
    tb: TracebackType,
    limit: Optional[int] = None,
    chain: bool = True,
) -> List[str]:
    return format_exception(value, limit, chain)


@singledispatch
def print_exception(
    __exc: BaseException,
    limit: Optional[int] = None,
    file: Any = None,
    chain: bool = True,
) -> None:
    if file is None:
        file = sys.stderr

    for line in PatchedTracebackException(
        type(__exc), __exc, __exc.__traceback__, limit=limit
    ).format(chain=chain):
        print(line, file=file, end="")


@print_exception.register
def _(
    __exc: type,
    value: BaseException,
    tb: TracebackType,
    limit: Optional[int] = None,
    file: Any = None,
    chain: bool = True,
) -> None:
    print_exception(value, limit, file, chain)


def print_exc(
    limit: Optional[int] = None,
    file: Any | None = None,
    chain: bool = True,
) -> None:
    value = sys.exc_info()[1]
    print_exception(value, limit, file, chain)


# Python levenshtein edit distance code for NameError/AttributeError
# suggestions, backported from 3.12

_MAX_CANDIDATE_ITEMS = 750
_MAX_STRING_SIZE = 40
_MOVE_COST = 2
_CASE_COST = 1
_SENTINEL = object()


def _substitution_cost(ch_a, ch_b):
    if ch_a == ch_b:
        return 0
    if ch_a.lower() == ch_b.lower():
        return _CASE_COST
    return _MOVE_COST


def _compute_suggestion_error(exc_value, tb):
    wrong_name = getattr(exc_value, "name", None)
    if wrong_name is None or not isinstance(wrong_name, str):
        return None
    if isinstance(exc_value, AttributeError):
        obj = getattr(exc_value, "obj", _SENTINEL)
        if obj is _SENTINEL:
            return None
        obj = exc_value.obj
        try:
            d = dir(obj)
        except Exception:
            return None
    else:
        assert isinstance(exc_value, NameError)
        # find most recent frame
        if tb is None:
            return None
        while tb.tb_next is not None:
            tb = tb.tb_next
        frame = tb.tb_frame

        d = list(frame.f_locals) + list(frame.f_globals) + list(frame.f_builtins)
    if len(d) > _MAX_CANDIDATE_ITEMS:
        return None
    wrong_name_len = len(wrong_name)
    if wrong_name_len > _MAX_STRING_SIZE:
        return None
    best_distance = wrong_name_len
    suggestion = None
    for possible_name in d:
        if possible_name == wrong_name:
            # A missing attribute is "found". Don't suggest it (see GH-88821).
            continue
        # No more than 1/3 of the involved characters should need changed.
        max_distance = (len(possible_name) + wrong_name_len + 3) * _MOVE_COST // 6
        # Don't take matches we've already beaten.
        max_distance = min(max_distance, best_distance - 1)
        current_distance = _levenshtein_distance(
            wrong_name, possible_name, max_distance
        )
        if current_distance > max_distance:
            continue
        if not suggestion or current_distance < best_distance:
            suggestion = possible_name
            best_distance = current_distance
    return suggestion


def _levenshtein_distance(a, b, max_cost):
    # A Python implementation of Python/suggestions.c:levenshtein_distance.

    # Both strings are the same
    if a == b:
        return 0

    # Trim away common affixes
    pre = 0
    while a[pre:] and b[pre:] and a[pre] == b[pre]:
        pre += 1
    a = a[pre:]
    b = b[pre:]
    post = 0
    while a[: post or None] and b[: post or None] and a[post - 1] == b[post - 1]:
        post -= 1
    a = a[: post or None]
    b = b[: post or None]
    if not a or not b:
        return _MOVE_COST * (len(a) + len(b))
    if len(a) > _MAX_STRING_SIZE or len(b) > _MAX_STRING_SIZE:
        return max_cost + 1

    # Prefer shorter buffer
    if len(b) < len(a):
        a, b = b, a

    # Quick fail when a match is impossible
    if (len(b) - len(a)) * _MOVE_COST > max_cost:
        return max_cost + 1

    # Instead of producing the whole traditional len(a)-by-len(b)
    # matrix, we can update just one row in place.
    # Initialize the buffer row
    row = list(range(_MOVE_COST, _MOVE_COST * (len(a) + 1), _MOVE_COST))

    result = 0
    for bindex in range(len(b)):
        bchar = b[bindex]
        distance = result = bindex * _MOVE_COST
        minimum = sys.maxsize
        for index in range(len(a)):
            # 1) Previous distance in this row is cost(b[:b_index], a[:index])
            substitute = distance + _substitution_cost(bchar, a[index])
            # 2) cost(b[:b_index], a[:index+1]) from previous row
            distance = row[index]
            # 3) existing result is cost(b[:b_index+1], a[index])

            insert_delete = min(result, distance) + _MOVE_COST
            result = min(insert_delete, substitute)

            # cost(b[:b_index+1], a[:index+1])
            row[index] = result
            if result < minimum:
                minimum = result
        if minimum > max_cost:
            # Everything in this row is too big, so bail early.
            return max_cost + 1
    return result
