from lotas.erdos._vendor.jedi.inference.cache import inference_state_function_cache


@inference_state_function_cache()
def get_yield_exprs(inference_state, funcdef):
    return list(funcdef.iter_yield_exprs())
