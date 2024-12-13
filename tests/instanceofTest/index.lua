require "tests/classExtendEachOther/base/ISBaseObject"
local ____lualib = require('tests/classExtendEachOther/base/lualib_bundle')
local ____pipewrench_fixes = require('tests/classExtendEachOther/base/pipewrench_fixes')
local __TS__Class = ____lualib.__TS__Class
local __TS__New = ____lualib.__TS__New
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __TS__InstanceOf = ____lualib.__TS__InstanceOf
local __PW__ClassExtendsPatch = ____pipewrench_fixes.__PW__ClassExtendsPatch

local PzClass1 = ISBaseObject:derive("PzClass1")
local PzClass2 = PzClass1:derive("PzClass2")
function PzClass2:new()
    local o = {}
    setmetatable(o, self)
    self.__index = self
    return o
end

local pzClass2 = PzClass2:new()

assert(__TS__InstanceOf(pzClass2, PzClass2))
print(__TS__InstanceOf(pzClass2, PzClass2))
assert(__TS__InstanceOf(pzClass2, PzClass1))
print(__TS__InstanceOf(pzClass2, PzClass1))
assert(__TS__InstanceOf(pzClass2, ISBaseObject))
print(__TS__InstanceOf(pzClass2, ISBaseObject))

local CustomPzpwClass = __TS__Class()
CustomPzpwClass.Type = "CustomPzpwClass"

__PW__ClassExtendsPatch(CustomPzpwClass, PzClass2)
__TS__ClassExtends(CustomPzpwClass, PzClass2)

function CustomPzpwClass.prototype.____constructor(self, x, y)
    PzClass2.prototype.____constructor(self, x)
    self.y = 0
    self.y = y
end

function CustomPzpwClass.prototype.addY(self, n)
    self.y = self.y + n
end

local customPzpwClass = __TS__New(CustomPzpwClass)

assert(__TS__InstanceOf(customPzpwClass, CustomPzpwClass))
print(__TS__InstanceOf(customPzpwClass, CustomPzpwClass))
assert(__TS__InstanceOf(customPzpwClass, PzClass2))
print(__TS__InstanceOf(customPzpwClass, PzClass2))
assert(__TS__InstanceOf(customPzpwClass, PzClass1))
print(__TS__InstanceOf(customPzpwClass, PzClass1))
