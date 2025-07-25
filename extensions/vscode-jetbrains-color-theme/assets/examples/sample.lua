-- Metatables and coroutines
local function factorial(n)
    if n == 0 then
      return 1
    else
      return n * factorial(n - 1)
    end
  end

  local co = coroutine.create(function()
    for i=1,3 do
      coroutine.yield(i)
    end
  end)

  local mt = {
    __add = function(a, b)
      return Vector.new(a.x + b.x, a.y + b.y)
    end
  }
