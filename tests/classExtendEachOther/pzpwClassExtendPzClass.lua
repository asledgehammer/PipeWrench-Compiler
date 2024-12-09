local ____lualib = require('tests/classExtendEachOther/base/lualib_bundle')
local ____pipewrench_fixes = require('lua/pipewrench_fixes')
local __TS__Class = ____lualib.__TS__Class
local __TS__New = ____lualib.__TS__New
local __TS__ClassExtends = ____lualib.__TS__ClassExtends
local __PW__ClassPatch = ____pipewrench_fixes.__PW__ClassPatch
local __PW__ClassExtendsPatch = ____pipewrench_fixes.__PW__ClassExtendsPatch

local __PzpwClass = require('tests/classExtendEachOther/base/pzpwClass')
local PzpwClass = __PzpwClass.PzpwClass

local Pz2PzpwClass = __TS__Class()
Pz2PzpwClass.name = "Pz2PzpwClass"
__PW__ClassPatch(Pz2PzpwClass)

__PW__ClassExtendsPatch(Pz2PzpwClass, PzpwClass)
__TS__ClassExtends(Pz2PzpwClass, PzpwClass)

function Pz2PzpwClass.prototype.____constructor(self, x, y)
    PzpwClass.prototype.____constructor(self, x)
    self.y = 0
    self.y = y
end

function Pz2PzpwClass.prototype.addY(self, n)
    self.y = self.y + n
end

local pzpwClass1 = __TS__New(PzpwClass, 200, 200)
local pz2PzpwClass1 = __TS__New(Pz2PzpwClass, 300, 300)

pzpwClass1:addX(1)

pz2PzpwClass1:addX(1)
pz2PzpwClass1:addY(2)

print('Pz-PzpwCls-pzpwClass1.x: ' .. tostring(pzpwClass1.x))
assert(pzpwClass1.x == 201)

print('Pz-PzpwCls-pz2PzpwClass1.x: ' .. tostring(pz2PzpwClass1.x))
print('Pz-PzpwCls-pz2PzpwClass1.y: ' .. tostring(pz2PzpwClass1.y))
assert(pz2PzpwClass1.x == 301)
assert(pz2PzpwClass1.y == 302)
