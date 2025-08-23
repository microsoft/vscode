from django.shortcuts import render
from django.template import loader


def index(request):
    context = {
        'value_from_server':'this_is_a_value_from_server', 
        'another_value_from_server':'this_is_another_value_from_server'
    }
    return render(request, 'index.html', context)
