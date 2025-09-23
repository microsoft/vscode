---@diagnostic disable: undefined-global
-- parser.lua

-------------------------------------------------------------------------------
-- JSON Encode
-------------------------------------------------------------------------------

local encode

local escape_char_map = {
  [ "\\" ] = "\\",
  [ "\"" ] = "\"",
  [ "\b" ] = "b",
  [ "\f" ] = "f",
  [ "\n" ] = "n",
  [ "\r" ] = "r",
  [ "\t" ] = "t",
}

local escape_char_map_inv = { [ "/" ] = "/" }
for k, v in pairs(escape_char_map) do
  escape_char_map_inv[v] = k
end


local function escape_char(c)
  return "\\" .. (escape_char_map[c] or string.format("u%04x", c:byte()))
end


local function encode_nil(val)
  return "null"
end

local function encode_string(val)
  return '"' .. val:gsub('[%z\1-\31\\"]', escape_char) .. '"'
end

local function encode_table(val, stack)
  local res = {}
  stack = stack or {}

  -- Circular reference?
  if stack[val] then error("circular reference") end

  stack[val] = true

  local n = 0
  local types = {}

  for k in pairs(val) do
    types[type(k)] = true
  end

  if #types > 1 then
    error("invalid table: mixed or invalid key types")
  elseif types["number"] then
    -- Treat as array
    local max_key = 0
    for k in pairs(val) do
      if k > max_key then
        max_key = k
      end
    end
    for i = 1, max_key do
      if val[i] == nil then
        table.insert(res, "null")
      else
        local v = encode(val[i], stack)
        table.insert(res, v)
      end
    end
    stack[val] = nil
    return "[" .. table.concat(res, ",") .. "]"
  elseif types["string"] then
    -- Treat as object
    for k, v in pairs(val) do
      table.insert(res, encode_string(k) .. ":" .. encode(v, stack))
    end
    stack[val] = nil
    return "{" .. table.concat(res, ",") .. "}"
  else
    return "[]"
  end
end

local function encode_number(val)
  -- Check for NaN, -inf and inf
  if val ~= val or val <= -math.huge or val >= math.huge then
    error("unexpected number value '" .. tostring(val) .. "'")
  end
  return string.format("%.14g", val)
end


local type_func_map = {
  [ "nil"     ] = encode_nil,
  [ "table"   ] = encode_table,
  [ "string"  ] = encode_string,
  [ "number"  ] = encode_number,
  [ "boolean" ] = tostring,
}


encode = function(val, stack)
  local t = type(val)
  local f = type_func_map[t]
  if f then
    return f(val, stack)
  end
  error("unexpected type '" .. t .. "'")
end


local function jsonEncode(val)
  return ( encode(val) )
end



local tokens = pandoc.List()

local supportedTokens = pandoc.List{
  "BlockQuote",
  "BulletList",
  "CodeBlock",
  "Div",
  "Header",
  "HorizontalRule",
  "OrderedList",
  "Para",
  "RawBlock",
  "Table",
  "Math"
}

local function isSupportedToken(type)
  return supportedTokens:includes(type)
end

local function attrEmpty(attr)
  return #attr[1] == 0 and #attr[2] == 0 and #attr[3] == 0
end

local function extractAttrAndPos(el)
  -- clone
  local attr = el.attr:clone()

  -- eliminate duplicate attributes
  local attributes = {}
  for k,v in pairs(attr.attributes) do
    attributes[k] = v
  end

  -- record and remove pos
  local pos = attributes["data-pos"]
  attributes["data-pos"] = nil

  -- return attr and pos
  return { attr.identifier, attr.classes, attributes }, pos
end

local function extractToken(el)

  -- get type, attr, and position
  local type = el.t
  local attr, pos = extractAttrAndPos(el)

  -- if there is no position then bail
  if pos == nil then
    return
  end

  -- if this is a span or div with a single child without attributes
  -- then unwrap the underlying element type
  if (type == "Span" or type == "Div") and
      #el.content == 1 and el.content[1].attr == nil then
    el = el.content[1]
    type = el.t
  end

  -- mask out types we don't care about
  if not isSupportedToken(type) then
    return
  end

  -- parse position
  local _,_,beginLine,beginChar,endLine,endChar = string.find(pos, "@?(%d+):(%d+)-(%d+):(%d+)$")
  if beginLine and beginChar and endLine and endChar then
    
    -- universal token info (type and range)
    local token = {
      type = type,
      range = {
        start = {
          line = tonumber(beginLine) - 1,
          character = tonumber(beginChar) - 1
        },
        ["end"] = {
          line = tonumber(endLine) - 1,
          character = tonumber(endChar) - 1
        }
      }
    }

    -- attributes if we have any
    if not attrEmpty(attr) then
      token["attr"] = attr
    end

    -- special 'data' for some types
    if type == "Header" then
      token["data"] = {
        level = el.level,
        text = pandoc.utils.stringify(el)
      }
    elseif type == "CodeBlock" then
      token["data"] = el.text

    elseif type == "Math" then
      token["data"] = {
        type = el.mathtype,
        text = el.text
      }
    elseif type == "RawBlock" then
      token["data"] = {
        format = el.format,
        text = el.text
      }
    else
      token["data"] = nil
    end

    -- insert token
    tokens:insert(token)
  end
  
end

return {
  {
    -- blocks
    Div = extractToken,
    Table = extractToken,
    Heading = extractToken,
    CodeBlock = extractToken,
    Figure = extractToken,
    Header = extractToken,

    -- inlines
    Span = extractToken
  },
  {
    Pandoc = function(doc)
      -- order tokens
      tokens:sort(function (a, b) 
        if a.range.start.line == b.range.start.line then
          if a.range["end"].line == b.range["end"].line then
            if a.range.start.character == b.range.start.character then
              return a.range["end"].character > b.range["end"].character
            else
              return a.range.start.character < b.range.start.character
            end
          else
            return a.range["end"].line > b.range["end"].line
          end
        else
          return a.range.start.line < b.range.start.line
        end
      end)
    
      -- return doc
      doc.blocks = pandoc.List({ pandoc.RawBlock("plain", jsonEncode(tokens)) })
      return doc
    end
  }
}
