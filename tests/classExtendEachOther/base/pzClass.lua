require "tests/classExtendEachOther/base/ISBaseObject"

local PzClass = ISBaseObject:derive("PzClass")

function PzClass:addX(n)
    self.x = self.x + n
end

function PzClass:new(x)
    local o = {}
    setmetatable(o, self)
    self.__index = self

    o.x = x;
    return o
end

-- local pzClass = PzClass:new(100)

return {
    PzClass = PzClass,
}
