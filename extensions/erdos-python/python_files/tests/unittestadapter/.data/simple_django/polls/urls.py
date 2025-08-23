# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from django.urls import path

from . import views

urlpatterns = [
    # ex: /polls/
    path("", views.index, name="index"),
]
