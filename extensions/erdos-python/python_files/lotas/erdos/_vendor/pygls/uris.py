############################################################################
# Original work Copyright 2017 Palantir Technologies, Inc.                 #
# Original work licensed under the MIT License.                            #
# See ThirdPartyNotices.txt in the project root for license information.   #
# All modifications Copyright (c) Open Law Library. All rights reserved.   #
#                                                                          #
# Licensed under the Apache License, Version 2.0 (the "License")           #
# you may not use this file except in compliance with the License.         #
# You may obtain a copy of the License at                                  #
#                                                                          #
#     http: // www.apache.org/licenses/LICENSE-2.0                         #
#                                                                          #
# Unless required by applicable law or agreed to in writing, software      #
# distributed under the License is distributed on an "AS IS" BASIS,        #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. #
# See the License for the specific language governing permissions and      #
# limitations under the License.                                           #
############################################################################
"""
A collection of URI utilities with logic built on the VSCode URI library.

https://github.com/Microsoft/vscode-uri/blob/e59cab84f5df6265aed18ae5f43552d3eef13bb9/lib/index.ts
"""
from typing import Optional, Tuple

import re
from urllib import parse

from erdos._vendor.pygls import IS_WIN

RE_DRIVE_LETTER_PATH = re.compile(r"^\/[a-zA-Z]:")

URLParts = Tuple[str, str, str, str, str, str]


def _normalize_win_path(path: str):
    netloc = ""

    # normalize to fwd-slashes on windows,
    # on other systems bwd-slashes are valid
    # filename character, eg /f\oo/ba\r.txt
    if IS_WIN:
        path = path.replace("\\", "/")

    # check for authority as used in UNC shares
    # or use the path as given
    if path[:2] == "//":
        idx = path.index("/", 2)
        if idx == -1:
            netloc = path[2:]
        else:
            netloc = path[2:idx]
            path = path[idx:]

    # Ensure that path starts with a slash
    # or that it is at least a slash
    if not path.startswith("/"):
        path = "/" + path

    # Normalize drive paths to lower case
    if RE_DRIVE_LETTER_PATH.match(path):
        path = path[0] + path[1].lower() + path[2:]

    return path, netloc


def from_fs_path(path: str):
    """Returns a URI for the given filesystem path."""
    try:
        scheme = "file"
        params, query, fragment = "", "", ""
        path, netloc = _normalize_win_path(path)
        return urlunparse((scheme, netloc, path, params, query, fragment))
    except (AttributeError, TypeError):
        return None


def to_fs_path(uri: str):
    """
    Returns the filesystem path of the given URI.

    Will handle UNC paths and normalize windows drive letters to lower-case.
    Also uses the platform specific path separator. Will *not* validate the
    path for invalid characters and semantics.
    Will *not* look at the scheme of this URI.
    """
    try:
        # scheme://netloc/path;parameters?query#fragment
        scheme, netloc, path, _, _, _ = urlparse(uri)

        if netloc and path and scheme == "file":
            # unc path: file://shares/c$/far/boo
            value = f"//{netloc}{path}"

        elif RE_DRIVE_LETTER_PATH.match(path):
            # windows drive letter: file:///C:/far/boo
            value = path[1].lower() + path[2:]

        else:
            # Other path
            value = path

        if IS_WIN:
            value = value.replace("/", "\\")

        return value
    except TypeError:
        return None


def uri_scheme(uri: str):
    try:
        return urlparse(uri)[0]
    except (TypeError, IndexError):
        return None


# TODO: Use `URLParts` type
def uri_with(
    uri: str,
    scheme: Optional[str] = None,
    netloc: Optional[str] = None,
    path: Optional[str] = None,
    params: Optional[str] = None,
    query: Optional[str] = None,
    fragment: Optional[str] = None,
):
    """
    Return a URI with the given part(s) replaced.
    Parts are decoded / encoded.
    """
    old_scheme, old_netloc, old_path, old_params, old_query, old_fragment = urlparse(
        uri
    )

    if path is None:
        raise Exception("`path` must not be None")

    path, _ = _normalize_win_path(path)
    return urlunparse(
        (
            scheme or old_scheme,
            netloc or old_netloc,
            path or old_path,
            params or old_params,
            query or old_query,
            fragment or old_fragment,
        )
    )


def urlparse(uri: str):
    """Parse and decode the parts of a URI."""
    scheme, netloc, path, params, query, fragment = parse.urlparse(uri)
    return (
        parse.unquote(scheme),
        parse.unquote(netloc),
        parse.unquote(path),
        parse.unquote(params),
        parse.unquote(query),
        parse.unquote(fragment),
    )


def urlunparse(parts: URLParts) -> str:
    """Unparse and encode parts of a URI."""
    scheme, netloc, path, params, query, fragment = parts

    # Avoid encoding the windows drive letter colon
    if RE_DRIVE_LETTER_PATH.match(path):
        quoted_path = path[:3] + parse.quote(path[3:])
    else:
        quoted_path = parse.quote(path)

    return parse.urlunparse(
        (
            parse.quote(scheme),
            parse.quote(netloc),
            quoted_path,
            parse.quote(params),
            parse.quote(query),
            parse.quote(fragment),
        )
    )
