    public async Task DeleteBasketAsync(int basketId)
    {
        var basket = await _basketRepository.GetByIdAsync(basketId);
        Guard.Against.Null(basket, nameof(basket));
        await _basketRepository.DeleteAsync(basket);
    }