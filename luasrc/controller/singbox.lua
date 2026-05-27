module("luci.controller.singbox", package.seeall)

function index()
    -- 创建菜单入口
    entry({"admin", "services", "singbox"}, firstchild(), _("Sing-box Bridge"), 50).dependent = false
    
    -- 使用 template 挂载你的 config.htm，它会自动通过 <script> 标签加载 config.js
    entry({"admin", "services", "singbox", "config"}, template("singbox/config"), nil).leaf = true
end
