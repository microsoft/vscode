# n-queens (nqueens) solver, for nsquaresx-by-nsquaresy board

struct Queen
    x::Int
    y::Int
end
hitshorz(queena, queenb) = queena.x == queenb.x
hitsvert(queena, queenb) = queena.y == queenb.y
hitsdiag(queena, queenb) = abs(queena.x - queenb.x) == abs(queena.y - queenb.y)
hitshvd(qa, qb) = hitshorz(qa, qb) || hitsvert(qa, qb) || hitsdiag(qa, qb)
hitsany(testqueen, queens) = any(q -> hitshvd(testqueen, q), queens)

function trysolve(nsquaresx, nsquaresy, nqueens, presqueens = ())
    nqueens == 0 && return presqueens
    for xsquare in 1:nsquaresx
        for ysquare in 1:nsquaresy
            testqueen = Queen(xsquare, ysquare)
            if !hitsany(testqueen, presqueens)
                tryqueens = (presqueens..., testqueen)
                maybesol = trysolve(nsquaresx, nsquaresy, nqueens - 1, tryqueens)
                maybesol !== nothing && return maybesol
            end
        end
    end
    return nothing
end
