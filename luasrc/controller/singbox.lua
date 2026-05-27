-- luasrc/controller/singbox.lua
module("luci.controller.singbox", package.seeall)

function index()
    -- 这里的路径 admin/services/singbox 必须和 JSON 中的 key 对应
    entry({"admin", "services", "singbox"}, firstchild(), _("Sing-box Bridge"), 50).dependent = false
    
    -- 对应你的 js 文件加载
    entry({"admin", "services", "singbox", "config"}, template("cbi/null"), nil).leaf = true
end
