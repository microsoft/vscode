"""
This is not a plugin, this is just the place were plugins are registered.
"""

from lotas.erdos._vendor.jedi.plugins import stdlib
from lotas.erdos._vendor.jedi.plugins import flask
from lotas.erdos._vendor.jedi.plugins import pytest
from lotas.erdos._vendor.jedi.plugins import django
from lotas.erdos._vendor.jedi.plugins import plugin_manager


plugin_manager.register(stdlib, flask, pytest, django)
