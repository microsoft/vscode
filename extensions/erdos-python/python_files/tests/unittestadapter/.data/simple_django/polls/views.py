# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
from django.http import HttpResponse
from .models import Question  # noqa: F401

def index(request):
    return HttpResponse("Hello, world. You're at the polls index.")
