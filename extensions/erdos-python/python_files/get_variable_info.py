# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See LICENSE in the project root
# for license information.

import locale
import sys
from typing import ClassVar


# this class is from in ptvsd/debugpy tools
class SafeRepr(object):  # noqa: UP004
    # Can be used to override the encoding from locale.getpreferredencoding()
    locale_preferred_encoding = None

    # Can be used to override the encoding used for sys.stdout.encoding
    sys_stdout_encoding = None

    # String types are truncated to maxstring_outer when at the outer-
    # most level, and truncated to maxstring_inner characters inside
    # collections.
    maxstring_outer = 2**16
    maxstring_inner = 128
    string_types = (str, bytes)
    bytes = bytes
    set_info = (set, "{", "}", False)
    frozenset_info = (frozenset, "frozenset({", "})", False)
    int_types = (int,)
    long_iter_types = (list, tuple, bytearray, range, dict, set, frozenset)

    # Collection types are recursively iterated for each limit in
    # maxcollection.
    maxcollection = (60, 20)

    # Specifies type, prefix string, suffix string, and whether to include a
    # comma if there is only one element. (Using a sequence rather than a
    # mapping because we use isinstance() to determine the matching type.)
    collection_types = [  # noqa: RUF012
        (tuple, "(", ")", True),
        (list, "[", "]", False),
        frozenset_info,
        set_info,
    ]
    try:
        from collections import deque

        collection_types.append((deque, "deque([", "])", False))
    except Exception:
        pass

    # type, prefix string, suffix string, item prefix string,
    # item key/value separator, item suffix string
    dict_types: ClassVar[list] = [(dict, "{", "}", "", ": ", "")]
    try:
        from collections import OrderedDict

        dict_types.append((OrderedDict, "OrderedDict([", "])", "(", ", ", ")"))
    except Exception:
        pass

    # All other types are treated identically to strings, but using
    # different limits.
    maxother_outer = 2**16
    maxother_inner = 128

    convert_to_hex = False
    raw_value = False

    def __call__(self, obj):
        """
        :param object obj:
            The object for which we want a representation.

        :return str:
            Returns bytes encoded as utf-8 on py2 and str on py3.
        """  # noqa: D205
        try:
            return "".join(self._repr(obj, 0))
        except Exception:
            try:
                return f"An exception was raised: {sys.exc_info()[1]!r}"
            except Exception:
                return "An exception was raised"

    def _repr(self, obj, level):
        """Returns an iterable of the parts in the final repr string."""
        try:
            obj_repr = type(obj).__repr__
        except Exception:
            obj_repr = None

        def has_obj_repr(t):
            r = t.__repr__
            try:
                return obj_repr == r
            except Exception:
                return obj_repr is r

        for t, prefix, suffix, comma in self.collection_types:
            if isinstance(obj, t) and has_obj_repr(t):
                return self._repr_iter(obj, level, prefix, suffix, comma)

        for (
            t,
            prefix,
            suffix,
            item_prefix,
            item_sep,
            item_suffix,
        ) in self.dict_types:
            if isinstance(obj, t) and has_obj_repr(t):
                return self._repr_dict(
                    obj, level, prefix, suffix, item_prefix, item_sep, item_suffix
                )

        for t in self.string_types:
            if isinstance(obj, t) and has_obj_repr(t):
                return self._repr_str(obj, level)

        if self._is_long_iter(obj):
            return self._repr_long_iter(obj)

        return self._repr_other(obj, level)

    # Determines whether an iterable exceeds the limits set in
    # maxlimits, and is therefore unsafe to repr().
    def _is_long_iter(self, obj, level=0):
        try:
            # Strings have their own limits (and do not nest). Because
            # they don't have __iter__ in 2.x, this check goes before
            # the next one.
            if isinstance(obj, self.string_types):
                return len(obj) > self.maxstring_inner

            # If it's not an iterable (and not a string), it's fine.
            if not hasattr(obj, "__iter__"):
                return False

            # If it's not an instance of these collection types then it
            # is fine. Note: this is a fix for
            # https://github.com/Microsoft/ptvsd/issues/406
            if not isinstance(obj, self.long_iter_types):
                return False

            # Iterable is its own iterator - this is a one-off iterable
            # like generator or enumerate(). We can't really count that,
            # but repr() for these should not include any elements anyway,
            # so we can treat it the same as non-iterables.
            if obj is iter(obj):
                return False

            # range reprs fine regardless of length.
            if isinstance(obj, range):
                return False

            # numpy and scipy collections (ndarray etc) have
            # self-truncating repr, so they're always safe.
            try:
                module = type(obj).__module__.partition(".")[0]
                if module in ("numpy", "scipy"):
                    return False
            except Exception:
                pass

            # Iterables that nest too deep are considered long.
            if level >= len(self.maxcollection):
                return True

            # It is too long if the length exceeds the limit, or any
            # of its elements are long iterables.
            if hasattr(obj, "__len__"):
                try:
                    size = len(obj)
                except Exception:
                    size = None
                if size is not None and size > self.maxcollection[level]:
                    return True
                return any(self._is_long_iter(item, level + 1) for item in obj)
            return any(
                i > self.maxcollection[level] or self._is_long_iter(item, level + 1)
                for i, item in enumerate(obj)
            )

        except Exception:
            # If anything breaks, assume the worst case.
            return True

    def _repr_iter(self, obj, level, prefix, suffix, comma_after_single_element=False):  # noqa: FBT002
        yield prefix

        if level >= len(self.maxcollection):
            yield "..."
        else:
            count = self.maxcollection[level]
            yield_comma = False
            for item in obj:
                if yield_comma:
                    yield ", "
                yield_comma = True

                count -= 1
                if count <= 0:
                    yield "..."
                    break

                yield from self._repr(item, 100 if item is obj else level + 1)
            else:
                if comma_after_single_element:  # noqa: SIM102
                    if count == self.maxcollection[level] - 1:
                        yield ","
        yield suffix

    def _repr_long_iter(self, obj):
        try:
            length = hex(len(obj)) if self.convert_to_hex else len(obj)
            obj_repr = f"<{type(obj).__name__}, len() = {length}>"
        except Exception:
            try:
                obj_repr = "<" + type(obj).__name__ + ">"
            except Exception:
                obj_repr = "<no repr available for object>"
        yield obj_repr

    def _repr_dict(self, obj, level, prefix, suffix, item_prefix, item_sep, item_suffix):
        if not obj:
            yield prefix + suffix
            return
        if level >= len(self.maxcollection):
            yield prefix + "..." + suffix
            return

        yield prefix

        count = self.maxcollection[level]
        yield_comma = False

        obj_keys = list(obj)

        for key in obj_keys:
            if yield_comma:
                yield ", "
            yield_comma = True

            count -= 1
            if count <= 0:
                yield "..."
                break

            yield item_prefix
            for p in self._repr(key, level + 1):
                yield p

            yield item_sep

            try:
                item = obj[key]
            except Exception:
                yield "<?>"
            else:
                for p in self._repr(item, 100 if item is obj else level + 1):
                    yield p
            yield item_suffix

        yield suffix

    def _repr_str(self, obj, level):
        try:
            if self.raw_value:
                # For raw value retrieval, ignore all limits.
                if isinstance(obj, bytes):
                    yield obj.decode("latin-1")
                else:
                    yield obj
                return

            limit_inner = self.maxother_inner
            limit_outer = self.maxother_outer
            limit = limit_inner if level > 0 else limit_outer
            if len(obj) <= limit:
                # Note that we check the limit before doing the repr (so, the final string
                # may actually be considerably bigger on some cases, as besides
                # the additional u, b, ' chars, some chars may be escaped in repr, so
                # even a single char such as \U0010ffff may end up adding more
                # chars than expected).
                yield self._convert_to_unicode_or_bytes_repr(repr(obj))
                return

            # Slightly imprecise calculations - we may end up with a string that is
            # up to 6 characters longer than limit. If you need precise formatting,
            # you are using the wrong class.
            left_count, right_count = max(1, int(2 * limit / 3)), max(1, int(limit / 3))

            # Important: only do repr after slicing to avoid duplicating a byte array that could be
            # huge.

            # Note: we don't deal with high surrogates here because we're not dealing with the
            # repr() of a random object.
            # i.e.: A high surrogate unicode char may be splitted on Py2, but as we do a `repr`
            # afterwards, that's ok.

            # Also, we just show the unicode/string/bytes repr() directly to make clear what the
            # input type was (so, on py2 a unicode would start with u' and on py3 a bytes would
            # start with b').

            part1 = obj[:left_count]
            part1 = repr(part1)
            part1 = part1[: part1.rindex("'")]  # Remove the last '

            part2 = obj[-right_count:]
            part2 = repr(part2)
            part2 = part2[part2.index("'") + 1 :]  # Remove the first ' (and possibly u or b).

            yield part1
            yield "..."
            yield part2
        except:  # noqa: E722
            # This shouldn't really happen, but let's play it safe.
            # exception('Error getting string representation to show.')
            yield from self._repr_obj(obj, level, self.maxother_inner, self.maxother_outer)

    def _repr_other(self, obj, level):
        return self._repr_obj(obj, level, self.maxother_inner, self.maxother_outer)

    def _repr_obj(self, obj, level, limit_inner, limit_outer):
        try:
            if self.raw_value:
                # For raw value retrieval, ignore all limits.
                if isinstance(obj, bytes):
                    yield obj.decode("latin-1")
                    return

                try:
                    mv = memoryview(obj)
                except Exception:
                    yield self._convert_to_unicode_or_bytes_repr(repr(obj))
                    return
                else:
                    # Map bytes to Unicode codepoints with same values.
                    yield mv.tobytes().decode("latin-1")
                    return
            elif self.convert_to_hex and isinstance(obj, self.int_types):
                obj_repr = hex(obj)
            else:
                obj_repr = repr(obj)
        except Exception:
            try:
                obj_repr = object.__repr__(obj)
            except Exception:
                try:
                    obj_repr = "<no repr available for " + type(obj).__name__ + ">"
                except Exception:
                    obj_repr = "<no repr available for object>"

        limit = limit_inner if level > 0 else limit_outer

        if limit >= len(obj_repr):
            yield self._convert_to_unicode_or_bytes_repr(obj_repr)
            return

        # Slightly imprecise calculations - we may end up with a string that is
        # up to 3 characters longer than limit. If you need precise formatting,
        # you are using the wrong class.
        left_count, right_count = max(1, int(2 * limit / 3)), max(1, int(limit / 3))

        yield obj_repr[:left_count]
        yield "..."
        yield obj_repr[-right_count:]

    def _convert_to_unicode_or_bytes_repr(self, obj_repr):
        return obj_repr

    def _bytes_as_unicode_if_possible(self, obj_repr):
        # We try to decode with 3 possible encoding (sys.stdout.encoding,
        # locale.getpreferredencoding() and 'utf-8). If no encoding can decode
        # the input, we return the original bytes.
        try_encodings = []
        encoding = self.sys_stdout_encoding or getattr(sys.stdout, "encoding", None)
        if encoding:
            try_encodings.append(encoding.lower())

        preferred_encoding = self.locale_preferred_encoding or locale.getpreferredencoding()
        if preferred_encoding:
            preferred_encoding = preferred_encoding.lower()
            if preferred_encoding not in try_encodings:
                try_encodings.append(preferred_encoding)

        if "utf-8" not in try_encodings:
            try_encodings.append("utf-8")

        for encoding in try_encodings:
            try:
                return obj_repr.decode(encoding)
            except UnicodeDecodeError:  # noqa: PERF203
                pass

        return obj_repr  # Return the original version (in bytes)


class DisplayOptions:
    def __init__(self, width, max_columns):
        self.width = width
        self.max_columns = max_columns


_safe_repr = SafeRepr()
_collection_types = ["list", "tuple", "set"]
_array_page_size = 50


def _get_value(variable):
    return _safe_repr(variable)


def _get_property_names(variable):
    props = []
    private_props = []
    for prop in dir(variable):
        if not prop.startswith("_"):
            props.append(prop)
        elif not prop.startswith("__"):
            private_props.append(prop)
    return props + private_props


def _get_full_type(var_type):
    module = ""
    if hasattr(var_type, "__module__") and var_type.__module__ != "builtins":
        module = var_type.__module__ + "."
    if hasattr(var_type, "__qualname__"):
        return module + var_type.__qualname__
    elif hasattr(var_type, "__name__"):
        return module + var_type.__name__
    return None


def _get_variable_description(variable):
    result = {}

    var_type = type(variable)
    result["type"] = _get_full_type(var_type)
    if hasattr(var_type, "__mro__"):
        result["interfaces"] = [_get_full_type(t) for t in var_type.__mro__]

    if hasattr(variable, "__len__") and result["type"] in _collection_types:
        result["count"] = len(variable)

    result["hasNamedChildren"] = hasattr(variable, "__dict__") or isinstance(variable, dict)

    result["value"] = _get_value(variable)
    return result


def _get_child_property(root, property_chain):
    try:
        variable = root
        for prop in property_chain:
            if isinstance(prop, int):
                if hasattr(variable, "__getitem__"):
                    variable = variable[prop]
                elif isinstance(variable, set):
                    variable = list(variable)[prop]
                else:
                    return None
            elif hasattr(variable, prop):
                variable = getattr(variable, prop)
            elif isinstance(variable, dict) and prop in variable:
                variable = variable[prop]
            else:
                return None
    except Exception:
        return None

    return variable


types_to_exclude = ["module", "function", "method", "class", "type"]


### Get info on variables at the root level
def getVariableDescriptions():  # noqa: N802
    return [
        {
            "name": varName,
            **_get_variable_description(globals()[varName]),
            "root": varName,
            "propertyChain": [],
            "language": "python",
        }
        for varName in globals()
        if type(globals()[varName]).__name__ not in types_to_exclude
        and not varName.startswith("__")
    ]


### Get info on children of a variable reached through the given property chain
def getAllChildrenDescriptions(root_var_name, property_chain, start_index):  # noqa: N802
    root = globals()[root_var_name]
    if root is None:
        return []

    parent = root
    if len(property_chain) > 0:
        parent = _get_child_property(root, property_chain)

    children = []
    parent_info = _get_variable_description(parent)
    if "count" in parent_info:
        if parent_info["count"] > 0:
            last_item = min(parent_info["count"], start_index + _array_page_size)
            index_range = range(start_index, last_item)
            children = [
                {
                    **_get_variable_description(_get_child_property(parent, [i])),
                    "name": str(i),
                    "root": root_var_name,
                    "propertyChain": [*property_chain, i],
                    "language": "python",
                }
                for i in index_range
            ]
    elif parent_info["hasNamedChildren"]:
        children_names = []
        if hasattr(parent, "__dict__"):
            children_names = _get_property_names(parent)
        elif isinstance(parent, dict):
            children_names = list(parent.keys())

        children = []
        for prop in children_names:
            child_property = _get_child_property(parent, [prop])
            if child_property is not None and type(child_property).__name__ not in types_to_exclude:
                child = {
                    **_get_variable_description(child_property),
                    "name": prop,
                    "root": root_var_name,
                    "propertyChain": [*property_chain, prop],
                }
                children.append(child)

    return children
