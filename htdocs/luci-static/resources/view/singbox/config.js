'use strict';
'import ui';
'import fs';
'import view';
'import form';

return L.view.extend({
	render: function() {
		var luci_form = L.require('form');
		var luci_fs = L.require('fs');

		return Promise.all([luci_form, luci_fs]).then(L.bind(function(modules) {
			var form = modules;
			var fs = modules;
			var m, s, o;

			m = new form.Map('sing-box', _('Sing-box Bridge'), 
				_('專為 daed 配套設計的內核管理工具。'));

			// --- 1. 內核狀態 ---
			s = m.section(form.TypedSection, '_info', _('內核狀態'));
			s.anonymous = true;
			s.render = L.bind(function() {
				return fs.exec('/usr/bin/sing-box', ['version']).then(function(res) {
					var ver_info = (res.code === 0) ? res.stdout.split('\n') : _('未安裝');
					return E('div', { 'class': 'cbi-value' }, [
						E('label', { 'class': 'cbi-value-title' }, _('版本資訊')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('span', { 'class': 'label', 'style': 'background:#455a64; color:#fff; padding:2px 6px; border-radius:3px;' }, ver_info)
						])
					]);
				});
			}, this);

			// --- 2. 基礎設置 ---
			s = m.section(form.NamedSection, 'main', 'singbox', _('基礎設置'));
			s.addremove = false;

			o = s.option(form.Flag, 'enabled', _('啟用服務'));
			o.rmempty = false;

			o = s.option(form.Value, 'conffile', _('主配置文件路徑'));
			o.placeholder = '/etc/sing-box/config.json';
			o.description = _('Sing-box 啟動時讀取的 JSON 檔案位置');

			// --- 3. 節點配置 (根據你的建議簡化) ---
			s = m.section(form.GridSection, 'node', _('節點配置'));
			s.addremove = true;
			s.nodescriptions = true;
			// 如果沒數據，LuCI 預設會顯示 "Table is empty"，這很直觀

			o = s.option(form.Value, 'name', _('名稱'));
			o.placeholder = _('例如：香港節點');

			o = s.option(form.TextValue, 'config_json', _('配置內容'));
			o.rows = 15;
			o.wrap = 'off';
			o.modalonly = true;
			o.description = _('請在此處貼入該節點的 JSON 配置。');

			return m.render();
		}, this));
	}
});
