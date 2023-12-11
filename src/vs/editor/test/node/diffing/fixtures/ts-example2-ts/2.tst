function cloneTypeReference(source: TypeReference): TypeReference {
    const type = <TypeReference>createType(source.flags);
    type.symbol = source.symbol;
    type.objectFlags = source.objectFlags;
    type.target = source.target;
    type.resolvedTypeArguments = source.resolvedTypeArguments;
    return type;
}

function createDeferredTypeReference(): DeferredTypeReference {
    const aliasSymbol = getAliasSymbolForTypeNode(node);
    const aliasTypeArguments = getTypeArgumentsForAliasSymbol(aliasSymbol);
    type.target = target;
    type.node = node;
    type.mapper = mapper;
    type.aliasSymbol = aliasSymbol;
    return type;
}

function getTypeArguments(type: TypeReference): ReadonlyArray<Type> {
    if (!type.resolvedTypeArguments) {
        const node = type.node;
    }
    return type.resolvedTypeArguments;
}