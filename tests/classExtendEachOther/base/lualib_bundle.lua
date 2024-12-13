local function __TS__Class(self)
    local c = { prototype = {} }
    c.prototype.__index = c.prototype
    c.prototype.constructor = c
    return c
end

local function __TS__ClassExtends(target, base)
    target.____super = base;

    local staticMetatable = setmetatable({ __index = base }, base);
    setmetatable(target, staticMetatable);

    local baseMetatable = getmetatable(base);
    if baseMetatable then
        if type(baseMetatable.__index) == "function" then
            staticMetatable.__index = baseMetatable.__index;
        end
        if type(baseMetatable.__newindex) == "function" then
            staticMetatable.__newindex = baseMetatable.__newindex;
        end
    end

    setmetatable(target.prototype, base.prototype);

    if type(base.prototype.__index) == "function" then
        target.prototype.__index = base.prototype.__index;
    end

    if type(base.prototype.__newindex) == "function" then
        target.prototype.__newindex = base.prototype.__newindex;
    end

    if type(base.prototype.__tostring) == "function" then
        target.prototype.__tostring = base.prototype.__tostring;
    end
end

local function __TS__New(target, ...)
    local instance = setmetatable({}, target.prototype)
    instance:____constructor(...)
    return instance
end

local __TS__Symbol, Symbol
do
    local symbolMetatable = {
        __tostring = function(self)
            return ("Symbol(" .. (self.description or "")) .. ")"
        end
    }
    function __TS__Symbol(description)
        return setmetatable({ description = description }, symbolMetatable)
    end

    Symbol = {
        asyncDispose = __TS__Symbol("Symbol.asyncDispose"),
        dispose = __TS__Symbol("Symbol.dispose"),
        iterator = __TS__Symbol("Symbol.iterator"),
        hasInstance = __TS__Symbol("Symbol.hasInstance"),
        species = __TS__Symbol("Symbol.species"),
        toStringTag = __TS__Symbol("Symbol.toStringTag")
    }
end

require "tests/classExtendEachOther/base/ISBaseObject"
ISBaseObject[Symbol.hasInstance] = function(classTbl, obj)
    if type(obj) == "table" then
        local luaClass = obj.constructor or getmetatable(obj)
        while luaClass ~= nil do
            if luaClass == classTbl then
                return true
            end
            luaClass = luaClass.____super or getmetatable(luaClass)
        end
    end
    return false
end
local function __TS__InstanceOf(obj, classTbl)
    if type(classTbl) ~= "table" then
        error("Right-hand side of 'instanceof' is not an object", 0)
    end
    if classTbl[Symbol.hasInstance] ~= nil then
        return not not classTbl[Symbol.hasInstance](classTbl, obj)
    end
    if type(obj) == "table" then
        local luaClass = obj.constructor
        while luaClass ~= nil do
            if luaClass == classTbl then
                return true
            end
            luaClass = luaClass.____super
        end
    end
    return false
end

return {
    __TS__Class = __TS__Class,
    __TS__ClassExtends = __TS__ClassExtends,
    __TS__New = __TS__New,
    __TS__InstanceOf = __TS__InstanceOf,
    __TS__Symbol = __TS__Symbol,
    Symbol = Symbol,
}
