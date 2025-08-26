"""Preconfigured converters for the stdlib json."""

from cattrs.preconf.json import JsonConverter, configure_converter, make_converter

__all__ = ["configure_converter", "JsonConverter", "make_converter"]
