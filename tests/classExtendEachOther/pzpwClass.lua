local ____lualib = require('tests/classExtendEachOther/base/lualib_bundle')
local ____pipewrench_fixes = require('tests/classExtendEachOther/base/pipewrench_fixes')
local __TS__Class = ____lualib.__TS__Class
local __TS__New = ____lualib.__TS__New
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __PW__ClassExtendsPatch = ____pipewrench_fixes.__PW__ClassExtendsPatch

local __PzpwClass = require('tests/classExtendEachOther/base/pzpwClass')
local PzpwClass = __PzpwClass.PzpwClass

local CustomPzpwClass = __TS__Class()
CustomPzpwClass.Type = "CustomPzpwClass"

__PW__ClassExtendsPatch(CustomPzpwClass, PzpwClass)
__TS__ClassExtends(CustomPzpwClass, PzpwClass)

function CustomPzpwClass.prototype.____constructor(self, x, y)
    PzpwClass.prototype.____constructor(self, x)
    self.y = 0
    self.y = y
end

function CustomPzpwClass.prototype.derive(self, type)
    local __Cls = __TS__Class()
    __Cls.name = type
    __Cls.Type = type
    __TS__ClassExtends(__Cls, self)
    return __Cls
end

function CustomPzpwClass.prototype.new(self, ...)
    return __TS__New(self, ...)
end

function CustomPzpwClass.prototype.addY(self, n)
    self.y = self.y + n
end

local pzpwClass = __TS__New(PzpwClass, 200, 200)
local customPzpwClass = __TS__New(CustomPzpwClass, 300, 300)

pzpwClass:addX(1)

customPzpwClass:addX(1)
customPzpwClass:addY(2)

print('PpCls-pzpwClass.x: ' .. tostring(pzpwClass.x))
assert(pzpwClass.x == 201)

print('PpCls-customPzpwClass.x: ' .. tostring(customPzpwClass.x))
print('PpCls-customPzpwClass.y: ' .. tostring(customPzpwClass.y))
assert(customPzpwClass.x == 301)
assert(customPzpwClass.y == 302)
