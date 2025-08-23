#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#
from .._vendor.docstring_to_markdown.google import google_to_markdown, looks_like_google
from .._vendor.docstring_to_markdown.rst import rst_to_markdown
from .epytext import epytext_to_markdown, looks_like_epytext


def convert_docstring(docstring: str) -> str:
    if looks_like_google(docstring):
        return google_to_markdown(docstring)
    if looks_like_epytext(docstring):
        return epytext_to_markdown(docstring)

    return rst_to_markdown(docstring)




















