"""Preconfigured converters for bson."""

from erdos._vendor.cattrs.preconf.bson import BsonConverter, configure_converter, make_converter

__all__ = ["BsonConverter", "configure_converter", "make_converter"]
