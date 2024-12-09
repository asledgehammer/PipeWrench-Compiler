local __cls = require "tests/classExtendEachOther/base/pzClass"
local PzClass = __cls.PzClass

local Pzpw2PzClass = PzClass:derive("Pzpw2PzClass")

function Pzpw2PzClass:addY(n)
    self.y = self.y + n
end

function Pzpw2PzClass:new(x, y)
    local o = {}
    o = PzClass:new(x)
    setmetatable(o, self)
    self.__index = self

    o.y = y
    return o
end

local pzClass1 = PzClass:new(200)
local pzpw2PzClass1 = Pzpw2PzClass:new(300, 300)

pzClass1:addX(1)

pzpw2PzClass1:addX(1)
pzpw2PzClass1:addY(2)

print('Pzpw-PzCls-pzClass1.x: ' .. tostring(pzClass1.x))
assert(pzClass1.x == 201)

print('Pzpw-PzCls-pzpw2PzClass1.x: ' .. tostring(pzpw2PzClass1.x))
print('Pzpw-PzCls-pzpw2PzClass1.y: ' .. tostring(pzpw2PzClass1.y))
assert(pzpw2PzClass1.x == 301)
assert(pzpw2PzClass1.y == 302)
