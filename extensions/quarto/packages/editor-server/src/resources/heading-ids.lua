---@diagnostic disable: undefined-global

local ids = pandoc.List()

function Pandoc(doc)
  io.stdout:write(table.concat(ids, '\n'))
  io.stdout:write('\n')
  doc.blocks = pandoc.List()
  return doc
end

function Header(el)
  if string.len(el.attr.identifier) > 0 then
    ids:insert('#' .. el.attr.identifier)
  end
end

function Link(el)
  if string.len(el.target) > 1 and string.sub(el.target, 1, 1) == '#' then
    ids:insert(el.target)
  end
end
