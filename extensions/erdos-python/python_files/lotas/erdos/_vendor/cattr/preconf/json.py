"""Preconfigured converters for the stdlib json."""

from erdos._vendor.cattrs.preconf.json import JsonConverter, configure_converter, make_converter

__all__ = ["configure_converter", "JsonConverter", "make_converter"]
