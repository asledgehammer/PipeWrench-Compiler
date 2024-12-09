local __cls = require "tests/classExtendEachOther/base/pzClass"
local PzClass = __cls.PzClass

local CustomPzClass = PzClass:derive("CustomPzClass")

function CustomPzClass:addY(n)
    self.y = self.y + n
end

function CustomPzClass:new(x, y)
    local o = {}
    o = PzClass:new(x)
    setmetatable(o, self)
    self.__index = self

    o.y = y
    return o
end

local pzClass1 = PzClass:new(200)
local customPzClass1 = CustomPzClass:new(300, 300)

pzClass1:addX(1)

customPzClass1:addX(1)
customPzClass1:addY(2)

print('PCls-pzClass1.x: ' .. tostring(pzClass1.x))
assert(pzClass1.x == 201)

print('PCls-customPzClass1.x: ' .. tostring(customPzClass1.x))
print('PCls-customPzClass1.y: ' .. tostring(customPzClass1.y))
assert(customPzClass1.x == 301)
assert(customPzClass1.y == 302)

