local ____lualib = require('lualib_bundle')
local __TS__Class = ____lualib.__TS__Class
local __TS__New = ____lualib.__TS__New
local __TS__ClassExtends = ____lualib.__TS__ClassExtends

-- insert before ts class extends
local function __PW__ClassExtendsPatch(target, base)
    -- PZ fix
    -- if base is pz class, then add ts class prop
    if base.prototype == nil and base.Type then
        base.prototype = base
        base.prototype.constructor = base;
    end
end

local function derive(self, type)
    local __Cls = __TS__Class()
    __Cls.name = type
    __Cls.Type = type

    __PW__ClassExtendsPatch(__Cls, self)
    __TS__ClassExtends(__Cls, self)
    return __Cls
end

local function new(self, ...)
    return __TS__New(self, ...)
end

-- top level base class, like Object class in js or ISBaseObject class in pz
local __PW__BaseClass = __TS__Class()
__PW__BaseClass.name = '__PW__BaseClass'
__PW__BaseClass.Type = __PW__BaseClass.name
__PW__BaseClass.prototype.derive = derive
__PW__BaseClass.prototype.new = new

-- insert after ts class name set
local function __PW__ClassPatch(cls)
    cls.Type = cls.name
end

-- add
local function __PW__BaseClassExtends(cls)
    -- if cls not extend other class, then extend base class
    -- to get the implementation of derive and new
    __TS__ClassExtends(cls, __PW__BaseClass)
end

return {
    __PW__ClassExtendsPatch = __PW__ClassExtendsPatch,
    __PW__ClassPatch = __PW__ClassPatch,
    -- expose base class for third-party modification
    __PW__BaseClass = __PW__BaseClass,
    __PW__BaseClassExtends = __PW__BaseClassExtends,
}
