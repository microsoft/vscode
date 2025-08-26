from .google import google_to_markdown, looks_like_google
from .rst import looks_like_rst, rst_to_markdown

__version__ = "0.13"


class UnknownFormatError(Exception):
    pass


def convert(docstring: str) -> str:
    if looks_like_rst(docstring):
        return rst_to_markdown(docstring)

    if looks_like_google(docstring):
        return google_to_markdown(docstring)

    raise UnknownFormatError()
