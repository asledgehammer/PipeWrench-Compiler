local ____lualib = require('tests/classExtendEachOther/base/lualib_bundle')
local ____pipewrench_fixes = require('tests/classExtendEachOther/base/pipewrench_fixes')
local __TS__Class = ____lualib.__TS__Class
local __TS__New = ____lualib.__TS__New
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __PW__ClassExtendsPatch = ____pipewrench_fixes.__PW__ClassExtendsPatch

local __pzClass = require('tests/classExtendEachOther/base/pzClass')
local PzClass = __pzClass.PzClass

local Pz2PzpwClass = __TS__Class()
Pz2PzpwClass.Type = "Pz2PzpwClass"

__PW__ClassExtendsPatch(Pz2PzpwClass, PzClass)
__TS__ClassExtends(Pz2PzpwClass, PzClass)

function Pz2PzpwClass.prototype.____constructor(self, x, y)
    PzClass.prototype.____constructor(self, x)
    self.y = 0
    self.y = y
end

function Pz2PzpwClass.prototype.addY(self, n)
    self.y = self.y + n
end

local pzClass1 = __TS__New(PzClass, 200, 200)
local pz2PzpwClass1 = __TS__New(Pz2PzpwClass, 300, 300)

pzClass1:addX(1)

pz2PzpwClass1:addX(1)
pz2PzpwClass1:addY(2)

print('Pz-PzpwCls-pzClass1.x: ' .. tostring(pzClass1.x))
assert(pzClass1.x == 201)

print('Pz-PzpwCls-pz2PzpwClass1.x: ' .. tostring(pz2PzpwClass1.x))
print('Pz-PzpwCls-pz2PzpwClass1.y: ' .. tostring(pz2PzpwClass1.y))
assert(pz2PzpwClass1.x == 301)
assert(pz2PzpwClass1.y == 302)
