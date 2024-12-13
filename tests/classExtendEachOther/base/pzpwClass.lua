local ____lualib = require('tests/classExtendEachOther/base/lualib_bundle')
local ____pipewrench_fixes = require('tests/classExtendEachOther/base/pipewrench_fixes')
local __TS__Class = ____lualib.__TS__Class
local __PW__BaseClassExtends = ____pipewrench_fixes.__PW__BaseClassExtends
local ____exports = {}

____exports.PzpwClass = __TS__Class()

local PzpwClass = ____exports.PzpwClass
PzpwClass.Type = "PzpwClass"

__PW__BaseClassExtends(PzpwClass)

function PzpwClass.prototype.____constructor(self, x)
    self.x = 0
    self.x = x or 0
end

function PzpwClass.prototype.addX(self, n)
    self.x = self.x + n
end

return ____exports
