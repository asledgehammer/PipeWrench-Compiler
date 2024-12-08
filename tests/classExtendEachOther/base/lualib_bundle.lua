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

return {
    __TS__Class = __TS__Class,
    __TS__ClassExtends = __TS__ClassExtends,
    __TS__New = __TS__New,
}
